import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';

import Game from '../src/models/Game.js';
import { createPlatformCors } from '../src/middleware/platformCors.js';
import { contentCors, invalidateAllowedOriginsCache } from '../src/routes/gameContent.js';

// Covers the per-game CORS gate that lets an externally-hosted WebGL player
// (e.g. GitHub Pages) fetch this game's Addressables content cross-origin —
// see the "Cross-origin content serving" block in src/routes/gameContent.js.

const GAME_ID = '64b7f1c2d4e5f6a7b8c9d0e2';
const SITE_ORIGIN = (process.env.SITE_ORIGIN || 'https://arcade.codingbot.kr').replace(/\/$/, '');
const PLATFORM_CORS_ORIGIN = 'http://localhost:5173';

function baseUrl(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

async function listen(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function headRequestOnce(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method: 'HEAD', headers, agent: false }, (response) => {
      response.resume();
      response.once('end', () => resolve(response));
    });
    request.once('error', reject);
    request.end();
  });
}

async function headRequest(url, headers = {}) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await headRequestOnce(url, headers);
    } catch (error) {
      // Windows and heavily parallel CI runners can reset a just-closed
      // one-shot HEAD socket even though Express completed the response. Retry
      // only that transport failure; policy/status assertions still run once
      // a response is received.
      if (error?.code !== 'ECONNRESET' || attempt === 3) throw error;
    }
  }
  throw new Error('HEAD request did not complete');
}

let allowedOrigins = [];

const originalFindById = Game.findById;
Game.findById = (id) => ({
  select: () => ({
    lean: async () => (String(id) === GAME_ID ? { allowedOrigins } : null),
  }),
});

const app = express();
// Match index.js: the platform-wide middleware is mounted before the content
// routes. It must explicitly pass `/content/**` through or it will terminate
// OPTIONS before `contentCors` can apply the per-game origin policy.
app.use(createPlatformCors({ origin: PLATFORM_CORS_ORIGIN }));
app.options('/content/:gameId/:channel/*', contentCors);
app.head('/content/:gameId/:channel/*', contentCors, (_req, res) => res.status(200).end());
app.get('/content/:gameId/:channel/*', contentCors, (_req, res) => res.status(200).json({ ok: true }));
app.get('/api/cors-probe', (_req, res) => res.status(200).json({ ok: true }));

let server;

test.before(async () => { server = await listen(app); });
test.after(async () => {
  await close(server);
  Game.findById = originalFindById;
});

test.beforeEach(() => {
  allowedOrigins = [];
  invalidateAllowedOriginsCache(GAME_ID);
});

test('a same-origin request (no Origin header) is never CORS-gated', async () => {
  const response = await fetch(`${baseUrl(server)}/content/${GAME_ID}/live/catalog.json`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('the platform-wide CORS policy still applies outside Addressables content routes', async () => {
  const response = await fetch(`${baseUrl(server)}/api/cors-probe`, {
    headers: { Origin: PLATFORM_CORS_ORIGIN },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), PLATFORM_CORS_ORIGIN);
});

test('the platform\'s own SITE_ORIGIN is always allowed, without needing an allowlist entry', async () => {
  const response = await fetch(`${baseUrl(server)}/content/${GAME_ID}/live/catalog.json`, {
    headers: { Origin: SITE_ORIGIN },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), SITE_ORIGIN);
  assert.equal(response.headers.get('vary'), 'Origin');
});

test('an origin absent from Game.allowedOrigins gets no ACAO header, so the browser blocks it', async () => {
  allowedOrigins = ['https://someone-elses-site.example'];
  const response = await fetch(`${baseUrl(server)}/content/${GAME_ID}/live/catalog.json`, {
    headers: { Origin: 'https://not-allowed.example' },
  });
  assert.equal(response.status, 200); // server still serves the byte stream
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('a stored default port matches the canonical Origin header and gets ACAO + exposed headers', async () => {
  // Settings saved before canonicalization may still contain an explicit
  // default port, while browsers omit it from the Origin header.
  allowedOrigins = ['https://mydev.github.io:443'];
  const response = await fetch(`${baseUrl(server)}/content/${GAME_ID}/live/catalog.json`, {
    headers: { Origin: 'https://MyDev.GitHub.io' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://MyDev.GitHub.io');
  assert.equal(response.headers.get('access-control-expose-headers'), 'Content-Length, Content-Range, ETag, Accept-Ranges');
});

test('HEAD reaches the content-specific CORS policy even with platform CORS mounted first', async () => {
  allowedOrigins = ['http://localhost:5173'];
  const response = await headRequest(
    `${baseUrl(server)}/content/${GAME_ID}/live/catalog.json`,
    { Origin: 'http://localhost:5173' },
  );
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:5173');
});

test('an OPTIONS preflight from an allowed origin gets 204 with methods/headers/max-age', async () => {
  allowedOrigins = ['https://mydev.github.io'];
  const response = await fetch(`${baseUrl(server)}/content/${GAME_ID}/live/catalog.json`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://mydev.github.io', 'Access-Control-Request-Method': 'GET' },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://mydev.github.io');
  assert.equal(response.headers.get('access-control-allow-methods'), 'GET, HEAD, OPTIONS');
  assert.equal(response.headers.get('access-control-allow-headers'), 'Range, If-None-Match, If-Modified-Since');
  assert.equal(response.headers.get('access-control-max-age'), '600');
});

test('an OPTIONS preflight from a disallowed origin gets 204 with no CORS headers (blocked client-side)', async () => {
  const response = await fetch(`${baseUrl(server)}/content/${GAME_ID}/live/catalog.json`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://not-allowed.example', 'Access-Control-Request-Method': 'GET' },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('access-control-allow-methods'), null);
});

test('invalidateAllowedOriginsCache makes a newly-added origin take effect without waiting out the TTL', async () => {
  const origin = 'https://freshly-added.example';
  const before = await fetch(`${baseUrl(server)}/content/${GAME_ID}/live/catalog.json`, {
    headers: { Origin: origin },
  });
  assert.equal(before.headers.get('access-control-allow-origin'), null);

  allowedOrigins = [origin];
  invalidateAllowedOriginsCache(GAME_ID);

  const after = await fetch(`${baseUrl(server)}/content/${GAME_ID}/live/catalog.json`, {
    headers: { Origin: origin },
  });
  assert.equal(after.headers.get('access-control-allow-origin'), origin);
});

test('an invalid game id in the URL is left for the real route to 400 on, not CORS-gated', async () => {
  const response = await fetch(`${baseUrl(server)}/content/not-a-valid-id/live/catalog.json`, {
    headers: { Origin: 'https://mydev.github.io' },
  });
  assert.equal(response.status, 200); // stub handler always 200s; contentCors just passed through
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});
