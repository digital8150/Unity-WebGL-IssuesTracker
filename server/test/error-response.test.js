import test from 'node:test';
import assert from 'node:assert/strict';

import { publicErrorBody } from '../src/services/errorResponse.js';

test('public quota errors retain safe diagnostics for the dashboard', () => {
  assert.deepEqual(publicErrorBody(Object.assign(new Error('Storage quota exceeded'), {
    code: 'STORAGE_QUOTA_EXCEEDED',
    usedBytes: 10,
    quotaBytes: 12,
    projectedBytes: 20,
    secret: 'must not leak',
  })), {
    error: 'Storage quota exceeded',
    code: 'STORAGE_QUOTA_EXCEEDED',
    usedBytes: 10,
    quotaBytes: 12,
    projectedBytes: 20,
  });
});

test('public archive errors expose a reason code without quota diagnostics', () => {
  assert.deepEqual(publicErrorBody({
    message: 'archive too large',
    code: 'ARCHIVE_LIMIT_EXCEEDED',
    projectedBytes: 100,
  }), {
    error: 'archive too large',
    code: 'ARCHIVE_LIMIT_EXCEEDED',
  });
});
