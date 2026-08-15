import test from 'node:test';
import assert from 'node:assert/strict';
import { claimNext, sourceHash } from '../src/services/translation/queue.js';

test('claimNext also recovers an expired translating lease', async () => {
  let filter;
  const model = {
    findOneAndUpdate(nextFilter, _update, _options) {
      filter = nextFilter;
      return { lean: async () => null };
    },
  };
  const now = new Date('2026-08-10T00:00:00.000Z');

  await claimNext('worker-a', now, model);

  assert.equal(filter.$or.length, 2);
  assert.equal(filter.$or[0].status, 'pending');
  assert.equal(filter.$or[1].status, 'translating');
  assert.equal(filter.$or[1].lockedAt.$lt.toISOString(), '2026-08-09T23:45:00.000Z');
});

test('Game translation hashes include longDescription', () => {
  const shortOnly = sourceHash('Game', { description: 'Summary', longDescription: '' });
  const withDetails = sourceHash('Game', { description: 'Summary', longDescription: '# Details' });
  assert.notEqual(shortOnly, withDetails);
});
