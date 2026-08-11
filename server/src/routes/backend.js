import { Router } from 'express';
import Game from '../models/Game.js';
import User from '../models/User.js';
import Leaderboard from '../models/Leaderboard.js';
import GameConfig from '../models/GameConfig.js';
import { requireAuth, requireApproved } from '../middleware/auth.js';
import { verifyGameHmac } from '../middleware/gameHmac.js';
import { generateSecret, issueSessionToken, isTimestampFresh } from '../services/gameSecret.js';
import { GAME_DEV_TOKEN_TTL_S, signGameToken } from '../services/gameToken.js';
import { rateLimitMiddleware, clientIp } from '../services/rateLimiter.js';
import { generateServerBridge } from '../services/codegen.js';

const router = Router();

const KEY_RE = /^[a-z0-9][a-z0-9_-]*$/;
const CONFIG_KEY_RE = /^[a-z0-9][a-z0-9_.-]*$/;

function isOwner(game, userId) {
  return game.ownerId.toString() === String(userId);
}

function isAuthorized(game, userId) {
  if (isOwner(game, userId)) return true;
  return game.collaborators.some((c) => (c._id ?? c).toString() === String(userId));
}

function timestampMilliseconds(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return timestampMilliseconds(numeric);
    return Date.parse(value);
  }
  return NaN;
}

// JWT timestamps have one-second precision. Move the marker to a strictly
// later second on every issuance so a same-second reissue revokes its parent.
export function nextV2DevTokenIssuedAt(previous, now = Date.now()) {
  const nowMilliseconds = timestampMilliseconds(now);
  const nowSeconds = Number.isFinite(nowMilliseconds)
    ? Math.floor(nowMilliseconds / 1000)
    : Math.floor(Date.now() / 1000);
  const previousMilliseconds = timestampMilliseconds(previous);
  const previousSeconds = Number.isFinite(previousMilliseconds)
    ? Math.floor(previousMilliseconds / 1000)
    : -1;
  return Math.max(nowSeconds, previousSeconds + 1);
}

async function loadAuthorizedGame(req, res) {
  const game = await Game.findById(req.params.gameId);
  if (!game || !isAuthorized(game, req.user.sub)) {
    res.status(404).json({ error: 'Game not found' });
    return null;
  }
  return game;
}

// ── Dashboard: backend settings ────────────────────────────────────────────────

router.get('/:gameId/backend', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await loadAuthorizedGame(req, res);
    if (!game) return;

    const [leaderboards, config] = await Promise.all([
      Leaderboard.find({ gameId: game._id }).select('-entries').sort({ createdAt: 1 }),
      GameConfig.find({ gameId: game._id }).sort({ createdAt: 1 }),
    ]);

    res.json({
      serverBackend: game.serverBackend,
      leaderboards,
      config,
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:gameId/backend', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await loadAuthorizedGame(req, res);
    if (!game) return;

    const { leaderboardEnabled, configEnabled, v2Enabled, cloudSaveEnabled } = req.body ?? {};
    if (!game.serverBackend) game.serverBackend = {};
    if (leaderboardEnabled !== undefined) game.serverBackend.leaderboardEnabled = Boolean(leaderboardEnabled);
    if (configEnabled !== undefined) game.serverBackend.configEnabled = Boolean(configEnabled);
    if (v2Enabled !== undefined) game.serverBackend.v2Enabled = Boolean(v2Enabled);
    if (cloudSaveEnabled !== undefined) game.serverBackend.cloudSaveEnabled = Boolean(cloudSaveEnabled);
    await game.save();
    res.json({ serverBackend: game.serverBackend });
  } catch (err) {
    next(err);
  }
});

router.post('/:gameId/backend/v2/dev-token', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await loadAuthorizedGame(req, res);
    if (!game) return;

    // requireApproved checks the account status, but fetch the current user
    // again so a renamed account is reflected in every newly issued token.
    const user = await User.findById(req.user.sub).select('name');
    if (!user) return res.status(401).json({ error: 'User not found' });

    if (!game.serverBackend) game.serverBackend = {};
    const issuedAtSeconds = nextV2DevTokenIssuedAt(game.serverBackend.v2DevTokenIssuedAt);
    game.serverBackend.v2DevTokenIssuedAt = new Date(issuedAtSeconds * 1000);
    await game.save();

    const token = signGameToken({
      userId: req.user.sub,
      gameId: game._id,
      displayName: user.name,
      dev: true,
      issuedAt: issuedAtSeconds,
    });
    const expiresAt = new Date((issuedAtSeconds + GAME_DEV_TOKEN_TTL_S) * 1000).toISOString();
    res.json({ token, expiresAt });
  } catch (err) {
    next(err);
  }
});

router.post('/:gameId/backend/secret/rotate', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await Game.findOne({ _id: req.params.gameId, ownerId: req.user.sub });
    if (!game) return res.status(404).json({ error: 'Game not found' });

    game.serverBackend.secret = generateSecret();
    game.serverBackend.secretRotatedAt = new Date();
    await game.save();
    res.json({ secret: game.serverBackend.secret, secretRotatedAt: game.serverBackend.secretRotatedAt });
  } catch (err) {
    next(err);
  }
});

router.get('/:gameId/backend/generated-code', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await loadAuthorizedGame(req, res);
    if (!game) return;
    if (!game.serverBackend?.secret) {
      return res.status(400).json({ error: 'Rotate a secret for this game before generating code' });
    }

    const [leaderboards, config] = await Promise.all([
      Leaderboard.find({ gameId: game._id, enabled: true }).select('-entries'),
      GameConfig.find({ gameId: game._id, enabled: true }),
    ]);

    const generated = generateServerBridge(game, { leaderboards, config });
    res.json(generated);
  } catch (err) {
    next(err);
  }
});

// ── Dashboard: leaderboard management ──────────────────────────────────────────

router.post('/:gameId/backend/leaderboards', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await loadAuthorizedGame(req, res);
    if (!game) return;

    const { key, label, sort, maxEntries, scoreMin, scoreMax } = req.body ?? {};
    if (!key || typeof key !== 'string' || !KEY_RE.test(key)) {
      return res.status(400).json({ error: 'key must match ^[a-z0-9][a-z0-9_-]*$' });
    }

    const leaderboard = await Leaderboard.create({
      gameId: game._id,
      key,
      label: label ? String(label).slice(0, 60) : '',
      sort: sort === 'asc' ? 'asc' : 'desc',
      maxEntries: Math.min(100, Math.max(1, Number(maxEntries) || 10)),
      scoreMin: scoreMin === undefined || scoreMin === null || scoreMin === '' ? null : Number(scoreMin),
      scoreMax: scoreMax === undefined || scoreMax === null || scoreMax === '' ? null : Number(scoreMax),
    });
    res.status(201).json({ leaderboard });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'A leaderboard with this key already exists' });
    next(err);
  }
});

router.patch('/:gameId/backend/leaderboards/:lbId', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await loadAuthorizedGame(req, res);
    if (!game) return;

    const leaderboard = await Leaderboard.findOne({ _id: req.params.lbId, gameId: game._id });
    if (!leaderboard) return res.status(404).json({ error: 'Leaderboard not found' });

    const { label, sort, maxEntries, scoreMin, scoreMax, enabled } = req.body ?? {};
    if (label !== undefined) leaderboard.label = String(label).slice(0, 60);
    if (sort !== undefined) leaderboard.sort = sort === 'asc' ? 'asc' : 'desc';
    if (maxEntries !== undefined) leaderboard.maxEntries = Math.min(100, Math.max(1, Number(maxEntries) || 10));
    if (scoreMin !== undefined) leaderboard.scoreMin = scoreMin === null || scoreMin === '' ? null : Number(scoreMin);
    if (scoreMax !== undefined) leaderboard.scoreMax = scoreMax === null || scoreMax === '' ? null : Number(scoreMax);
    if (enabled !== undefined) leaderboard.enabled = Boolean(enabled);

    // Re-trim + re-sort entries if maxEntries or sort direction changed.
    const sortMult = leaderboard.sort === 'asc' ? 1 : -1;
    leaderboard.entries = [...leaderboard.entries]
      .sort((a, b) => (a.score - b.score) * sortMult)
      .slice(0, leaderboard.maxEntries);

    await leaderboard.save();
    res.json({ leaderboard });
  } catch (err) {
    next(err);
  }
});

router.delete('/:gameId/backend/leaderboards/:lbId', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await loadAuthorizedGame(req, res);
    if (!game) return;

    await Leaderboard.deleteOne({ _id: req.params.lbId, gameId: game._id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/:gameId/backend/leaderboards/:lbId/entries', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await loadAuthorizedGame(req, res);
    if (!game) return;

    const leaderboard = await Leaderboard.findOne({ _id: req.params.lbId, gameId: game._id });
    if (!leaderboard) return res.status(404).json({ error: 'Leaderboard not found' });
    res.json({ entries: leaderboard.entries });
  } catch (err) {
    next(err);
  }
});

router.delete('/:gameId/backend/leaderboards/:lbId/entries/:entryId', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await loadAuthorizedGame(req, res);
    if (!game) return;

    const leaderboard = await Leaderboard.findOneAndUpdate(
      { _id: req.params.lbId, gameId: game._id },
      { $pull: { entries: { _id: req.params.entryId } } },
      { new: true },
    );
    if (!leaderboard) return res.status(404).json({ error: 'Leaderboard not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Dashboard: config management ───────────────────────────────────────────────

router.post('/:gameId/backend/config', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await loadAuthorizedGame(req, res);
    if (!game) return;

    const { key, value } = req.body ?? {};
    if (!key || typeof key !== 'string' || !CONFIG_KEY_RE.test(key)) {
      return res.status(400).json({ error: 'key must match ^[a-z0-9][a-z0-9_.-]*$' });
    }
    if (typeof value !== 'string') return res.status(400).json({ error: 'value must be a JSON string' });
    try {
      JSON.parse(value);
    } catch {
      return res.status(400).json({ error: 'value must be valid JSON' });
    }

    const config = await GameConfig.create({ gameId: game._id, key, value });
    res.status(201).json({ config });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'A config key with this name already exists' });
    next(err);
  }
});

router.patch('/:gameId/backend/config/:cfgId', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await loadAuthorizedGame(req, res);
    if (!game) return;

    const config = await GameConfig.findOne({ _id: req.params.cfgId, gameId: game._id });
    if (!config) return res.status(404).json({ error: 'Config key not found' });

    const { value, enabled } = req.body ?? {};
    if (value !== undefined) {
      if (typeof value !== 'string') return res.status(400).json({ error: 'value must be a JSON string' });
      try {
        JSON.parse(value);
      } catch {
        return res.status(400).json({ error: 'value must be valid JSON' });
      }
      config.value = value;
    }
    if (enabled !== undefined) config.enabled = Boolean(enabled);
    await config.save();
    res.json({ config });
  } catch (err) {
    next(err);
  }
});

router.delete('/:gameId/backend/config/:cfgId', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await loadAuthorizedGame(req, res);
    if (!game) return;

    await GameConfig.deleteOne({ _id: req.params.cfgId, gameId: game._id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Public: handshake ──────────────────────────────────────────────────────────

router.post(
  '/play/:gameSlug/backend/handshake',
  rateLimitMiddleware({ limit: 30, windowMs: 60_000, keyFn: (req) => `handshake:${clientIp(req)}:${req.params.gameSlug}` }),
  async (req, res, next) => {
    try {
      const game = await Game.findOne({ slug: req.params.gameSlug });
      if (!game) return res.status(404).json({ error: 'Game not found' });
      if (!game.serverBackend?.secret || (!game.serverBackend.leaderboardEnabled && !game.serverBackend.configEnabled)) {
        return res.status(403).json({ error: 'Server backend not enabled for this game' });
      }

      const { ts } = req.body ?? {};
      if (!isTimestampFresh(ts)) return res.status(400).json({ error: 'Invalid or stale timestamp' });

      const session = issueSessionToken(game);
      res.json({ sessionToken: session.token, expiresIn: session.expiresIn });
    } catch (err) {
      next(err);
    }
  },
);

// ── Public: leaderboard submit / read ──────────────────────────────────────────

router.post(
  '/play/:gameSlug/backend/leaderboard/:key/submit',
  rateLimitMiddleware({ limit: 20, windowMs: 60_000, keyFn: (req) => `submit:${clientIp(req)}:${req.params.gameSlug}` }),
  verifyGameHmac({ requireFeature: 'leaderboardEnabled', consumeNonce: true }),
  async (req, res, next) => {
    try {
      const { name, score, meta } = req.body ?? {};
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name is required' });
      }
      if (typeof score !== 'number' || !Number.isFinite(score)) {
        return res.status(400).json({ error: 'score must be a number' });
      }
      if (meta !== undefined && meta !== null && JSON.stringify(meta).length > 512) {
        return res.status(400).json({ error: 'meta payload too large' });
      }

      const leaderboard = await Leaderboard.findOne({ gameId: req.game._id, key: req.params.key });
      if (!leaderboard || !leaderboard.enabled) return res.status(404).json({ error: 'Leaderboard not found' });

      if (leaderboard.scoreMin !== null && score < leaderboard.scoreMin) {
        return res.status(400).json({ error: 'score below allowed minimum' });
      }
      if (leaderboard.scoreMax !== null && score > leaderboard.scoreMax) {
        return res.status(400).json({ error: 'score above allowed maximum' });
      }

      const sortSpec = leaderboard.sort === 'asc' ? { score: 1 } : { score: -1 };
      await Leaderboard.updateOne(
        { _id: leaderboard._id },
        {
          $push: {
            entries: {
              $each: [{ name: name.trim().slice(0, 32), score, meta: meta ?? null, createdAt: new Date() }],
              $sort: sortSpec,
              $slice: leaderboard.maxEntries,
            },
          },
        },
      );

      const updated = await Leaderboard.findById(leaderboard._id).select('entries');
      const rank = updated.entries.findIndex((e) => e.name === name.trim().slice(0, 32) && e.score === score);
      res.status(201).json({ ok: true, rank: rank === -1 ? -1 : rank + 1 });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/play/:gameSlug/backend/leaderboard/:key',
  rateLimitMiddleware({ limit: 120, windowMs: 60_000, keyFn: (req) => `read:${clientIp(req)}:${req.params.gameSlug}` }),
  verifyGameHmac({ requireFeature: 'leaderboardEnabled', consumeNonce: false }),
  async (req, res, next) => {
    try {
      const leaderboard = await Leaderboard.findOne({ gameId: req.game._id, key: req.params.key });
      if (!leaderboard || !leaderboard.enabled) return res.status(404).json({ error: 'Leaderboard not found' });

      res.json({
        key: leaderboard.key,
        label: leaderboard.label,
        sort: leaderboard.sort,
        entries: leaderboard.entries.map((e, i) => ({
          rank: i + 1,
          name: e.name,
          score: e.score,
          meta: e.meta,
          createdAt: e.createdAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── Public: config read ────────────────────────────────────────────────────────

router.get(
  '/play/:gameSlug/backend/config/:key',
  rateLimitMiddleware({ limit: 120, windowMs: 60_000, keyFn: (req) => `read:${clientIp(req)}:${req.params.gameSlug}` }),
  verifyGameHmac({ requireFeature: 'configEnabled', consumeNonce: false }),
  async (req, res, next) => {
    try {
      const config = await GameConfig.findOne({ gameId: req.game._id, key: req.params.key });
      if (!config || !config.enabled) return res.status(404).json({ error: 'Config key not found' });
      res.json({ key: config.key, value: config.value });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
