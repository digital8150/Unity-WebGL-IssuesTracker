import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';

import Game from '../src/models/Game.js';
import User from '../src/models/User.js';
import backendRouter, { nextV2DevTokenIssuedAt } from '../src/routes/backend.js';
import { requireGameToken, clearGameAuthCache } from '../src/middleware/gameAuth.js';
import { GAME_DEV_TOKEN_TTL_S, verifyGameToken } from '../src/services/gameToken.js';

function query(value) {
  const chain = {
    select() {
      return chain;
    },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    },
  };
  return chain;
}

function siteToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET);
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/games', backendRouter);
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function request(server, path, { token, method = 'GET', body } = {}) {
  const address = server.address();
  const payload = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const requestObject = http.request({
      host: address.address,
      port: address.port,
      path,
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(payload === null ? {} : {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        }),
      },
    }, (response) => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => resolve({
        status: response.statusCode,
        body: raw ? JSON.parse(raw) : null,
      }));
    });
    requestObject.on('error', reject);
    if (payload !== null) requestObject.write(payload);
    requestObject.end();
  });
}

function invokeGameAuth(middleware, token) {
  return new Promise((resolve, reject) => {
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = {
      status(code) {
        return {
          json(body) {
            resolve({ status: code, body });
          },
        };
      },
    };
    middleware(req, res, (error) => {
      if (error) reject(error);
      else resolve({ status: 200, token: req.gameToken });
    });
  });
}

test('developer tokens use live names, monotonic revocation markers, and backend flags', async (t) => {
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalGameFindById = Game.findById;
  const originalUserFindById = User.findById;
  const originalDateNow = Date.now;
  process.env.JWT_SECRET = 'site-secret-for-dev-token-test';

  const fixedNow = Math.floor(originalDateNow() / 1000) * 1000;
  Date.now = () => fixedNow;
  const users = new Map([
    ['owner', { _id: 'owner', status: 'approved', role: 'user', name: 'Owner v1' }],
    ['collaborator', { _id: 'collaborator', status: 'approved', role: 'user', name: 'Collaborator' }],
    ['outsider', { _id: 'outsider', status: 'approved', role: 'user', name: 'Outsider' }],
    ['rejected', { _id: 'rejected', status: 'rejected', role: 'user', name: 'Rejected' }],
  ]);
  const game = {
    _id: 'game-a',
    ownerId: 'owner',
    collaborators: ['collaborator'],
    serverBackend: {
      v2Enabled: false,
      cloudSaveEnabled: false,
      v2DevTokenIssuedAt: null,
    },
    async save() {},
  };

  User.findById = (id) => query(users.get(String(id)) ?? null);
  Game.findById = (id) => query(String(id) === game._id ? game : null);
  clearGameAuthCache();

  const server = await startServer();
  t.after(() => {
    server.close();
    Game.findById = originalGameFindById;
    User.findById = originalUserFindById;
    Date.now = originalDateNow;
    clearGameAuthCache();
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  const first = await request(server, '/api/games/game-a/backend/v2/dev-token', {
    method: 'POST',
    token: siteToken('owner'),
  });
  assert.equal(first.status, 200);
  assert.equal(typeof first.body.token, 'string');
  assert.equal(typeof first.body.expiresAt, 'string');
  const firstClaims = verifyGameToken(first.body.token);
  assert.equal(firstClaims?.dev, true);
  assert.equal(firstClaims?.name, 'Owner v1');
  assert.equal(firstClaims?.iat, Math.floor(fixedNow / 1000));
  assert.equal(firstClaims?.exp - firstClaims?.iat, GAME_DEV_TOKEN_TTL_S);
  assert.equal(first.body.expiresAt, new Date(firstClaims.exp * 1000).toISOString());
  assert.equal(game.serverBackend.v2DevTokenIssuedAt.getTime(), firstClaims.iat * 1000);

  users.get('owner').name = 'Owner renamed live';
  const second = await request(server, '/api/games/game-a/backend/v2/dev-token', {
    method: 'POST',
    token: siteToken('owner'),
  });
  assert.equal(second.status, 200);
  const secondClaims = verifyGameToken(second.body.token);
  assert.equal(secondClaims?.name, 'Owner renamed live');
  assert.equal(secondClaims?.iat, firstClaims.iat + 1);
  assert.equal(game.serverBackend.v2DevTokenIssuedAt.getTime(), secondClaims.iat * 1000);

  const authModels = {
    User: { findById: (id) => query(users.get(String(id)) ?? null) },
    Game: { findById: () => query(game) },
  };
  const readToken = requireGameToken({ models: authModels });
  clearGameAuthCache(authModels.User);
  const revoked = await invokeGameAuth(readToken, first.body.token);
  assert.equal(revoked.status, 401);
  assert.equal(revoked.body.code, 'token_revoked');
  const current = await invokeGameAuth(readToken, second.body.token);
  assert.equal(current.status, 200);
  assert.equal(current.token.name, 'Owner renamed live');

  const collaborator = await request(server, '/api/games/game-a/backend/v2/dev-token', {
    method: 'POST',
    token: siteToken('collaborator'),
  });
  assert.equal(collaborator.status, 200);

  const outsider = await request(server, '/api/games/game-a/backend/v2/dev-token', {
    method: 'POST',
    token: siteToken('outsider'),
  });
  assert.equal(outsider.status, 404);

  const rejected = await request(server, '/api/games/game-a/backend/v2/dev-token', {
    method: 'POST',
    token: siteToken('rejected'),
  });
  assert.equal(rejected.status, 403);

  const flags = await request(server, '/api/games/game-a/backend', {
    method: 'PATCH',
    token: siteToken('owner'),
    body: { v2Enabled: true, cloudSaveEnabled: true },
  });
  assert.equal(flags.status, 200);
  assert.equal(flags.body.serverBackend.v2Enabled, true);
  assert.equal(flags.body.serverBackend.cloudSaveEnabled, true);
  assert.equal(nextV2DevTokenIssuedAt(new Date(fixedNow), fixedNow), Math.floor(fixedNow / 1000) + 1);
});
