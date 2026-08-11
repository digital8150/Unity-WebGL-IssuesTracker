import User from '../models/User.js';
import Game from '../models/Game.js';
import { verifyGameTokenDetailed } from '../services/gameToken.js';

const MAX_CONTENT_LENGTH = 2 * 1024 * 1024;
const STATUS_CACHE_TTL_MS = 30_000;

// The server is intentionally single-process for now. Keeping caches per model
// also isolates injected test doubles while retaining the rate limiter's
// in-process semantics.
const statusCaches = new Map();

const statusCacheSweep = setInterval(() => {
  const now = Date.now();
  for (const cache of statusCaches.values()) {
    for (const [userId, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(userId);
    }
  }
}, STATUS_CACHE_TTL_MS);
statusCacheSweep.unref?.();

function statusCacheFor(model) {
  let cache = statusCaches.get(model);
  if (!cache) {
    cache = new Map();
    statusCaches.set(model, cache);
  }
  return cache;
}

async function findSelected(model, id, fields) {
  let query = model.findById(id);
  if (query && typeof query.select === 'function') query = query.select(fields);
  if (query && typeof query.lean === 'function') query = query.lean();
  return query;
}

async function loadUserStatus(model, userId, useCache) {
  const cache = statusCacheFor(model);
  const now = Date.now();
  if (useCache) {
    const cached = cache.get(String(userId));
    if (cached && cached.expiresAt > now) return cached;
    if (cached) cache.delete(String(userId));
  }

  const user = await findSelected(model, userId, 'status');
  const result = user
    ? { found: true, status: user.status, expiresAt: now + STATUS_CACHE_TTL_MS }
    : { found: false, status: null, expiresAt: now + STATUS_CACHE_TTL_MS };

  if (useCache) cache.set(String(userId), result);
  return result;
}

function contentLengthOf(req) {
  const value = req?.headers?.['content-length'];
  if (Array.isArray(value)) return Number(value[0]);
  return Number(value);
}

function rejectTooLarge(res) {
  return res.status(413).json({ error: 'Request body too large', code: 'payload_too_large' });
}

function rejectUnauthorized(res, message = 'Unauthorized', code) {
  const body = { error: message };
  if (code) body.code = code;
  return res.status(401).json(body);
}

function rejectAccount(res, status) {
  return res.status(403).json({ error: 'Account rejected', code: 'account_rejected', status });
}

function rejectRevokedDevToken(res) {
  return res.status(401).json({ error: 'Invalid or expired game token', code: 'token_revoked' });
}

async function isDevTokenRevoked(model, payload) {
  const game = await findSelected(model, payload.gid, 'serverBackend');
  if (!game) return true;

  const issuedAt = game.serverBackend?.v2DevTokenIssuedAt;
  if (!Number.isFinite(Number(payload.iat))) return true;
  if (!issuedAt) return false;

  const issuedAtMs = issuedAt instanceof Date ? issuedAt.getTime() : new Date(issuedAt).getTime();
  if (!Number.isFinite(issuedAtMs)) return false;
  // JWT timestamps have one-second precision. Comparing at that same
  // precision avoids revoking a token issued in the same second as the
  // dashboard's Date write.
  return Number(payload.iat) < Math.floor(issuedAtMs / 1000);
}

export function clearGameAuthCache(model) {
  if (model) {
    statusCaches.delete(model);
    return;
  }
  statusCaches.clear();
}

/**
 * Authenticates an Arcade game credential. User status is live for writes and
 * cached for reads; model injection keeps route tests independent of MongoDB.
 */
export function requireGameToken({ write = false, models = {} } = {}) {
  const UserModel = models.User ?? User;
  const GameModel = models.Game ?? Game;

  return async (req, res, next) => {
    try {
      const contentLength = contentLengthOf(req);
      if (Number.isFinite(contentLength) && contentLength > MAX_CONTENT_LENGTH) {
        return rejectTooLarge(res);
      }

      const authorization = req?.headers?.authorization;
      if (typeof authorization !== 'string') {
        return rejectUnauthorized(res);
      }

      const match = authorization.match(/^Bearer\s+(.+)$/i);
      const token = match?.[1]?.trim();
      if (!token) return rejectUnauthorized(res);

      const { payload, error } = verifyGameTokenDetailed(token);
      if (!payload) {
        if (error?.name === 'TokenExpiredError') {
          return rejectUnauthorized(res, 'Game token expired', 'token_expired');
        }
        return rejectUnauthorized(res, 'Invalid or expired game token');
      }

      const userStatus = await loadUserStatus(UserModel, payload.sub, !write);
      if (!userStatus.found) return rejectUnauthorized(res, 'User not found');
      if (userStatus.status === 'rejected') return rejectAccount(res, userStatus.status);

      if (payload.dev === true && await isDevTokenRevoked(GameModel, payload)) {
        return rejectRevokedDevToken(res);
      }

      req.gameToken = payload;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export { MAX_CONTENT_LENGTH, STATUS_CACHE_TTL_MS };
