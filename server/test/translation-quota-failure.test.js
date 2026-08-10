import test from 'node:test';
import assert from 'node:assert/strict';
import { isQuotaFailure } from '../src/services/translation/worker.js';
import { isRateLimitWindow, retryDelaySeconds } from '../src/services/translation/http.js';

// The real body Gemini returns for a free-tier per-minute rejection. It puts the
// hint in prose rather than retryInfo, and never says "per minute" in those
// words — the metric name is the only signal.
const REAL_429 = {
  error: {
    message: [
      'You exceeded your current quota, please check your plan and billing details.',
      '* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests,'
        + ' limit: 15, model: gemini-3.5-flash-lite',
      'Please retry in 13.29357ms.',
    ].join('\n'),
  },
};

test('a quota rejection is recognised however it is phrased', () => {
  assert.equal(isQuotaFailure({ status: 429 }), true);
  assert.equal(isQuotaFailure({ code: 'QUOTA_SLOT_UNAVAILABLE' }), true);
  assert.equal(isQuotaFailure({ status: 429, body: REAL_429 }), true);
  assert.equal(isQuotaFailure({ message: 'Resource exhausted for this model' }), true);
  assert.equal(isQuotaFailure({ message: 'rate limit reached' }), true);
  assert.equal(isQuotaFailure({ body: { error: { message: 'Quota exceeded for metric: x' } } }), true);

  // Translation-quality failures must still burn the row's retry budget.
  assert.equal(isQuotaFailure({ code: 'TRANSLATION_VALIDATION_FAILED' }), false);
  assert.equal(isQuotaFailure({ code: 'GEMINI_INVALID_JSON', status: 200 }), false);
  assert.equal(isQuotaFailure({ status: 400, message: 'Request contains an invalid argument.' }), false);
  assert.equal(isQuotaFailure(null), false);
});

test('the real per-minute 429 is not mistaken for daily exhaustion', () => {
  // Parsed from prose: a stray control character in this regex once made it
  // fail silently, so the whole model was retired for the day over 13ms.
  assert.equal(Math.round(retryDelaySeconds(REAL_429) * 1000), 13);
  assert.equal(isRateLimitWindow(REAL_429), true);

  const daily = { error: { message: 'Quota exceeded for metric: generate_content_free_tier_requests_per_day, limit: 20' } };
  assert.equal(isRateLimitWindow(daily), false);
});

test('retry hints are parsed from every shape Gemini uses', () => {
  assert.equal(retryDelaySeconds({ error: { details: [{ retryInfo: { retryDelay: '7s' } }] } }), 7);
  assert.equal(retryDelaySeconds({ error: { details: [{ retryInfo: { retryDelay: { seconds: 12 } } }] } }), 12);
  assert.equal(retryDelaySeconds({ error: { message: 'Please retry in 42s.' } }), 42);
  assert.equal(retryDelaySeconds({ error: { message: 'no hint here' } }), null);
});
