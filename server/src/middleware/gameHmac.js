import Game from '../models/Game.js';
import { hmacHex, sha256Hex, timingSafeEqualHex, verifySessionToken, isTimestampFresh } from '../services/gameSecret.js';
import { consumeNonce } from '../services/rateLimiter.js';

// Verifies the X-Arcade-* signed-request headers against a game resolved from
// req.params.gameSlug. On success sets req.game and req.sessionPayload.
//
// options.requireFeature: 'leaderboardEnabled' | 'configEnabled' | null
//   — 403s if the game hasn't turned that feature on.
// options.consumeNonce: true for score submission (single-use), false for reads
//   (a session token may serve many reads within its lifetime).
export function verifyGameHmac({ requireFeature = null, consumeNonce: shouldConsumeNonce = false } = {}) {
  return async (req, res, next) => {
    try {
      const game = await Game.findOne({ slug: req.params.gameSlug });
      if (!game) return res.status(404).json({ error: 'Game not found' });
      if (!game.serverBackend?.secret) {
        return res.status(403).json({ error: 'Server backend not provisioned for this game' });
      }
      if (requireFeature && !game.serverBackend[requireFeature]) {
        return res.status(403).json({ error: 'Feature not enabled for this game' });
      }

      const sessionToken = req.headers['x-arcade-session'];
      const timestamp = req.headers['x-arcade-timestamp'];
      const signature = req.headers['x-arcade-signature'];
      if (!sessionToken || !timestamp || !signature) {
        return res.status(401).json({ error: 'Missing signed request headers' });
      }
      if (!isTimestampFresh(timestamp)) {
        return res.status(401).json({ error: 'Stale or invalid timestamp' });
      }

      const payload = verifySessionToken(sessionToken, game);
      if (!payload) return res.status(401).json({ error: 'Invalid or expired session' });

      const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';
      const path = req.originalUrl.split('?')[0];
      const canonical = [req.method, path, String(timestamp), sessionToken, sha256Hex(rawBody)].join('\n');
      const expectedSig = hmacHex(game.serverBackend.secret, canonical);
      if (!timingSafeEqualHex(signature, expectedSig)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      if (shouldConsumeNonce && !consumeNonce(payload.jti, payload.exp)) {
        return res.status(409).json({ error: 'Replay detected' });
      }

      req.game = game;
      req.sessionPayload = payload;
      next();
    } catch (err) {
      next(err);
    }
  };
}
