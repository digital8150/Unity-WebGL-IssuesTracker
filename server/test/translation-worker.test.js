import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isTranslationDrainEnabled,
  workerRuntimeStatus,
} from '../src/services/translation/worker.js';
import { buildTranslationWorkerStatus } from '../src/routes/translations.js';

test('translation draining follows the persisted database flag alone', () => {
  assert.equal(isTranslationDrainEnabled({ translation: { enabled: true } }), true);
  assert.equal(isTranslationDrainEnabled({ translation: { enabled: false } }), false);
  assert.equal(isTranslationDrainEnabled({ translation: {} }), false);
  assert.equal(isTranslationDrainEnabled({}), false);
});

test('worker runtime status exposes loop liveness and timestamps', () => {
  const startedAt = new Date('2026-08-11T01:00:00.000Z');
  const lastDrainAttemptAt = new Date('2026-08-11T01:01:00.000Z');
  const lastSuccessfulClaimAt = new Date('2026-08-11T01:01:05.000Z');

  assert.deepEqual(workerRuntimeStatus({ active: true, startedAt, lastDrainAttemptAt, lastSuccessfulClaimAt }), {
    active: true,
    startedAt,
    lastDrainAttemptAt,
    lastSuccessfulClaimAt,
  });
});

test('translation status reports active claims and expired locks', () => {
  assert.deepEqual(buildTranslationWorkerStatus({
    runtime: { active: true, lastDrainAttemptAt: '2026-08-11T01:01:00.000Z' },
    claimedCount: 3,
    expiredLockCount: 1,
  }), {
    active: true,
    lastDrainAttemptAt: '2026-08-11T01:01:00.000Z',
    claimedCount: 3,
    expiredLockCount: 1,
    hasExpiredLock: true,
  });

  assert.equal(buildTranslationWorkerStatus({ expiredLockCount: 0 }).hasExpiredLock, false);
});
