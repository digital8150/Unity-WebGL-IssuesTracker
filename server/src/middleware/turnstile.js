const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

async function verifyToken(token, remoteip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // dev: skip when unconfigured

  const body = new URLSearchParams({ secret, response: token });
  if (remoteip) body.set('remoteip', remoteip);

  const res = await fetch(VERIFY_URL, { method: 'POST', body });
  const data = await res.json();
  return Boolean(data.success);
}

/** Require a valid Turnstile token for all callers. */
export function requireTurnstile(req, res, next) {
  if (!process.env.TURNSTILE_SECRET_KEY) return next();

  const token = req.body?.turnstileToken;
  if (!token) return res.status(400).json({ error: 'Bot challenge token missing' });

  const ip = (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.ip;
  verifyToken(token, ip)
    .then((ok) => {
      if (!ok) return res.status(403).json({ error: 'Bot challenge failed' });
      next();
    })
    .catch(next);
}

/** Require a valid Turnstile token only when the caller is not authenticated.
 *  Must be used after optionalAuth so req.user is already populated. */
export function requireTurnstileIfGuest(req, res, next) {
  if (!process.env.TURNSTILE_SECRET_KEY) return next();
  if (req.user) return next(); // authenticated users are trusted

  const token = req.body?.turnstileToken;
  if (!token) return res.status(400).json({ error: 'Bot challenge token missing' });

  const ip = (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.ip;
  verifyToken(token, ip)
    .then((ok) => {
      if (!ok) return res.status(403).json({ error: 'Bot challenge failed' });
      next();
    })
    .catch(next);
}
