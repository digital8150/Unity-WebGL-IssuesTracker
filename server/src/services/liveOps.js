export const LIVEOPS_MODES = ['legacy', 'v2'];

function hasLegacyBackendConfiguration(serverBackend) {
  return Boolean(
    serverBackend?.secret
      || serverBackend?.leaderboardEnabled
      || serverBackend?.configEnabled,
  );
}

function hasExplicitLiveOpsMode(serverBackend) {
  return LIVEOPS_MODES.includes(serverBackend?.liveOpsMode);
}

/**
 * Resolve the persisted LiveOps switch while keeping older games working.
 * Games created before the switch was introduced have no liveOpsEnabled field;
 * their existing backend flags are treated as an enabled integration. A
 * legacy document may also contain a materialized `false` without a mode when
 * it was saved through a newer schema; the existing HMAC configuration still
 * takes precedence until an explicit mode is recorded.
 */
export function isLiveOpsEnabled(serverBackend) {
  if (serverBackend?.liveOpsEnabled !== undefined && serverBackend?.liveOpsEnabled !== null) {
    if (
      serverBackend.liveOpsEnabled === false
      && !hasExplicitLiveOpsMode(serverBackend)
      && hasLegacyBackendConfiguration(serverBackend)
    ) return true;
    return serverBackend.liveOpsEnabled === true;
  }

  return Boolean(
    hasLegacyBackendConfiguration(serverBackend)
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
