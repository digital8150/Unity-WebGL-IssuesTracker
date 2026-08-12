import express from 'express';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../middleware/auth.js';
import { requireGameToken } from '../middleware/gameAuth.js';
import { signGameToken, GAME_TOKEN_TTL_S } from '../services/gameToken.js';
import { rateLimitMiddleware } from '../services/rateLimiter.js';
import { buildBestScoreOps, buildRankQuery, resolveSaveWrite } from '../services/v2Queries.js';
import { getLiveOpsMode, isLiveOpsEnabled } from '../services/liveOps.js';
import Game from '../models/Game.js';
import User from '../models/User.js';
import Leaderboard from '../models/Leaderboard.js';
import GameConfig from '../models/GameConfig.js';
import LeaderboardScore from '../models/LeaderboardScore.js';
import CloudSave from '../models/CloudSave.js';

const KEY_RE = /^[a-z0-9][a-z0-9_-]*$/;
const CONFIG_KEY_RE = /^[a-z0-9][a-z0-9_.-]*$/;
const SAVE_SLOT_RE = /^[a-z0-9][a-z0-9_-]*$/;
const MAX_PAGE_SIZE = 100;
const MAX_SAVE_BYTES = 64 * 1024;
const MAX_SAVE_SLOTS = 8;

function idString(value) {
  const id = value?._id ?? value?.id ?? value;
  return id === null || id === undefined ? null : String(id);
}

function asPlain(value) {
  return value?.toObject ? value.toObject() : value;
}

function isQuery(value) {
  return Boolean(value && !Array.isArray(value) && (
    typeof value.exec === 'function'
    || typeof value.then === 'function'
    || typeof value.select === 'function'
    || typeof value.lean === 'function'
  ));
}

async function execute(value, { select, sort, limit, lean = false } = {}) {
  if (Array.isArray(value)) return value;
  let query = value;
  if (isQuery(query)) {
    if (select && typeof query.select === 'function') query = query.select(select);
    if (sort && typeof query.sort === 'function') query = query.sort(sort);
    if (limit !== undefined && typeof query.limit === 'function') query = query.limit(limit);
    if (lean && typeof query.lean === 'function') query = query.lean();
  }
  return await query;
}

async function findOne(model, filter, options = {}) {
  return execute(model.findOne(filter), options);
}

async function findById(model, id, options = {}) {
  return execute(model.findById(id), options);
}

async function findMany(model, filter, options = {}) {
  return execute(model.find(filter), options);
}

function statusError(res, status, error, code) {
  const body = { error };
  if (code) body.code = code;
  return res.status(status).json(body);
}

function isV2Enabled(game) {
  const backend = game?.serverBackend;
  return isLiveOpsEnabled(backend) && getLiveOpsMode(backend) === 'v2' && backend?.v2Enabled === true;
}

function isCloudSaveEnabled(game) {
  const backend = game?.serverBackend;
  return isV2Enabled(game) && backend?.cloudSaveEnabled === true;
}

function tokenIdentity(req) {
  return {
    userId: req.gameToken?.sub,
    gameId: req.gameToken?.gid,
  };
}

function tokenRateLimit(operation, limit) {
  return rateLimitMiddleware({
    limit,
    windowMs: 60_000,
    keyFn: (req) => `v2:${operation}:${String(req.gameToken?.sub)}:${String(req.gameToken?.gid)}`,
  });
}

function playTokenRateLimit(limit) {
  return rateLimitMiddleware({
    limit,
    windowMs: 60_000,
    keyFn: (req) => `v2:play-token:${String(req.user?.sub)}:${String(req.v2Game?._id)}`,
  });
}

function validateKey(req, res, expression = KEY_RE, label = 'key', maxLength = 40) {
  if (
    typeof req.params.key !== 'string'
    || req.params.key.length > maxLength
    || !expression.test(req.params.key)
  ) {
    statusError(res, 400, `${label} is invalid`);
    return false;
  }
  return true;
}

function parseLimit(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return Math.min(MAX_PAGE_SIZE, Math.max(1, Number(fallback) || 1));
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(parsed)));
}

function compareScores(left, right, sort) {
  const leftScore = Number(left?.score);
  const rightScore = Number(right?.score);
  if (leftScore !== rightScore) {
    return sort === 'asc' ? leftScore - rightScore : rightScore - leftScore;
  }
  const leftTime = new Date(left?.bestAt ?? left?.createdAt ?? 0).getTime();
  const rightTime = new Date(right?.bestAt ?? right?.createdAt ?? 0).getTime();
  return leftTime - rightTime;
}

function rankSortedRows(rows, sort) {
  let previous = null;
  let previousRank = 1;
  return rows.map((row, index) => {
    const current = asPlain(row) ?? {};
    const sameScore = previous && Number(previous.score) === Number(current.score);
    const sameTime = previous && new Date(previous.bestAt ?? previous.createdAt ?? 0).getTime()
      === new Date(current.bestAt ?? current.createdAt ?? 0).getTime();
    const rank = index === 0 ? 1 : (sameScore && sameTime ? previousRank : index + 1);
    previous = current;
    previousRank = rank;
    return { row: current, rank };
  });
}

function publicScore(row, rank, userId) {
  const value = asPlain(row) ?? {};
  return {
    rank,
    userId: idString(value.userId),
    displayName: String(value.displayName ?? ''),
    score: value.score,
    isMe: idString(value.userId) === idString(userId),
  };
}

function scoreSortSpec(sort) {
  return sort === 'asc' ? { score: 1, bestAt: 1 } : { score: -1, bestAt: 1 };
}

function saveFilter(gameId, userId, slot, isDev) {
  return { gameId, userId, slot, isDev: Boolean(isDev) };
}

async function rankForRow(ScoreModel, leaderboard, gameId, row, fallbackRank) {
  if (
    typeof ScoreModel.countDocuments !== 'function'
    || row?.score === undefined
    || row?.bestAt === undefined
    || row?.bestAt === null
  ) return fallbackRank;
  const rankQuery = buildRankQuery(leaderboard, row) ?? {};
  const betterCount = await ScoreModel.countDocuments({
    leaderboardId: leaderboard._id,
    gameId,
    ...rankQuery,
  });
  return Number.isFinite(Number(betterCount)) ? Number(betterCount) + 1 : fallbackRank;
}

async function loadPlayGame(GameModel, req, res, next) {
  try {
    const game = await findOne(GameModel, { slug: req.params.gameSlug });
    if (!game || !isV2Enabled(game)) return statusError(res, 404, 'Game not found');
    req.v2Game = game;
    return next();
  } catch (error) {
    return next(error);
  }
}

function tokenGameLoader(GameModel, { cloudSave = false } = {}) {
  return async (req, res, next) => {
    try {
      const game = await findById(GameModel, req.gameToken.gid, { select: 'serverBackend' });
      if (!game || !isV2Enabled(game)) return statusError(res, 404, 'Game not found');
      if (cloudSave && !isCloudSaveEnabled(game)) return statusError(res, 404, 'Cloud saves are not enabled');
      req.v2Game = game;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function tokenAuth(UserModel, GameModel, { write = false } = {}) {
  return requireGameToken({
    write,
    models: { User: UserModel, Game: GameModel },
  });
}

function modelOperation(operation, model, ...args) {
  if (typeof model?.[operation] !== 'function') {
    throw new TypeError(`Model does not implement ${operation}`);
  }
  return model[operation](...args);
}

function normalizeOperation(operation) {
  if (!operation) return null;
  if (operation.updateOne) return operation.updateOne;
  if (operation.filter && operation.update) {
    return { filter: operation.filter, update: operation.update, options: operation.options };
  }
  if (operation.query && operation.update) {
    return { filter: operation.query, update: operation.update, options: operation.options };
  }
  return null;
}

function operationsFromBuilder(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.ops)) return result.ops;
  if (Array.isArray(result?.operations)) return result.operations;
  return result ? [result] : [];
}

async function applyBestScoreOps(ScoreModel, result) {
  const operations = operationsFromBuilder(result);
  for (const operation of operations) {
    const normalized = normalizeOperation(operation);
    if (!normalized) continue;
    try {
      const options = { ...(normalized.options ?? {}) };
      if (normalized.upsert !== undefined && options.upsert === undefined) options.upsert = normalized.upsert;
      await modelOperation('updateOne', ScoreModel, normalized.filter, normalized.update, options);
    } catch (error) {
      // The first upsert deliberately races on the unique (leaderboard,user)
      // index. A concurrent first submission is an expected no-op.
      if (error?.code !== 11000) throw error;
    }
  }
}

function serializeSave(save) {
  if (!save) return null;
  const value = asPlain(save) ?? {};
  return {
    slot: String(value.slot ?? ''),
    data: String(value.data ?? ''),
    size: value.size,
    rev: value.rev,
    createdAt: value.createdAt ?? null,
    updatedAt: value.updatedAt ?? null,
  };
}

function saveConflict(res, current) {
  const value = asPlain(current) ?? {};
  return res.status(409).json({
    error: 'Save conflict',
    code: 'save_conflict',
    rev: value.rev ?? null,
    data: value.data ?? null,
  });
}

function validateSaveSlot(req, res) {
  const slot = req.params.slot;
  if (typeof slot !== 'string' || slot.length > 32 || !SAVE_SLOT_RE.test(slot)) {
    statusError(res, 400, 'slot is invalid');
    return false;
  }
  return true;
}

function validateSaveBody(body) {
  if (!body || typeof body.data !== 'string') return { error: 'data must be a JSON string' };
  try {
    JSON.parse(body.data);
  } catch {
    return { error: 'data must be valid JSON' };
  }
  const size = Buffer.byteLength(body.data, 'utf8');
  if (size > MAX_SAVE_BYTES) return { error: 'data exceeds the 64 KiB limit' };
  if (body.rev !== undefined && (!Number.isInteger(body.rev) || body.rev < 0)) {
    return { error: 'rev must be a non-negative integer' };
  }
  return { size };
}

function conflictFromDecision(decision) {
  return Boolean(decision?.conflict)
    || decision?.code === 'save_conflict'
    || decision?.status === 'conflict'
    || decision?.mode === 'conflict';
}

async function writeSave({ SaveModel, gameId, userId, slot, body, existing, isDev }) {
  const size = Buffer.byteLength(body.data, 'utf8');
  const identity = saveFilter(gameId, userId, slot, isDev);
  // Never let client-supplied identity/provenance fields influence the CAS
  // decision. The token is the sole source of game/user scope.
  const decision = resolveSaveWrite({
    existing,
    body: {
      ...identity,
      data: body.data,
      size,
      ...(body.rev === undefined ? {} : { rev: body.rev }),
    },
  });
  if (conflictFromDecision(decision)) return { conflict: true };

  const base = { ...identity, data: body.data, size };
  const mode = decision?.mode ?? decision?.action;
  const isCreate = !existing && (mode === 'create' || decision?.create === true || decision?.insert === true || body.rev === 0 || body.rev === undefined);
  if (isCreate) {
    const save = await modelOperation('create', SaveModel, { ...base, rev: 1 });
    return { save };
  }

  const filter = decision?.filter ?? decision?.query ?? {
    ...identity,
    ...(body.rev === undefined ? {} : { rev: body.rev }),
  };
  const update = decision?.update ?? {
    $set: { data: body.data, size, isDev: Boolean(isDev) },
    $inc: { rev: 1 },
  };
  const result = await modelOperation('updateOne', SaveModel, filter, update, decision?.options ?? {});
  if (result?.matchedCount === 0) {
    return { conflict: true };
  }
  const save = await findOne(SaveModel, identity);
  return { save };
}

export function apiV2Router({ models = {} } = {}) {
  const router = express.Router();
  const GameModel = models.Game ?? Game;
  const UserModel = models.User ?? User;
  const LeaderboardModel = models.Leaderboard ?? Leaderboard;
  const GameConfigModel = models.GameConfig ?? GameConfig;
  const ScoreModel = models.LeaderboardScore ?? LeaderboardScore;
  const SaveModel = models.CloudSave ?? CloudSave;
  router.post(
    '/games/:gameSlug/play-token',
    requireAuth,
    (req, res, next) => loadPlayGame(GameModel, req, res, next),
    playTokenRateLimit(30),
    async (req, res, next) => {
      try {
        if (typeof req.user?.sub !== 'string' || !req.user.sub) return statusError(res, 401, 'User not found');
        const user = await findById(UserModel, req.user.sub, { select: 'status name email' });
        if (!user) return statusError(res, 401, 'User not found');
        if (user.status === 'rejected') return statusError(res, 403, 'Account rejected', 'account_rejected');

        const displayName = String(user.name ?? req.user.name ?? 'User');
        const token = signGameToken({
          userId: req.user.sub,
          gameId: req.v2Game._id,
          displayName,
        });
        const decoded = jwt.decode(token);
        const expiresAt = decoded?.exp
          ? new Date(decoded.exp * 1000).toISOString()
          : new Date(Date.now() + GAME_TOKEN_TTL_S * 1000).toISOString();
        return res.json({
          token,
          userId: String(req.user.sub),
          displayName,
          expiresAt,
        });
      } catch (error) {
        return next(error);
      }
    },
  );

  const readToken = tokenAuth(UserModel, GameModel, { write: false });
  const writeToken = tokenAuth(UserModel, GameModel, { write: true });

  router.get('/me', readToken, tokenGameLoader(GameModel), tokenRateLimit('me', 120), (req, res) => {
    res.json({
      userId: String(req.gameToken.sub),
      displayName: String(req.gameToken.name ?? ''),
    });
  });

  router.post(
    '/leaderboards/:key/scores',
    writeToken,
    tokenGameLoader(GameModel),
    tokenRateLimit('score-submit', 30),
    async (req, res, next) => {
      try {
        if (!validateKey(req, res)) return;
        const { score, meta } = req.body ?? {};
        if (typeof score !== 'number' || !Number.isFinite(score)) {
          return statusError(res, 400, 'score must be a number');
        }
        if (meta !== undefined && meta !== null) {
          const metaBytes = Buffer.byteLength(JSON.stringify(meta), 'utf8');
          if (metaBytes > 512) return statusError(res, 400, 'meta payload too large');
        }

        const { gameId, userId } = tokenIdentity(req);
        const leaderboard = await findOne(LeaderboardModel, { gameId, key: req.params.key });
        if (!leaderboard || leaderboard.enabled === false) return statusError(res, 404, 'Leaderboard not found');
        if (leaderboard.scoreMin !== null && leaderboard.scoreMin !== undefined && score < leaderboard.scoreMin) {
          return statusError(res, 400, 'score below allowed minimum');
        }
        if (leaderboard.scoreMax !== null && leaderboard.scoreMax !== undefined && score > leaderboard.scoreMax) {
          return statusError(res, 400, 'score above allowed maximum');
        }

        const now = new Date();
        const ops = buildBestScoreOps({
          leaderboardId: leaderboard._id,
          gameId,
          userId,
          displayName: String(req.gameToken.name ?? ''),
          score,
          meta: meta ?? null,
          now,
          lb: leaderboard,
          isDev: Boolean(req.gameToken.dev),
        });
        await applyBestScoreOps(ScoreModel, ops);

        const current = await findOne(ScoreModel, { leaderboardId: leaderboard._id, gameId, userId });
        if (!current) return res.status(201).json({ ok: true, rank: -1 });
        const rank = await rankForRow(ScoreModel, leaderboard, gameId, current, 1);
        return res.status(201).json({ ok: true, rank });
      } catch (error) {
        return next(error);
      }
    },
  );

  router.get(
    '/leaderboards/:key',
    readToken,
    tokenGameLoader(GameModel),
    tokenRateLimit('leaderboard-read', 120),
    async (req, res, next) => {
      try {
        if (!validateKey(req, res)) return;
        const { gameId, userId } = tokenIdentity(req);
        const leaderboard = await findOne(LeaderboardModel, { gameId, key: req.params.key });
        if (!leaderboard || leaderboard.enabled === false) return statusError(res, 404, 'Leaderboard not found');

        const limit = parseLimit(req.query.limit, leaderboard.maxEntries);
        const rows = await findMany(ScoreModel, { leaderboardId: leaderboard._id, gameId }, {
          sort: scoreSortSpec(leaderboard.sort),
          limit,
        });
        const sorted = [...(rows ?? [])].sort((a, b) => compareScores(a, b, leaderboard.sort));
        const ranked = rankSortedRows(sorted.slice(0, limit), leaderboard.sort);
        const rankOffset = ranked.length
          ? (await rankForRow(ScoreModel, leaderboard, gameId, ranked[0].row, ranked[0].rank)) - ranked[0].rank
          : 0;
        const entries = ranked.map(({ row, rank }) => publicScore(row, rank + rankOffset, userId));
        return res.json({ entries });
      } catch (error) {
        return next(error);
      }
    },
  );

  router.get(
    '/leaderboards/:key/me',
    readToken,
    tokenGameLoader(GameModel),
    tokenRateLimit('leaderboard-me', 120),
    async (req, res, next) => {
      try {
        if (!validateKey(req, res)) return;
        const { gameId, userId } = tokenIdentity(req);
        const leaderboard = await findOne(LeaderboardModel, { gameId, key: req.params.key });
        if (!leaderboard || leaderboard.enabled === false) return statusError(res, 404, 'Leaderboard not found');
        const score = await findOne(ScoreModel, { leaderboardId: leaderboard._id, gameId, userId });
        if (!score) return res.json({ entry: null, rank: null });

        const rank = await rankForRow(ScoreModel, leaderboard, gameId, score, 1);
        const entry = publicScore(score, rank, userId);
        return res.json({ entry, rank });
      } catch (error) {
        return next(error);
      }
    },
  );

  router.get(
    '/config/:key',
    readToken,
    tokenGameLoader(GameModel),
    tokenRateLimit('config-read', 120),
    async (req, res, next) => {
      try {
        if (!validateKey(req, res, CONFIG_KEY_RE, 'config key', 60)) return;
        const { gameId } = tokenIdentity(req);
        const config = await findOne(GameConfigModel, { gameId, key: req.params.key });
        if (!config || config.enabled === false) return statusError(res, 404, 'Config key not found');
        return res.json({ key: config.key, value: config.value });
      } catch (error) {
        return next(error);
      }
    },
  );

  router.get(
    '/saves/:slot',
    readToken,
    tokenGameLoader(GameModel, { cloudSave: true }),
    tokenRateLimit('save-read', 120),
    async (req, res, next) => {
      try {
        if (!validateSaveSlot(req, res)) return;
        const { gameId, userId } = tokenIdentity(req);
        const filter = saveFilter(gameId, userId, req.params.slot, req.gameToken.dev);
        const save = await findOne(SaveModel, filter);
        if (!save) return statusError(res, 404, 'Save not found');
        return res.json(serializeSave(save));
      } catch (error) {
        return next(error);
      }
    },
  );

  router.put(
    '/saves/:slot',
    writeToken,
    tokenGameLoader(GameModel, { cloudSave: true }),
    tokenRateLimit('save-write', 30),
    async (req, res, next) => {
      try {
        if (!validateSaveSlot(req, res)) return;
        const validation = validateSaveBody(req.body);
        if (validation.error) return statusError(res, 400, validation.error);

        const { gameId, userId } = tokenIdentity(req);
        const slot = req.params.slot;
        const isDev = Boolean(req.gameToken.dev);
        const filter = saveFilter(gameId, userId, slot, isDev);
        const existing = await findOne(SaveModel, filter);
        const mayCreate = req.body.rev === undefined || req.body.rev === 0;
        if (!existing && mayCreate && typeof SaveModel.countDocuments === 'function') {
          const slotCount = await SaveModel.countDocuments({ gameId, userId, isDev });
          if (slotCount >= MAX_SAVE_SLOTS) return statusError(res, 409, 'Save slot limit reached', 'save_slots_full');
        }

        const result = await writeSave({
          SaveModel,
          gameId,
          userId,
          slot,
          body: req.body,
          existing,
          isDev,
        });
        if (result.conflict) {
          const current = await findOne(SaveModel, filter);
          return saveConflict(res, current);
        }
        const save = result.save ?? await findOne(SaveModel, filter);
        return res.json(serializeSave(save));
      } catch (error) {
        if (error?.code === 11000) {
          if (req.body?.rev === undefined) {
            const { gameId, userId } = tokenIdentity(req);
            const isDev = Boolean(req.gameToken?.dev);
            const filter = saveFilter(gameId, userId, req.params.slot, isDev);
            const data = req.body?.data;
            const size = typeof data === 'string' ? Buffer.byteLength(data, 'utf8') : 0;
            await modelOperation('updateOne', SaveModel,
              filter,
              {
                $set: { data, size, isDev },
                $inc: { rev: 1 },
              });
            const saved = await findOne(SaveModel, filter);
            return res.json(serializeSave(saved));
          }
          const isDev = Boolean(req.gameToken?.dev);
          const current = await findOne(SaveModel, {
            gameId: req.gameToken?.gid,
            userId: req.gameToken?.sub,
            slot: req.params.slot,
            isDev,
          });
          return saveConflict(res, current);
        }
        return next(error);
      }
    },
  );

  router.delete(
    '/saves/:slot',
    writeToken,
    tokenGameLoader(GameModel, { cloudSave: true }),
    tokenRateLimit('save-delete', 120),
    async (req, res, next) => {
      try {
        if (!validateSaveSlot(req, res)) return;
        const { gameId, userId } = tokenIdentity(req);
        const result = await modelOperation('deleteOne', SaveModel, saveFilter(gameId, userId, req.params.slot, req.gameToken.dev));
        if (result?.deletedCount === 0) return statusError(res, 404, 'Save not found');
        return res.json({ ok: true });
      } catch (error) {
        return next(error);
      }
    },
  );

  return router;
}

export default apiV2Router;
