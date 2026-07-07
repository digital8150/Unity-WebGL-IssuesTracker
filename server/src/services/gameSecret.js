import crypto from 'node:crypto';

const SESSION_TTL_MS = 120_000; // 2 minutes
const CLOCK_SKEW_MS = 30_000; // 30 seconds

export function generateSecret() {
  return crypto.randomBytes(32).toString('hex');
}

export function hmacHex(secret, str) {
  return crypto.createHmac('sha256', secret).update(str).digest('hex');
}

export function sha256Hex(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

export function timingSafeEqualHex(a, b) {
  const bufA = Buffer.from(String(a ?? ''), 'hex');
  const bufB = Buffer.from(String(b ?? ''), 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Issues a short-lived session token bound to a game, HMAC'd with that game's secret.
// Format: base64url(payloadJson) + "." + hex(HMAC-SHA256(secret, base64url(payloadJson)))
export function issueSessionToken(game) {
  const now = Date.now();
  const payload = {
    gid: String(game._id),
    iat: now,
    exp: now + SESSION_TTL_MS,
    jti: crypto.randomBytes(12).toString('hex'),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = hmacHex(game.serverBackend.secret, encoded);
  return { token: `${encoded}.${sig}`, expiresIn: SESSION_TTL_MS / 1000 };
}

// Verifies a session token against a game's secret. Returns the parsed payload
// on success, or null on any failure (bad format, bad signature, expired, wrong game).
export function verifySessionToken(token, game) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const idx = token.lastIndexOf('.');
  const encoded = token.slice(0, idx);
  const sig = token.slice(idx + 1);

  const expectedSig = hmacHex(game.serverBackend.secret, encoded);
  if (!timingSafeEqualHex(sig, expectedSig)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (payload.gid !== String(game._id)) return null;
  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  return payload;
}

export function isTimestampFresh(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n)) return false;
  return Math.abs(Date.now() - n) <= CLOCK_SKEW_MS;
}

export { SESSION_TTL_MS, CLOCK_SKEW_MS };
