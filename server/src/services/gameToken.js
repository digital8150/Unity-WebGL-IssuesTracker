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
export function signGameToken({ userId, gameId, displayName, dev = false } = {}) {
  const expiresIn = dev ? GAME_DEV_TOKEN_TTL_S : GAME_TOKEN_TTL_S;
  const claims = {
    sub: String(userId),
    gid: String(gameId),
    name: String(displayName ?? ''),
    typ: 'game',
  };
  if (dev) claims.dev = true;

  return jwt.sign(
    claims,
    gameTokenSecret(),
    { algorithm: 'HS256', expiresIn },
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
