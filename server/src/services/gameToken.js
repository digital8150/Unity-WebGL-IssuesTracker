import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const GAME_TOKEN_TTL_S = 15 * 60;
const GAME_DEV_TOKEN_TTL_S = 7 * 24 * 60 * 60;
const GAME_TOKEN_KEY_LABEL = 'arcade-game-token-v2';

function gameTokenSecret() {
  if (process.env.GAME_TOKEN_SECRET) return process.env.GAME_TOKEN_SECRET;

  return crypto
    .createHmac('sha256', process.env.JWT_SECRET || 'dev-secret-change-in-production')
    .update(GAME_TOKEN_KEY_LABEL)
    .digest();
}

function normalizeIssuedAt(value) {
  if (value instanceof Date) {
    const milliseconds = value.getTime();
    return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Numeric timestamps are normally expressed in seconds. Accepting epoch
    // milliseconds as well keeps the signing helper safe to use with Date
    // values that have already been reduced to a number.
    return Math.floor(value > 1e12 ? value / 1000 : value);
  }

  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return normalizeIssuedAt(numeric);

    const milliseconds = Date.parse(value);
    return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : null;
  }

  return null;
}

function verifySignedGameToken(token) {
  if (typeof token !== 'string' || !token) {
    return { payload: null, error: null };
  }

  try {
    const payload = jwt.verify(token, gameTokenSecret(), { algorithms: ['HS256'] });
    if (
      !payload
      || typeof payload !== 'object'
      || payload.typ !== 'game'
      || typeof payload.sub !== 'string'
      || !payload.sub
      || typeof payload.gid !== 'string'
      || !payload.gid
      || typeof payload.name !== 'string'
      || (payload.dev !== undefined && typeof payload.dev !== 'boolean')
      || !Number.isFinite(payload.iat)
      || !Number.isFinite(payload.exp)
    ) {
      return { payload: null, error: null };
    }
    return { payload, error: null };
  } catch (error) {
    return { payload: null, error };
  }
}

/**
 * Signs a short-lived Arcade game credential. Development credentials use a
 * longer lifetime and are marked so the dashboard can revoke them as a group.
 */
export function signGameToken({ userId, gameId, displayName, dev = false, issuedAt } = {}) {
  const expiresIn = dev ? GAME_DEV_TOKEN_TTL_S : GAME_TOKEN_TTL_S;
  const issuedAtSeconds = normalizeIssuedAt(issuedAt);
  const claims = {
    sub: String(userId),
    gid: String(gameId),
    name: String(displayName ?? ''),
    typ: 'game',
  };
  if (dev) claims.dev = true;

  if (issuedAtSeconds !== null) {
    claims.iat = issuedAtSeconds;
    claims.exp = issuedAtSeconds + expiresIn;
  }

  return jwt.sign(
    claims,
    gameTokenSecret(),
    issuedAtSeconds === null
      ? { algorithm: 'HS256', expiresIn }
      : { algorithm: 'HS256' },
  );
}

/**
 * Verifies a game credential and returns its claims, or null on any failure.
 * Site JWTs cannot be accepted because this module always uses the separate
 * game-token key (or its dedicated derived key).
 */
export function verifyGameToken(token) {
  return verifySignedGameToken(token).payload;
}

// Middleware needs to distinguish an expired, otherwise-valid credential so
// clients can refresh it. Keep the public verifier's null-on-failure contract
// while exposing the verification reason to that middleware.
export function verifyGameTokenDetailed(token) {
  return verifySignedGameToken(token);
}

export function getGameTokenSecret() {
  return gameTokenSecret();
}

export { GAME_TOKEN_KEY_LABEL, GAME_TOKEN_TTL_S, GAME_DEV_TOKEN_TTL_S };
