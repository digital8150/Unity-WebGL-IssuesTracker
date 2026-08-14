const PUBLIC_ERROR_CODES = new Set([
  'STORAGE_QUOTA_EXCEEDED',
  'ARCHIVE_LIMIT_EXCEEDED',
  'LIMIT_FILE_SIZE',
]);

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function publicErrorBody(error) {
  const body = { error: error?.message || 'Internal error' };
  if (PUBLIC_ERROR_CODES.has(error?.code)) body.code = error.code;
  if (error?.code === 'STORAGE_QUOTA_EXCEEDED') {
    for (const key of ['usedBytes', 'quotaBytes', 'projectedBytes']) {
      const value = finiteNumber(error[key]);
      if (value !== null) body[key] = value;
    }
  }
  return body;
}
