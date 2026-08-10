import test from 'node:test';
import assert from 'node:assert/strict';
import { pacificDayKey, nextPacificMidnight, pickModel, computeBackoff } from '../src/services/translation/quota.js';

test('Pacific day keys follow DST and UTC boundary rules', () => {
  assert.equal(pacificDayKey(new Date('2026-01-01T05:00:00Z')), '2025-12-31');
  assert.equal(pacificDayKey(new Date('2026-03-08T09:59:00Z')), '2026-03-08');
  assert.equal(pacificDayKey(new Date('2026-03-08T10:01:00Z')), '2026-03-08');
  assert.equal(nextPacificMidnight(new Date('2026-03-08T09:59:00Z')).toISOString(), '2026-03-09T07:00:00.000Z');
  assert.equal(pacificDayKey(new Date('2026-11-01T08:59:00Z')), '2026-11-01');
  assert.equal(pacificDayKey(new Date('2026-11-01T09:01:00Z')), '2026-11-01');
  assert.equal(nextPacificMidnight(new Date('2026-11-01T08:59:00Z')).toISOString(), '2026-11-02T08:00:00.000Z');
});

test('model selection follows chain order and quota exhaustion', () => {
  const chain = [
    { model: 'first', rpd: 1, rpm: 10, enabled: true },
    { model: 'second', rpd: 2, rpm: 10, enabled: true },
  ];
  assert.equal(pickModel(chain, { 'first:day:2026-01-01': 0, 'first:minute:2026-01-01T00:00': 0 }, new Date('2026-01-01T08:00:00Z')).model, 'first');
  assert.equal(pickModel(chain, { first: { day: 1 }, second: { day: 0 } }, new Date('2026-01-01T08:00:00Z')).model, 'second');
  assert.equal(pickModel(chain, { first: { day: 1 }, second: { day: 2 } }, new Date('2026-01-01T08:00:00Z')), null);
});

test('backoff is bounded and monotone', () => {
  const values = [0, 1, 2, 3, 10, 40].map(computeBackoff);
  assert.deepEqual([...values].sort((a, b) => a - b), values);
  assert.ok(values.at(-1) <= 31_000);
});
