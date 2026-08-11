import { Router } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Game from '../models/Game.js';
import Build from '../models/Build.js';
import { requireAuth, requireApproved, requireAdmin } from '../middleware/auth.js';

const router = Router();

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API = 'https://api.github.com';

const DISCORD_AUTHORIZE_URL = 'https://discord.com/api/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_API = 'https://discord.com/api/v10';

function signToken(user) {
  return jwt.sign(
    { sub: user._id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' },
  );
}

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    storageQuota: user.storageQuota ?? 500 * 1024 * 1024,
    ageConfirmedAt: user.ageConfirmedAt ?? null,
  };
}

// First-ever account becomes admin + approved (bootstrap).
async function bootstrapDefaults() {
  const userCount = await User.estimatedDocumentCount();
  if (userCount === 0) {
    return { role: 'admin', status: 'approved' };
  }
  return { role: 'user', status: 'pending' };
}

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub).select('-passwordHash');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'Display name is required' });
    if (name.length > 100) {
      return res.status(400).json({ error: 'Display name must be 100 characters or fewer' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.sub,
      { name },
      { new: true, runValidators: true },
    ).select('-passwordHash');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// Self-declared age-of-consent gate (PIPA §22-2 — under-14 users need guardian
// consent, which this service does not collect). Idempotent: only sets the
// timestamp on first confirmation.
router.post('/confirm-age', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.ageConfirmedAt) {
      user.ageConfirmedAt = new Date();
      await user.save();
    }
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/usage', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub).select('storageQuota');
    const games = await Game.find({ ownerId: req.user.sub }).select('_id');
    const gameIds = games.map((g) => g._id);
    const [agg] = await Build.aggregate([
      { $match: { gameId: { $in: gameIds } } },
      { $group: { _id: null, total: { $sum: '$storageBytes' } } },
    ]);
    res.json({
      usedBytes: agg?.total ?? 0,
      quotaBytes: user?.storageQuota ?? 500 * 1024 * 1024,
    });
  } catch (err) {
    next(err);
  }
});

// ── GitHub OAuth ──────────────────────────────────────────────────────────────

router.get('/github', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({ error: 'GitHub OAuth is not configured on this server' });
  }
  const callbackUrl = `${process.env.SERVER_URL || 'http://localhost:4000'}/api/auth/github/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: 'user:email',
  });
  res.redirect(`${GITHUB_AUTHORIZE_URL}?${params}`);
});

router.get('/github/callback', async (req, res, next) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  try {
    const { code, error } = req.query;
    if (error || !code) {
      return res.redirect(`${frontendUrl}/login?error=github_denied`);
    }

    const callbackUrl = `${process.env.SERVER_URL || 'http://localhost:4000'}/api/auth/github/callback`;

    const tokenRes = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: callbackUrl,
      }),
    });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return res.redirect(`${frontendUrl}/login?error=github_token`);
    }

    const ghHeaders = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'BCSDLab-Arcade',
    };

    const profileRes = await fetch(`${GITHUB_API}/user`, { headers: ghHeaders });
    const profile = await profileRes.json();

    let email = profile.email;
    if (!email) {
      const emailsRes = await fetch(`${GITHUB_API}/user/emails`, { headers: ghHeaders });
      const emails = await emailsRes.json();
      if (Array.isArray(emails)) {
        email =
          emails.find((e) => e.primary && e.verified)?.email ||
          emails.find((e) => e.primary)?.email ||
          emails[0]?.email;
      }
    }

    const githubId = String(profile.id);
    let user = await User.findOne({ githubId });
    if (!user && email) {
      user = await User.findOne({ email: email.toLowerCase() });
    }
    if (user) {
      if (!user.githubId) {
        user.githubId = githubId;
        await user.save();
      }
    } else {
      const defaults = await bootstrapDefaults();
      user = await User.create({
        name: profile.name || profile.login,
        email: email || `${profile.login}@users.noreply.github.com`,
        githubId,
        ...defaults,
      });
    }

    const token = signToken(user);
    res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  } catch (err) {
    next(err);
  }
});

// ── Discord OAuth ─────────────────────────────────────────────────────────────

router.get('/discord', (req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({ error: 'Discord OAuth is not configured on this server' });
  }
  const callbackUrl = `${process.env.SERVER_URL || 'http://localhost:4000'}/api/auth/discord/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: 'identify email',
  });
  res.redirect(`${DISCORD_AUTHORIZE_URL}?${params}`);
});

router.get('/discord/callback', async (req, res, next) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  try {
    const { code, error } = req.query;
    if (error || !code) {
      return res.redirect(`${frontendUrl}/login?error=discord_denied`);
    }

    const callbackUrl = `${process.env.SERVER_URL || 'http://localhost:4000'}/api/auth/discord/callback`;

    const tokenRes = await fetch(DISCORD_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
      }),
    });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return res.redirect(`${frontendUrl}/login?error=discord_token`);
    }

    const profileRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = await profileRes.json();

    const discordId = String(profile.id);
    const email = profile.email?.toLowerCase();

    let user = await User.findOne({ discordId });
    if (!user && email) {
      user = await User.findOne({ email });
    }
    if (user) {
      if (!user.discordId) {
        user.discordId = discordId;
        await user.save();
      }
    } else {
      const defaults = await bootstrapDefaults();
      user = await User.create({
        name: profile.global_name || profile.username,
        email: email || `${profile.username}@discord.invalid`,
        discordId,
        ...defaults,
      });
    }

    const token = signToken(user);
    res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  } catch (err) {
    next(err);
  }
});

// ── User search (approved only) ───────────────────────────────────────────────

router.get('/search-users', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) return res.json({ users: [] });
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const users = await User.find({
      $or: [{ name: regex }, { email: regex }],
      _id: { $ne: req.user.sub },
      status: 'approved',
    })
      .select('name email')
      .limit(10)
      .lean();
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

// ── Admin: user management ───────────────────────────────────────────────────

router.get('/admin/users', requireAuth, requireApproved, requireAdmin, async (req, res, next) => {
  try {
    const users = await User.find({})
      .select('-passwordHash')
      .sort({ status: 1, createdAt: -1 })
      .lean();
    res.json({
      users: users.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
        hasGithub: Boolean(u.githubId),
        hasDiscord: Boolean(u.discordId),
        storageQuota: u.storageQuota ?? 500 * 1024 * 1024,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/admin/users/:userId',
  requireAuth,
  requireApproved,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { status, role, storageQuota } = req.body;
      const update = {};
      if (status && ['pending', 'approved', 'rejected'].includes(status)) update.status = status;
      if (role && ['user', 'admin'].includes(role)) update.role = role;
      if (storageQuota !== undefined) {
        const quota = Number(storageQuota);
        if (!Number.isFinite(quota) || quota < 0) {
          return res.status(400).json({ error: 'storageQuota must be a non-negative number' });
        }
        update.storageQuota = Math.round(quota);
      }
      if (!Object.keys(update).length) return res.status(400).json({ error: 'Nothing to update' });

      // Prevent demoting the last admin.
      if (update.role === 'user') {
        const target = await User.findById(req.params.userId).select('role');
        if (target?.role === 'admin') {
          const adminCount = await User.countDocuments({ role: 'admin' });
          if (adminCount <= 1) {
            return res.status(400).json({ error: 'Cannot demote the last admin' });
          }
        }
      }

      const user = await User.findByIdAndUpdate(req.params.userId, update, { new: true }).select(
        '-passwordHash',
      );
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json({ user: publicUser(user) });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/admin/users/:userId',
  requireAuth,
  requireApproved,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (String(req.params.userId) === String(req.user.sub)) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }
      const target = await User.findById(req.params.userId).select('role');
      if (!target) return res.status(404).json({ error: 'User not found' });
      if (target.role === 'admin') {
        const adminCount = await User.countDocuments({ role: 'admin' });
        if (adminCount <= 1) {
          return res.status(400).json({ error: 'Cannot delete the last admin' });
        }
      }
      await User.findByIdAndDelete(req.params.userId);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
