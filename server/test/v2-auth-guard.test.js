import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import express from 'express';

import { apiV2Router } from '../src/routes/apiV2.js';
import { signGameToken } from '../src/services/gameToken.js';
import { matches, query, sameId } from './helpers/fake-models.js';

process.env.JWT_SECRET ||= 'v2-route-test-site-secret';

function fakeModels() {
  const users = [{ _id: 'user-a', status: 'approved', name: 'Alice', email: 'alice@example.test' }];
  const games = [
    { _id: 'game-a', slug: 'alpha', serverBackend: { v2Enabled: true, cloudSaveEnabled: false } },
    { _id: 'game-b', slug: 'beta', serverBackend: { v2Enabled: true, cloudSaveEnabled: false } },
  ];
  const leaderboards = [{ _id: 'lb-b', gameId: 'game-b', key: 'main', sort: 'desc', maxEntries: 10, enabled: true }];
  const calls = [];

  return {
    calls,
    User: {
      findById(id) {
        return query(users.find((user) => sameId(user._id, id)) ?? null);
      },
    },
    Game: {
      findById(id) {
        return query(games.find((game) => sameId(game._id, id)) ?? null);
      },
      findOne(filter) {
        return query(games.find((game) => matches(game, filter)) ?? null);
      },
    },
    Leaderboard: {
      findOne(filter) {
        calls.push(filter);
        return query(leaderboards.find((leaderboard) => matches(leaderboard, filter)) ?? null);
      },
    },
    GameConfig: { findOne: () => query(null) },
    LeaderboardScore: {
      find: () => query([]),
      findOne: () => query(null),
      countDocuments: () => Promise.resolve(0),
    },
    CloudSave: {},
  };
}

async function start(models) {
  const app = express();
  app.use(express.json());
  app.use('/api/v2', apiV2Router({ models }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  return server;
}

async function request(server, path, { token, method = 'GET' } = {}) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const requestObject = http.request({
      host: address.address,
      port: address.port,
      path,
      method,
      headers: token ? { authorization: `Bearer ${token}` } : {},
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
    requestObject.end();
  });
}

test('game A token cannot read game B leaderboard data', async (t) => {
  const models = fakeModels();
  const server = await start(models);
  t.after(() => server.close());

  const token = signGameToken({ userId: 'user-a', gameId: 'game-a', displayName: 'Alice' });
  const response = await request(server, '/api/v2/leaderboards/main', { token });

  assert.equal(response.status, 404);
  assert.equal(response.body.error, 'Leaderboard not found');
  assert.deepEqual(models.calls.at(-1), { gameId: 'game-a', key: 'main' });
});

test('game token routes reject missing credentials before querying a board', async (t) => {
  const models = fakeModels();
  const server = await start(models);
  t.after(() => server.close());

  const response = await request(server, '/api/v2/leaderboards/main');

  assert.equal(response.status, 401);
  assert.equal(response.body.error, 'Unauthorized');
  assert.equal(models.calls.length, 0);
});

test('play-token is issued for an eligible member and enabled game', async (t) => {
  const models = fakeModels();
  const server = await start(models);
  t.after(() => server.close());

  const siteToken = jwt.sign({ sub: 'user-a' }, process.env.JWT_SECRET);
  const response = await request(server, '/api/v2/games/alpha/play-token', { token: siteToken, method: 'POST' });

  assert.equal(response.status, 200);
  assert.equal(response.body.userId, 'user-a');
  assert.equal(response.body.displayName, 'Alice');
  assert.equal(typeof response.body.token, 'string');
  assert.equal(typeof response.body.expiresAt, 'string');
});

test('me and config reads use the game token identity', async (t) => {
  const models = fakeModels();
  models.GameConfig = {
    findOne(filter) {
      const config = { gameId: 'game-a', key: 'welcome.message', value: 'hello', enabled: true };
      return query(matches(config, filter) ? config : null);
    },
  };
  const server = await start(models);
  t.after(() => server.close());
  const gameToken = signGameToken({ userId: 'user-a', gameId: 'game-a', displayName: 'Alice' });

  const me = await request(server, '/api/v2/me', { token: gameToken });
  assert.deepEqual(me, { status: 200, body: { userId: 'user-a', displayName: 'Alice' } });

  const config = await request(server, '/api/v2/config/welcome.message', { token: gameToken });
  assert.deepEqual(config, { status: 200, body: { key: 'welcome.message', value: 'hello' } });
});
