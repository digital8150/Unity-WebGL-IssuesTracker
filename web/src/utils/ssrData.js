const SSR_DATA_ID = '__SSR_DATA__';

let cachedPayload;

function currentUrlKey() {
  return `${window.location.pathname}${window.location.search}`;
}

function readPayloadOnce() {
  if (cachedPayload !== undefined) return cachedPayload;

  const element = document.getElementById(SSR_DATA_ID);
  try {
    cachedPayload = element ? JSON.parse(element.textContent || '') : null;
  } catch {
    cachedPayload = null;
  } finally {
    element?.remove();
  }

  return cachedPayload;
}

/**
 * Read the server bootstrap for the current URL once.
 *
 * The route key and URL are both checked so data from a previous document or
 * from the other BlogPostPage variant cannot be reused after navigation.
 */
export function readSsrData(routeKey) {
  const payload = readPayloadOnce();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (routeKey && payload.route !== routeKey) return null;
  if (typeof payload.url !== 'string' || payload.url !== currentUrlKey()) return null;
  return payload.data && typeof payload.data === 'object' ? payload.data : null;
}

