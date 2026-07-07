// In-memory rate limiting + single-use nonce tracking for the per-game server
// backend (leaderboards / config). Single-process only — see progress.md for
// the multi-instance caveat (would need Redis or a Mongo TTL collection).

const seenNonces = new Map(); // jti -> expMs
const rateBuckets = new Map(); // key -> { count, resetAt }

const SWEEP_INTERVAL_MS = 60_000;

setInterval(() => {
  const now = Date.now();
  for (const [jti, exp] of seenNonces) {
    if (exp < now) seenNonces.delete(jti);
  }
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt < now) rateBuckets.delete(key);
  }
}, SWEEP_INTERVAL_MS).unref();

// Returns true if the nonce was fresh (not seen before) and is now recorded.
// Returns false if it had already been consumed (replay).
export function consumeNonce(jti, expMs) {
  if (seenNonces.has(jti)) return false;
  seenNonces.set(jti, expMs);
  return true;
}

export function clientIp(req) {
  return (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.ip;
}

// Fixed-window rate limiter. keyFn(req) -> bucket key.
export function rateLimitMiddleware({ limit, windowMs, keyFn }) {
  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    let bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + windowMs };
      rateBuckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    next();
  };
}
