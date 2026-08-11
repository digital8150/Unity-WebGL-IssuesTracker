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
    sort() {
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
    const actual = document[field];
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$lt' in expected && !(actual < expected.$lt)) return false;
      if ('$gt' in expected && !(actual > expected.$gt)) return false;
      return true;
    }
    return sameId(actual, expected);
  });
}

function modelsFor({ initialSaves = [] } = {}) {
  const users = [
    { _id: 'user-a', status: 'approved', name: 'Alice' },
    { _id: 'user-b', status: 'approved', name: 'Bob' },
  ];
  const games = [
    { _id: 'game-a', slug: 'alpha', serverBackend: { v2Enabled: true, cloudSaveEnabled: true } },
    { _id: 'game-b', slug: 'beta', serverBackend: { v2Enabled: true, cloudSaveEnabled: true } },
    { _id: 'game-off', slug: 'off', serverBackend: { v2Enabled: true, cloudSaveEnabled: false } },
  ];
  const state = initialSaves.map((save, index) => ({
    _id: save._id ?? `save-${index}`,
    createdAt: save.createdAt ?? new Date('2026-08-12T00:00:00.000Z'),
    updatedAt: save.updatedAt ?? new Date('2026-08-12T00:00:00.000Z'),
    rev: 1,
    isDev: false,
    ...save,
  }));
  let nextId = state.length;

  const CloudSave = {
    rows: state,
    findOne(filter) {
      return query(state.find((save) => matches(save, filter)) ?? null);
    },
    countDocuments(filter) {
      return Promise.resolve(state.filter((save) => matches(save, filter)).length);
    },
    async create(document) {
      const now = new Date();
      const save = {
        _id: `save-${nextId++}`,
        createdAt: now,
        updatedAt: now,
        ...document,
      };
      state.push(save);
      return save;
    },
    async updateOne(filter, update, options = {}) {
      let save = state.find((candidate) => matches(candidate, filter));
      if (!save && options.upsert) {
        save = { ...filter, ...(update.$setOnInsert ?? {}) };
        save._id = `save-${nextId++}`;
        save.createdAt = new Date();
        state.push(save);
      }
      if (!save) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(save, update.$set ?? {});
      for (const [field, amount] of Object.entries(update.$inc ?? {})) save[field] = Number(save[field] ?? 0) + amount;
      save.updatedAt = new Date();
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async deleteOne(filter) {
      const index = state.findIndex((save) => matches(save, filter));
      if (index < 0) return { deletedCount: 0 };
      state.splice(index, 1);
      return { deletedCount: 1 };
    },
  };

  return {
    saveModel: CloudSave,
    User: { findById: (id) => query(users.find((user) => sameId(user._id, id)) ?? null) },
    Game: {
      findById: (id) => query(games.find((game) => sameId(game._id, id)) ?? null),
      findOne: (filter) => query(games.find((game) => matches(game, filter)) ?? null),
    },
    Leaderboard: { findOne: () => query(null) },
    GameConfig: { findOne: () => query(null) },
    LeaderboardScore: {},
    CloudSave,
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

test('cloud saves preserve JSON source, revisions, CAS conflicts, and delete behavior', async (t) => {
  const models = modelsFor();
  const server = await start(models);
  t.after(() => server.close());
  const alice = token();

  const first = await request(server, '/api/v2/saves/main', {
    token: alice,
    method: 'PUT',
    body: { data: '{"message":"한글"}' },
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.data, '{"message":"한글"}');
  assert.equal(first.body.rev, 1);
  assert.equal(first.body.size, Buffer.byteLength(first.body.data, 'utf8'));

  const updated = await request(server, '/api/v2/saves/main', {
    token: alice,
    method: 'PUT',
    body: { data: '{"message":"next"}', rev: 1 },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.rev, 2);

  const conflict = await request(server, '/api/v2/saves/main', {
    token: alice,
    method: 'PUT',
    body: { data: '{"message":"stale"}', rev: 1 },
  });
  assert.equal(conflict.status, 409);
  assert.deepEqual(conflict.body, {
    error: 'Save conflict',
    code: 'save_conflict',
    rev: 2,
    data: '{"message":"next"}',
  });

  const loaded = await request(server, '/api/v2/saves/main', { token: alice });
  assert.equal(loaded.status, 200);
  assert.equal(loaded.body.data, '{"message":"next"}');

  const deleted = await request(server, '/api/v2/saves/main', { token: alice, method: 'DELETE' });
  assert.deepEqual(deleted, { status: 200, body: { ok: true } });
  const missing = await request(server, '/api/v2/saves/main', { token: alice });
  assert.equal(missing.status, 404);
});

test('cloud saves enforce JSON, UTF-8 byte, slot-name, and feature gates', async (t) => {
  const models = modelsFor();
  const server = await start(models);
  t.after(() => server.close());
  const alice = token();

  const invalidJson = await request(server, '/api/v2/saves/main', {
    token: alice,
    method: 'PUT',
    body: { data: '{not json}' },
  });
  assert.equal(invalidJson.status, 400);

  const tooLarge = await request(server, '/api/v2/saves/main', {
    token: alice,
    method: 'PUT',
    body: { data: JSON.stringify({ value: '가'.repeat(22_000) }) },
  });
  assert.equal(tooLarge.status, 400);
  assert.match(tooLarge.body.error, /64 KiB/i);

  const invalidSlot = await request(server, '/api/v2/saves/BadSlot', {
    token: alice,
    method: 'PUT',
    body: { data: '{}' },
  });
  assert.equal(invalidSlot.status, 400);

  const disabled = await request(server, '/api/v2/saves/main', {
    token: token('user-a', 'game-off'),
  });
  assert.equal(disabled.status, 404);
  assert.match(disabled.body.error, /not enabled/i);
});

test('save writes are scoped to token game and cap users at eight slots', async (t) => {
  const initialSaves = Array.from({ length: 8 }, (_, index) => ({
    gameId: 'game-a',
    userId: 'user-a',
    slot: `slot-${index}`,
    data: '{}',
    size: 2,
    rev: 1,
  }));
  const models = modelsFor({ initialSaves });
  const server = await start(models);
  t.after(() => server.close());

  const full = await request(server, '/api/v2/saves/new-slot', {
    token: token(),
    method: 'PUT',
    body: { data: '{}' },
  });
  assert.equal(full.status, 409);
  assert.equal(full.body.code, 'save_slots_full');

  const otherGame = await request(server, '/api/v2/saves/main', {
    token: token('user-b', 'game-b', 'Bob'),
  });
  assert.equal(otherGame.status, 404);
});

test('CAS against a missing slot reports save_conflict before slot capacity', async (t) => {
  const initialSaves = Array.from({ length: 8 }, (_, index) => ({
    gameId: 'game-a',
    userId: 'user-a',
    slot: `slot-${index}`,
    data: '{}',
    size: 2,
    rev: 1,
  }));
  const models = modelsFor({ initialSaves });
  const server = await start(models);
  t.after(() => server.close());

  const response = await request(server, '/api/v2/saves/missing', {
    token: token(),
    method: 'PUT',
    body: { data: '{}', rev: 1 },
  });

  assert.deepEqual(response, {
    status: 409,
    body: { error: 'Save conflict', code: 'save_conflict', rev: null, data: null },
  });
});
