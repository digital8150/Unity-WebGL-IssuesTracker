import User from '../models/User.js';
import Game from '../models/Game.js';
import Build from '../models/Build.js';
import AddressableContent from '../models/AddressableContent.js';

export const DEFAULT_STORAGE_QUOTA_BYTES = 500 * 1024 * 1024;

// Quota is aggregated across every game owned by a user, so the serialization
// key is intentionally the owner rather than an individual game. Requests for
// different games queue behind one another instead of receiving a spurious
// conflict response. This mutex is process-local; a multi-instance deployment
// needs a distributed lock or an atomic reservation in the storage database.
const storageQuotaLocks = new Map();

export async function acquireStorageQuotaLock(ownerId) {
  const key = String(ownerId);
  const previous = storageQuotaLocks.get(key);
  let releaseCurrent;
  const current = new Promise((resolve) => { releaseCurrent = resolve; });
  storageQuotaLocks.set(key, current);
  if (previous) await previous;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (storageQuotaLocks.get(key) === current) storageQuotaLocks.delete(key);
    releaseCurrent();
  };
}

function uniqueIds(ids) {
  return [...new Map(ids.filter(Boolean).map((id) => [String(id), id])).values()];
}

export async function getOwnerStorageUsage(ownerId, { additionalGameIds = [] } = {}) {
  const [user, games] = await Promise.all([
    User.findById(ownerId).select('storageQuota'),
    Game.find({ ownerId }).select('_id'),
  ]);
  const gameIds = uniqueIds([...games.map((game) => game._id), ...additionalGameIds]);
  const [[buildAgg], [contentAgg]] = await Promise.all([
    Build.aggregate([
      { $match: { gameId: { $in: gameIds } } },
      { $group: { _id: null, total: { $sum: '$storageBytes' } } },
    ]),
    AddressableContent.aggregate([
      { $match: { gameId: { $in: gameIds } } },
      { $group: { _id: null, total: { $sum: '$storageBytes' } } },
    ]),
  ]);

  return {
    usedBytes: Number(buildAgg?.total || 0) + Number(contentAgg?.total || 0),
    quotaBytes: Number(user?.storageQuota ?? DEFAULT_STORAGE_QUOTA_BYTES),
  };
}

export async function assertStorageQuota(ownerId, {
  additionalGameIds = [],
  replacedBytes = 0,
  incomingBytes = 0,
} = {}) {
  const usage = await getOwnerStorageUsage(ownerId, { additionalGameIds });
  const projectedBytes = Math.max(0, usage.usedBytes - Number(replacedBytes || 0))
    + Number(incomingBytes || 0);
  if (projectedBytes <= usage.quotaBytes) return { ...usage, projectedBytes };

  const error = new Error('Storage quota exceeded');
  error.status = 413;
  error.code = 'STORAGE_QUOTA_EXCEEDED';
  error.usedBytes = usage.usedBytes;
  error.quotaBytes = usage.quotaBytes;
  error.projectedBytes = projectedBytes;
  throw error;
}
