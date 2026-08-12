import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import CloudSave from '../src/models/CloudSave.js';
import Game from '../src/models/Game.js';
import LeaderboardScore from '../src/models/LeaderboardScore.js';

const id = () => new mongoose.Types.ObjectId();

function indexMap(model) {
  return model.schema.indexes().map(([keys, options]) => ({
    keys,
    options: options.unique ? { unique: true } : {},
  }));
}

test('LeaderboardScore exposes the best-score and display-order indexes', () => {
  assert.deepEqual(indexMap(LeaderboardScore), [
    { keys: { leaderboardId: 1, userId: 1 }, options: { unique: true } },
    { keys: { leaderboardId: 1, score: -1, bestAt: 1 }, options: {} },
    { keys: { leaderboardId: 1, score: 1, bestAt: 1 }, options: {} },
  ]);

  const score = new LeaderboardScore({
    leaderboardId: id(),
    gameId: id(),
    userId: id(),
    displayName: 'Player',
    score: 10,
  });
  assert.equal(score.isDev, false);
  assert.equal(score.playCount, 0);
  assert.ok(score.bestAt instanceof Date);
});

test('CloudSave validates slot names and has a unique game/user/slot/provenance index', async () => {
  assert.deepEqual(indexMap(CloudSave), [
    { keys: { gameId: 1, userId: 1, slot: 1, isDev: 1 }, options: { unique: true } },
  ]);

  const base = { gameId: id(), userId: id(), data: '{}', size: 2 };
  const valid = new CloudSave({ ...base, slot: 'slot_1-2' });
  await assert.doesNotReject(() => valid.validate());
  assert.equal(valid.isDev, false);
  assert.equal(valid.rev, 1);

  for (const slot of ['Upper', '-leading', 'contains space', '']) {
    const invalid = new CloudSave({ ...base, slot });
    await assert.rejects(() => invalid.validate(), /slot/);
  }

  const tooLong = new CloudSave({ ...base, slot: 'a'.repeat(33) });
  await assert.rejects(() => tooLong.validate(), /slot/);
});

test('Game serverBackend contains the v2 feature flags and token kill switch', () => {
  const game = new Game({ name: 'Game', slug: 'game', ownerId: id() });

  assert.equal(game.serverBackend.v2Enabled, false);
  assert.equal(game.serverBackend.cloudSaveEnabled, false);
  assert.equal(game.serverBackend.v2DevTokenIssuedAt, null);
  assert.equal(game.serverBackend.liveOpsEnabled, undefined);
  assert.equal(game.serverBackend.liveOpsMode, undefined);
  assert.equal(Game.schema.path('serverBackend.liveOpsEnabled').options.type, Boolean);
  assert.equal(Game.schema.path('serverBackend.liveOpsMode').options.type, String);
  assert.equal(Game.schema.path('serverBackend.v2Enabled').options.type, Boolean);
  assert.equal(Game.schema.path('serverBackend.cloudSaveEnabled').options.type, Boolean);
  assert.equal(Game.schema.path('serverBackend.v2DevTokenIssuedAt').options.type, Date);
});
