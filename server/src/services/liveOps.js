export const LIVEOPS_MODES = ['legacy', 'v2'];

/**
 * Resolve the persisted LiveOps switch while keeping older games working.
 * Games created before the switch was introduced have no liveOpsEnabled field;
 * their existing backend flags are treated as an enabled integration.
 */
export function isLiveOpsEnabled(serverBackend) {
  if (serverBackend?.liveOpsEnabled !== undefined && serverBackend?.liveOpsEnabled !== null) {
    return serverBackend.liveOpsEnabled === true;
  }

  return Boolean(
    serverBackend?.secret
      || serverBackend?.leaderboardEnabled
      || serverBackend?.configEnabled
      || serverBackend?.v2Enabled
      || serverBackend?.cloudSaveEnabled,
  );
}

/**
 * Resolve the selected API generation. The v2 flag is the compatibility
 * signal for documents saved before liveOpsMode was added.
 */
export function getLiveOpsMode(serverBackend) {
  if (serverBackend?.liveOpsMode === 'v2') return 'v2';
  if (serverBackend?.liveOpsMode === 'legacy') return 'legacy';
  return serverBackend?.v2Enabled === true ? 'v2' : 'legacy';
}

export function serializeLiveOpsBackend(serverBackend) {
  const backend = typeof serverBackend?.toObject === 'function'
    ? serverBackend.toObject()
    : { ...(serverBackend ?? {}) };

  return {
    ...backend,
    liveOpsEnabled: isLiveOpsEnabled(backend),
    liveOpsMode: getLiveOpsMode(backend),
  };
}
