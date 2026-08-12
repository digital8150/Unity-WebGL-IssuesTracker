import test from 'node:test';
import assert from 'node:assert/strict';
import { getLiveOpsMode, isLiveOpsEnabled, serializeLiveOpsBackend } from '../src/services/liveOps.js';

test('LiveOps keeps legacy documents enabled through their existing backend flags', () => {
  const backend = { secret: 'legacy-secret', leaderboardEnabled: true };

  assert.equal(isLiveOpsEnabled(backend), true);
  assert.equal(getLiveOpsMode(backend), 'legacy');
  assert.deepEqual(serializeLiveOpsBackend(backend), {
    ...backend,
    liveOpsEnabled: true,
    liveOpsMode: 'legacy',
  });
});

test('the explicit LiveOps switch and selected mode take precedence', () => {
  const disabledV2 = { liveOpsEnabled: false, liveOpsMode: 'v2', v2Enabled: true };
  const enabledLegacy = { liveOpsEnabled: true, liveOpsMode: 'legacy', v2Enabled: true };

  assert.equal(isLiveOpsEnabled(disabledV2), false);
  assert.equal(getLiveOpsMode(disabledV2), 'v2');
  assert.equal(isLiveOpsEnabled(enabledLegacy), true);
  assert.equal(getLiveOpsMode(enabledLegacy), 'legacy');
});

test('legacy HMAC configuration survives an unmarked materialized false switch', () => {
  const backend = {
    liveOpsEnabled: false,
    secret: 'legacy-secret',
    leaderboardEnabled: true,
  };

  assert.equal(isLiveOpsEnabled(backend), true);
  assert.equal(getLiveOpsMode(backend), 'legacy');
  assert.deepEqual(serializeLiveOpsBackend(backend), {
    ...backend,
    liveOpsEnabled: true,
    liveOpsMode: 'legacy',
  });
});

test('an explicitly selected and disabled mode remains disabled', () => {
  const backend = {
    liveOpsEnabled: false,
    liveOpsMode: 'legacy',
    secret: 'legacy-secret',
    leaderboardEnabled: true,
  };

  assert.equal(isLiveOpsEnabled(backend), false);
  assert.equal(serializeLiveOpsBackend(backend).secret, 'legacy-secret');
});
