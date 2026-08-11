import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBestScoreOps,
  buildRankQuery,
  resolveSaveWrite,
} from '../src/services/v2Queries.js';

const scoreInput = {
  leaderboardId: 'leaderboard-id',
  gameId: 'game-id',
  userId: 'user-id',
  displayName: '  Player  ',
  score: 100,
  meta: { level: 3 },
  now: new Date('2026-08-12T00:00:00.000Z'),
};

test('best-score writes use ascending and descending comparators', () => {
  const ascending = buildBestScoreOps({ ...scoreInput, sort: 'asc' });
  const descending = buildBestScoreOps({ ...scoreInput, sort: 'desc' });

  assert.equal(ascending.length, 2);
  assert.deepEqual(ascending[0].updateOne.filter, {
    leaderboardId: 'leaderboard-id',
    userId: 'user-id',
  });
  assert.equal(ascending[0].updateOne.update.$set.displayName, 'Player');
  assert.equal(ascending[0].updateOne.update.$inc.playCount, 1);
  assert.deepEqual(ascending[1].updateOne.filter.score, { $gt: 100 });
  assert.deepEqual(descending[1].updateOne.filter.score, { $lt: 100 });
  assert.equal(ascending[1].updateOne.update.$set.isDev, undefined);
  assert.equal(ascending[0].updateOne.upsert, true);
});

test('best-score provenance follows the winning submission', () => {
  const operations = buildBestScoreOps({ ...scoreInput, sort: 'desc', isDev: true });
  assert.equal(operations[0].updateOne.update.$setOnInsert.isDev, true);
  assert.equal(operations[1].updateOne.update.$set.isDev, true);
});

test('rank query counts strictly better scores and earlier ties', () => {
  const bestAt = new Date('2026-08-12T00:00:00.000Z');

  assert.deepEqual(buildRankQuery({ sort: 'asc' }, { score: 100, bestAt }), {
    $or: [
      { score: { $lt: 100 } },
      { score: 100, bestAt: { $lt: bestAt } },
    ],
  });
  assert.deepEqual(buildRankQuery({ sort: 'desc' }, { score: 100, bestAt }), {
    $or: [
      { score: { $gt: 100 } },
      { score: 100, bestAt: { $lt: bestAt } },
    ],
  });
});

test('save writes implement force, create-only, and CAS decisions', () => {
  const identity = { gameId: 'game-id', userId: 'user-id', slot: 'main' };
  const body = { ...identity, data: '{"score":1}', size: 11 };

  const forceCreate = resolveSaveWrite({ body });
  assert.equal(forceCreate.mode, 'force');
  assert.deepEqual(forceCreate.filter, identity);
  assert.deepEqual(forceCreate.update.$set, { data: body.data, size: body.size });
  assert.deepEqual(forceCreate.update.$setOnInsert, { ...identity, rev: 1 });

  const forceUpdate = resolveSaveWrite({
    existing: { ...identity, rev: 4, data: 'old', size: 3 },
    body,
  });
  assert.equal(forceUpdate.mode, 'force');
  assert.deepEqual(forceUpdate.update.$inc, { rev: 1 });
  assert.equal(forceUpdate.nextRev, 5);

  const createOnly = resolveSaveWrite({ body: { ...body, rev: 0 } });
  assert.equal(createOnly.mode, 'create');
  assert.equal(createOnly.nextRev, 1);
  assert.equal(createOnly.update.$setOnInsert.rev, 1);

  const createConflict = resolveSaveWrite({
    existing: { ...identity, rev: 2, data: 'current', size: 7 },
    body: { ...body, rev: 0 },
  });
  assert.equal(createConflict.mode, 'conflict');
  assert.equal(createConflict.status, 409);
  assert.equal(createConflict.response.code, 'save_conflict');
  assert.equal(createConflict.response.rev, 2);
  assert.equal(createConflict.response.data, 'current');

  const cas = resolveSaveWrite({
    existing: { ...identity, rev: 2, data: 'current', size: 7 },
    body: { ...body, rev: 2 },
  });
  assert.equal(cas.mode, 'cas');
  assert.deepEqual(cas.filter, { ...identity, rev: 2 });
  assert.deepEqual(cas.update.$inc, { rev: 1 });
  assert.equal(cas.nextRev, 3);

  const staleCas = resolveSaveWrite({
    existing: { ...identity, rev: 3, data: 'current', size: 7 },
    body: { ...body, rev: 2 },
  });
  assert.equal(staleCas.mode, 'conflict');
  assert.equal(staleCas.response.rev, 3);
});

test('save provenance is mutable data, never part of the unique identity', () => {
  const decision = resolveSaveWrite({
    existing: {
      gameId: 'game-id',
      userId: 'user-id',
      slot: 'main',
      data: '{}',
      size: 2,
      rev: 1,
      isDev: false,
    },
    body: {
      gameId: 'game-id',
      userId: 'user-id',
      slot: 'main',
      data: '{"dev":true}',
      size: 12,
      isDev: true,
    },
  });

  assert.deepEqual(decision.filter, { gameId: 'game-id', userId: 'user-id', slot: 'main' });
  assert.equal(decision.update.$set.isDev, true);
});
