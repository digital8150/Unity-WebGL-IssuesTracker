import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';

import { apiV2Router } from '../src/routes/apiV2.js';
import { signGameToken } from '../src/services/gameToken.js';

function query(value) {
  let current = value;
  const chain = {
    select() {
      return chain;
    },
    sort(specification) {
      if (Array.isArray(current) && specification) {
        current = [...current].sort((left, right) => {
          for (const [field, direction] of Object.entries(specification)) {
            const a = left?.[field] instanceof Date ? left[field].getTime() : left?.[field];
            const b = right?.[field] instanceof Date ? right[field].getTime() : right?.[field];
            if (a === b) continue;
            return (a < b ? -1 : 1) * Number(direction);
          }
          return 0;
        });
      }
      return chain;
    },
    limit(valueLimit) {
      if (Array.isArray(current)) current = current.slice(0, valueLimit);
      return chain;
    },
    lean() {
      return Promise.resolve(current);
    },
    exec() {
      return Promise.resolve(current);
    },
    then(resolve, reject) {
      return Promise.resolve(current).then(resolve, reject);
    },
  };
  return chain;
}

function sameId(left, right) {
  return String(left?._id ?? left?.id ?? left) === String(right?._id ?? right?.id ?? right);
}

function matches(document, filter) {
  if (!document) return false;
  return Object.entries(filter ?? {}).every(([field, expected]) => {
    if (field === '$or') return expected.some((branch) => matches(document, branch));
    const actual = document[field];
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$lt' in expected && !(actual < expected.$lt)) return false;
      if ('$gt' in expected && !(actual > expected.$gt)) return false;
      return true;
    }
    return sameId(actual, expected);
  });
}

function modelsFor({ scores = [] } = {}) {
  const users = [
    { _id: 'user-a', status: 'approved', name: 'Alice' },
    { _id: 'user-b', status: 'approved', name: 'Bob' },
    { _id: 'user-c', status: 'approved', name: 'Carol' },
  ];
  const games = [{ _id: 'game-a', slug: 'alpha', serverBackend: { v2Enabled: true, cloudSaveEnabled: false } }];
  const leaderboards = [
    { _id: 'lb-desc', gameId: 'game-a', key: 'main', sort: 'desc', maxEntries: 10, scoreMin: 0, scoreMax: 1000, enabled: true },
    { _id: 'lb-asc', gameId: 'game-a', key: 'time', sort: 'asc', maxEntries: 10, scoreMin: 0, scoreMax: 1000, enabled: true },
  ];
  const state = scores.map((score) => ({ ...score }));
  const updates = [];

  const scoreModel = {
    updates,
    rows: state,
    find(filter) {
      return query(state.filter((row) => matches(row, filter)));
    },
    findOne(filter) {
      return query(state.find((row) => matches(row, filter)) ?? null);
    },
    countDocuments(filter) {
      return Promise.resolve(state.filter((row) => matches(row, filter)).length);
    },
    async updateOne(filter, update, options = {}) {
      updates.push({ filter, update, options });
      let row = state.find((candidate) => matches(candidate, filter));
      if (!row && options.upsert) {
        row = {
          ...filter,
          ...update.$setOnInsert,
          playCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        state.push(row);
      }
      if (!row) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(row, update.$set ?? {});
      for (const [field, amount] of Object.entries(update.$inc ?? {})) row[field] = Number(row[field] ?? 0) + amount;
      row.updatedAt = new Date();
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };

  return {
    scoreModel,
    User: { findById: (id) => query(users.find((user) => sameId(user._id, id)) ?? null) },
    Game: {
      findById: (id) => query(games.find((game) => sameId(game._id, id)) ?? null),
      findOne: (filter) => query(games.find((game) => matches(game, filter)) ?? null),
    },
    Leaderboard: { findOne: (filter) => query(leaderboards.find((lb) => matches(lb, filter)) ?? null) },
    GameConfig: { findOne: () => query(null) },
    LeaderboardScore: scoreModel,
    CloudSave: {},
  };
}

async function start(models) {
  const app = express();
  app.use(express.json());
  app.use('/api/v2', apiV2Router({ models }));
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
        ...(payload === null ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }),
      },
    }, (response) => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: raw ? JSON.parse(raw) : null }));
    });
    requestObject.on('error', reject);
    if (payload !== null) requestObject.write(payload);
    requestObject.end();
  });
}

function token(userId = 'user-a', gameId = 'game-a', displayName = 'Alice') {
  return signGameToken({ userId, gameId, displayName });
}

test('score submission uses token display name, validates bounds, and emits two writes', async (t) => {
  const models = modelsFor();
  const server = await start(models);
  t.after(() => server.close());

  const response = await request(server, '/api/v2/leaderboards/main/scores', {
    token: token(),
    method: 'POST',
    body: { score: 125, name: 'attacker', meta: { stage: 2 } },
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.rank, 1);
  assert.equal(models.scoreModel.updates.length, 2);
  assert.equal(models.scoreModel.updates[0].update.$set.displayName, 'Alice');
  assert.deepEqual(models.scoreModel.rows[0].meta, { stage: 2 });

  const invalid = await request(server, '/api/v2/leaderboards/main/scores', {
    token: token(),
    method: 'POST',
    body: { score: 1001 },
  });
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error, /maximum/i);

  const oversizedMeta = await request(server, '/api/v2/leaderboards/main/scores', {
    token: token(),
    method: 'POST',
    body: { score: 200, meta: { value: 'x'.repeat(600) } },
  });
  assert.equal(oversizedMeta.status, 400);
  assert.match(oversizedMeta.body.error, /meta payload too large/i);
});

test('leaderboard and my-rank apply score order and earlier-tie ranking', async (t) => {
  const models = modelsFor({
    scores: [
      { _id: 'score-b', leaderboardId: 'lb-desc', gameId: 'game-a', userId: 'user-b', displayName: 'Bob', score: 200, bestAt: new Date('2026-08-12T00:00:00.000Z'), playCount: 1 },
      { _id: 'score-a', leaderboardId: 'lb-desc', gameId: 'game-a', userId: 'user-a', displayName: 'Alice', score: 200, bestAt: new Date('2026-08-12T00:00:01.000Z'), playCount: 1 },
      { _id: 'score-c', leaderboardId: 'lb-desc', gameId: 'game-a', userId: 'user-c', displayName: 'Carol', score: 100, bestAt: new Date('2026-08-12T00:00:02.000Z'), playCount: 1 },
    ],
  });
  const server = await start(models);
  t.after(() => server.close());
  const alice = token();

  const board = await request(server, '/api/v2/leaderboards/main?limit=2', { token: alice });
  assert.equal(board.status, 200);
  assert.deepEqual(board.body.entries, [
    { rank: 1, userId: 'user-b', displayName: 'Bob', score: 200, isMe: false },
    { rank: 2, userId: 'user-a', displayName: 'Alice', score: 200, isMe: true },
  ]);

  const mine = await request(server, '/api/v2/leaderboards/main/me', { token: alice });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.entry.rank, 2);
  assert.equal(mine.body.entry.isMe, true);
  assert.equal(mine.body.entry.score, 200);
});

test('ascending boards use the same public entry shape', async (t) => {
  const models = modelsFor({
    scores: [
      { leaderboardId: 'lb-asc', gameId: 'game-a', userId: 'user-a', displayName: 'Alice', score: 12, bestAt: new Date('2026-08-12T00:00:00.000Z') },
      { leaderboardId: 'lb-asc', gameId: 'game-a', userId: 'user-b', displayName: 'Bob', score: 20, bestAt: new Date('2026-08-12T00:00:01.000Z') },
    ],
  });
  const server = await start(models);
  t.after(() => server.close());

  const board = await request(server, '/api/v2/leaderboards/time', { token: token() });
  assert.equal(board.status, 200);
  assert.equal(board.body.entries[0].userId, 'user-a');
  assert.equal(board.body.entries[0].rank, 1);
  assert.equal(board.body.entries[1].rank, 2);
});

test('best-score updates only when the submitted value improves', async (t) => {
  const bestAt = new Date('2026-08-12T00:00:00.000Z');
  const models = modelsFor({
    scores: [
      { leaderboardId: 'lb-desc', gameId: 'game-a', userId: 'user-a', displayName: 'Alice', score: 100, bestAt, playCount: 1 },
      { leaderboardId: 'lb-asc', gameId: 'game-a', userId: 'user-b', displayName: 'Bob', score: 50, bestAt, playCount: 1 },
    ],
  });
  const server = await start(models);
  t.after(() => server.close());

  await request(server, '/api/v2/leaderboards/main/scores', {
    token: token(), method: 'POST', body: { score: 90 },
  });
  assert.equal(models.scoreModel.rows.find((row) => row.leaderboardId === 'lb-desc').score, 100);

  await request(server, '/api/v2/leaderboards/main/scores', {
    token: token(), method: 'POST', body: { score: 120 },
  });
  assert.equal(models.scoreModel.rows.find((row) => row.leaderboardId === 'lb-desc').score, 120);

  await request(server, '/api/v2/leaderboards/time/scores', {
    token: token('user-b', 'game-a', 'Bob'), method: 'POST', body: { score: 60 },
  });
  assert.equal(models.scoreModel.rows.find((row) => row.leaderboardId === 'lb-asc').score, 50);

  await request(server, '/api/v2/leaderboards/time/scores', {
    token: token('user-b', 'game-a', 'Bob'), method: 'POST', body: { score: 40 },
  });
  assert.equal(models.scoreModel.rows.find((row) => row.leaderboardId === 'lb-asc').score, 40);
});
