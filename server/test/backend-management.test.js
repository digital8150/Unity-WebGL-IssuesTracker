import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';

import Game from '../src/models/Game.js';
import User from '../src/models/User.js';
import Leaderboard from '../src/models/Leaderboard.js';
import LeaderboardScore from '../src/models/LeaderboardScore.js';
import CloudSave from '../src/models/CloudSave.js';
import backendRouter from '../src/routes/backend.js';

process.env.JWT_SECRET ||= 'backend-management-test-secret';

function sameId(left, right) {
  return String(left?._id ?? left?.id ?? left) === String(right?._id ?? right?.id ?? right);
}

function matches(document, filter) {
  if (!document) return false;
  return Object.entries(filter ?? {}).every(([field, expected]) => sameId(document[field], expected));
}

function query(value) {
  let current = value;
  const chain = {
    select(fields) {
      if (String(fields).startsWith('-') && Array.isArray(current)) {
        const field = String(fields).slice(1);
        current = current.map((item) => {
          const clone = { ...item };
          delete clone[field];
          return clone;
        });
      }
      return chain;
    },
    sort(specification) {
      if (Array.isArray(current)) {
        current = [...current].sort((left, right) => {
          for (const [field, direction] of Object.entries(specification ?? {})) {
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
    skip(amount) {
      if (Array.isArray(current)) current = current.slice(amount);
      return chain;
    },
    limit(amount) {
      if (Array.isArray(current)) current = current.slice(0, amount);
      return chain;
    },
    lean() {
      return Promise.resolve(current);
    },
    then(resolve, reject) {
      return Promise.resolve(current).then(resolve, reject);
    },
  };
  return chain;
}

function makeModels() {
  const users = new Map([
    ['owner', { _id: 'owner', status: 'approved', role: 'user', name: 'Owner' }],
    ['collaborator', { _id: 'collaborator', status: 'approved', role: 'user', name: 'Collaborator' }],
    ['admin', { _id: 'admin', status: 'approved', role: 'admin', name: 'Admin' }],
    ['outsider', { _id: 'outsider', status: 'approved', role: 'user', name: 'Outsider' }],
    ['rejected', { _id: 'rejected', status: 'rejected', role: 'user', name: 'Rejected' }],
  ]);
  const games = [
    { _id: 'game-a', ownerId: 'owner', collaborators: ['collaborator'], serverBackend: {} },
    { _id: 'game-b', ownerId: 'other-owner', collaborators: [], serverBackend: {} },
  ];
  const leaderboards = [
    {
      _id: 'lb-a',
      gameId: 'game-a',
      key: 'main',
      sort: 'desc',
      enabled: true,
      entries: [{ _id: 'legacy-a', name: 'Legacy A', score: 2 }],
    },
    { _id: 'lb-b', gameId: 'game-b', key: 'main', sort: 'desc', enabled: true, entries: [] },
  ];
  const scores = [
    ...Array.from({ length: 51 }, (_, index) => ({
      _id: `score-a-${index}`,
      gameId: 'game-a',
      leaderboardId: 'lb-a',
      userId: `user-${index}`,
      displayName: `Player ${index}`,
      score: 1000 - index,
      playCount: index + 1,
      isDev: index === 1,
      bestAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
      updatedAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
    })),
    {
      _id: 'score-b-1',
      gameId: 'game-b',
      leaderboardId: 'lb-b',
      userId: 'other-user',
      displayName: 'Other game',
      score: 9999,
      playCount: 9,
      isDev: true,
      bestAt: new Date(2026, 0, 1),
      updatedAt: new Date(2026, 0, 1),
    },
  ];
  const saves = [
    { _id: 'save-a-1', gameId: 'game-a', userId: 'user-1', slot: 'main', data: '{"coins":1}', size: 11, rev: 2, isDev: false, updatedAt: new Date('2026-01-02'), createdAt: new Date('2026-01-01') },
    { _id: 'save-a-2', gameId: 'game-a', userId: 'user-2', slot: 'test', data: '{"coins":2}', size: 11, rev: 1, isDev: true, updatedAt: new Date('2026-01-01'), createdAt: new Date('2026-01-01') },
    { _id: 'save-b-1', gameId: 'game-b', userId: 'other-user', slot: 'main', data: '{"coins":99}', size: 12, rev: 1, isDev: true, updatedAt: new Date('2026-01-03'), createdAt: new Date('2026-01-03') },
  ];
  const calls = { scoreFind: [], scoreCount: [], scoreDelete: [], scoreDeleteMany: [], saveFind: [], saveCount: [], saveDelete: [], saveDeleteMany: [], leaderboardUpdate: [] };

  const UserModel = {
    findById(id) {
      return query(users.get(String(id)) ?? null);
    },
  };
  const GameModel = {
    findById(id) {
      return query(games.find((game) => sameId(game._id, id)) ?? null);
    },
  };
  const LeaderboardModel = {
    findOne(filter) {
      return query(leaderboards.find((leaderboard) => matches(leaderboard, filter)) ?? null);
    },
    async updateOne(filter, update) {
      calls.leaderboardUpdate.push({ filter, update });
      const leaderboard = leaderboards.find((candidate) => matches(candidate, filter));
      if (!leaderboard) return { matchedCount: 0, modifiedCount: 0 };
      if (update.$set?.entries) leaderboard.entries = update.$set.entries;
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
  const ScoreModel = {
    find(filter) {
      calls.scoreFind.push(filter);
      return query(scores.filter((score) => matches(score, filter)));
    },
    countDocuments(filter) {
      calls.scoreCount.push(filter);
      return Promise.resolve(scores.filter((score) => matches(score, filter)).length);
    },
    async deleteOne(filter) {
      calls.scoreDelete.push(filter);
      const index = scores.findIndex((score) => matches(score, filter));
      if (index < 0) return { deletedCount: 0 };
      scores.splice(index, 1);
      return { deletedCount: 1 };
    },
    async deleteMany(filter) {
      calls.scoreDeleteMany.push(filter);
      const kept = scores.filter((score) => !matches(score, filter));
      const deletedCount = scores.length - kept.length;
      scores.splice(0, scores.length, ...kept);
      return { deletedCount };
    },
  };
  const SaveModel = {
    find(filter) {
      calls.saveFind.push(filter);
      return query(saves.filter((save) => matches(save, filter)));
    },
    countDocuments(filter) {
      calls.saveCount.push(filter);
      return Promise.resolve(saves.filter((save) => matches(save, filter)).length);
    },
    async deleteOne(filter) {
      calls.saveDelete.push(filter);
      const index = saves.findIndex((save) => matches(save, filter));
      if (index < 0) return { deletedCount: 0 };
      saves.splice(index, 1);
      return { deletedCount: 1 };
    },
    async deleteMany(filter) {
      calls.saveDeleteMany.push(filter);
      const kept = saves.filter((save) => !matches(save, filter));
      const deletedCount = saves.length - kept.length;
      saves.splice(0, saves.length, ...kept);
      return { deletedCount };
    },
  };

  return {
    games,
    users,
    scores,
    saves,
    calls,
    User: UserModel,
    Game: GameModel,
    Leaderboard: LeaderboardModel,
    LeaderboardScore: ScoreModel,
    CloudSave: SaveModel,
  };
}

function patchModels(models) {
  const originals = {
    user: User.findById,
    game: Game.findById,
    leaderboardFindOne: Leaderboard.findOne,
    leaderboardUpdateOne: Leaderboard.updateOne,
    scoreFind: LeaderboardScore.find,
    scoreCount: LeaderboardScore.countDocuments,
    scoreDelete: LeaderboardScore.deleteOne,
    scoreDeleteMany: LeaderboardScore.deleteMany,
    saveFind: CloudSave.find,
    saveCount: CloudSave.countDocuments,
    saveDelete: CloudSave.deleteOne,
    saveDeleteMany: CloudSave.deleteMany,
  };
  User.findById = models.User.findById;
  Game.findById = models.Game.findById;
  Leaderboard.findOne = models.Leaderboard.findOne;
  Leaderboard.updateOne = models.Leaderboard.updateOne;
  LeaderboardScore.find = models.LeaderboardScore.find;
  LeaderboardScore.countDocuments = models.LeaderboardScore.countDocuments;
  LeaderboardScore.deleteOne = models.LeaderboardScore.deleteOne;
  LeaderboardScore.deleteMany = models.LeaderboardScore.deleteMany;
  CloudSave.find = models.CloudSave.find;
  CloudSave.countDocuments = models.CloudSave.countDocuments;
  CloudSave.deleteOne = models.CloudSave.deleteOne;
  CloudSave.deleteMany = models.CloudSave.deleteMany;
  return () => {
    User.findById = originals.user;
    Game.findById = originals.game;
    Leaderboard.findOne = originals.leaderboardFindOne;
    Leaderboard.updateOne = originals.leaderboardUpdateOne;
    LeaderboardScore.find = originals.scoreFind;
    LeaderboardScore.countDocuments = originals.scoreCount;
    LeaderboardScore.deleteOne = originals.scoreDelete;
    LeaderboardScore.deleteMany = originals.scoreDeleteMany;
    CloudSave.find = originals.saveFind;
    CloudSave.countDocuments = originals.saveCount;
    CloudSave.deleteOne = originals.saveDelete;
    CloudSave.deleteMany = originals.saveDeleteMany;
  };
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

async function request(server, path, { userId = 'owner', method = 'GET', body } = {}) {
  const address = server.address();
  const payload = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const headers = { authorization: `Bearer ${jwt.sign({ sub: userId }, process.env.JWT_SECRET)}` };
    if (payload !== null) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(payload);
    }
    const requestObject = http.request({
      host: '127.0.0.1',
      port: address.port,
      path,
      method,
      headers,
    }, (response) => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: raw ? JSON.parse(raw) : null }));
    });
    requestObject.on('error', reject);
    requestObject.end(payload);
  });
}

test('legacy HMAC settings are inferred and their secret survives LiveOps changes', async (t) => {
  const models = makeModels();
  const game = models.games[0];
  game.serverBackend = {
    liveOpsEnabled: false,
    secret: 'legacy-secret',
    leaderboardEnabled: true,
    configEnabled: true,
    v2Enabled: false,
  };
  let saveCount = 0;
  game.save = async () => { saveCount += 1; };
  const restore = patchModels(models);
  t.after(restore);
  const server = await startServer();
  t.after(() => server.close());

  const enabled = await request(server, '/api/games/game-a/backend', {
    method: 'PATCH',
    body: { liveOpsEnabled: true, liveOpsMode: 'legacy', v2Enabled: false },
  });
  assert.equal(enabled.status, 200);
  assert.equal(enabled.body.serverBackend.secret, 'legacy-secret');
  assert.equal(game.serverBackend.secret, 'legacy-secret');

  const disabled = await request(server, '/api/games/game-a/backend', {
    method: 'PATCH',
    body: { liveOpsEnabled: false },
  });
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body.serverBackend.liveOpsEnabled, false);
  assert.equal(disabled.body.serverBackend.liveOpsMode, 'legacy');
  assert.equal(disabled.body.serverBackend.secret, 'legacy-secret');
  assert.equal(game.serverBackend.secret, 'legacy-secret');
  assert.equal(saveCount, 2);
});

test('leaderboard management is scoped, paginated, stable, and admin-capable', async (t) => {
  const models = makeModels();
  const restore = patchModels(models);
  t.after(restore);
  const server = await startServer();
  t.after(() => server.close());

  const pageOne = await request(server, '/api/games/game-a/backend/leaderboards/lb-a/scores?page=1');
  assert.equal(pageOne.status, 200);
  assert.equal(pageOne.body.total, 51);
  assert.equal(pageOne.body.page, 1);
  assert.equal(pageOne.body.limit, 50);
  assert.equal(pageOne.body.pages, 2);
  assert.equal(pageOne.body.scores.length, 50);
  assert.equal(pageOne.body.scores[0].rank, 1);
  assert.equal(pageOne.body.scores[0].displayName, 'Player 0');
  assert.equal(pageOne.body.scores[0].playCount, 1);
  assert.equal(pageOne.body.scores[1].isDev, true);
  assert.equal(pageOne.body.scores[0].updatedAt, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(models.calls.scoreCount.at(-1), { gameId: 'game-a', leaderboardId: 'lb-a' });
  assert.deepEqual(models.calls.scoreFind.at(-1), { gameId: 'game-a', leaderboardId: 'lb-a' });

  const pageTwo = await request(server, '/api/games/game-a/backend/leaderboards/lb-a/scores?page=2', { userId: 'admin' });
  assert.equal(pageTwo.status, 200);
  assert.equal(pageTwo.body.scores.length, 1);
  assert.equal(pageTwo.body.scores[0].rank, 51);

  const collaborator = await request(server, '/api/games/game-a/backend/leaderboards/lb-a/scores?page=1', { userId: 'collaborator' });
  assert.equal(collaborator.status, 200);
  const outsider = await request(server, '/api/games/game-a/backend/leaderboards/lb-a/scores?page=1', { userId: 'outsider' });
  assert.equal(outsider.status, 404);
  const rejected = await request(server, '/api/games/game-a/backend/leaderboards/lb-a/scores?page=1', { userId: 'rejected' });
  assert.equal(rejected.status, 403);
});

test('score and save deletion never crosses game or leaderboard boundaries', async (t) => {
  const models = makeModels();
  const restore = patchModels(models);
  t.after(restore);
  const server = await startServer();
  t.after(() => server.close());

  const wrongBoard = await request(server, '/api/games/game-a/backend/leaderboards/lb-a/scores/score-b-1', { method: 'DELETE' });
  assert.equal(wrongBoard.status, 404);
  assert.deepEqual(models.calls.scoreDelete.at(-1), { _id: 'score-b-1', gameId: 'game-a', leaderboardId: 'lb-a' });

  const deleted = await request(server, '/api/games/game-a/backend/leaderboards/lb-a/scores/score-a-0', { method: 'DELETE', userId: 'admin' });
  assert.deepEqual(deleted, { status: 200, body: { ok: true } });

  const row = await request(server, '/api/games/game-a/backend/saves/save-b-1', { method: 'DELETE' });
  assert.equal(row.status, 404);
  assert.deepEqual(models.calls.saveDelete.at(-1), { _id: 'save-b-1', gameId: 'game-a', isDev: false });

  const productionFromDev = await request(server, '/api/games/game-a/backend/saves/save-a-1?devOnly=true', { method: 'DELETE' });
  assert.equal(productionFromDev.status, 404);
  assert.deepEqual(models.calls.saveDelete.at(-1), { _id: 'save-a-1', gameId: 'game-a', isDev: true });

  const devFromProduction = await request(server, '/api/games/game-a/backend/saves/save-a-2', { method: 'DELETE' });
  assert.equal(devFromProduction.status, 404);
  assert.deepEqual(models.calls.saveDelete.at(-1), { _id: 'save-a-2', gameId: 'game-a', isDev: false });

  const devSaveDeleted = await request(server, '/api/games/game-a/backend/saves/save-a-2?devOnly=true', { method: 'DELETE', userId: 'collaborator' });
  assert.deepEqual(devSaveDeleted, { status: 200, body: { ok: true } });

  const saveDeleted = await request(server, '/api/games/game-a/backend/saves/save-a-1', { method: 'DELETE', userId: 'collaborator' });
  assert.deepEqual(saveDeleted, { status: 200, body: { ok: true } });
});

test('bulk management APIs use devOnly and omit cloud-save data', async (t) => {
  const models = makeModels();
  const restore = patchModels(models);
  t.after(restore);
  const server = await startServer();
  t.after(() => server.close());

  const saves = await request(server, '/api/games/game-a/backend/saves?page=1', { userId: 'admin' });
  assert.equal(saves.status, 200);
  assert.equal(saves.body.total, 2);
  assert.equal(saves.body.saves.length, 2);
  assert.equal(Object.hasOwn(saves.body.saves[0], 'data'), false);
  assert.deepEqual(models.calls.saveFind.at(-1), { gameId: 'game-a' });
  assert.deepEqual(models.calls.saveCount.at(-1), { gameId: 'game-a' });

  const legacy = await request(server, '/api/games/game-a/backend/leaderboards/lb-a/entries', { method: 'DELETE', userId: 'admin' });
  assert.equal(legacy.status, 200);
  assert.equal(legacy.body.deletedCount, 1);
  assert.deepEqual(models.calls.leaderboardUpdate.at(-1).filter, { _id: 'lb-a', gameId: 'game-a' });

  const missingGuard = await request(server, '/api/games/game-a/backend/leaderboards/lb-a/scores', { method: 'DELETE' });
  assert.equal(missingGuard.status, 400);
  const devScores = await request(server, '/api/games/game-a/backend/leaderboards/lb-a/scores?devOnly=true', { method: 'DELETE' });
  assert.equal(devScores.status, 200);
  assert.deepEqual(models.calls.scoreDeleteMany.at(-1), { gameId: 'game-a', leaderboardId: 'lb-a', isDev: true });
  assert.equal(models.scores.some((score) => score.gameId === 'game-a' && score.leaderboardId === 'lb-a' && score.isDev), false);
  assert.equal(models.scores.some((score) => score.gameId === 'game-b'), true);

  const devSaves = await request(server, '/api/games/game-a/backend/saves?devOnly=true', { method: 'DELETE' });
  assert.equal(devSaves.status, 200);
  assert.deepEqual(models.calls.saveDeleteMany.at(-1), { gameId: 'game-a', isDev: true });
  assert.equal(models.saves.some((save) => save.gameId === 'game-a' && save.isDev), false);
  assert.equal(models.saves.some((save) => save.gameId === 'game-b'), true);
});
