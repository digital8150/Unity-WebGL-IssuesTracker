import { URL } from 'node:url';

/**
 * Returns a canonical HTTP(S) origin, or null when the value is not an origin.
 * URL serialization lowercases the host and removes default HTTP/HTTPS ports.
 */
export function normalizeHttpOrigin(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!candidate || /\s/.test(candidate)) return null;
  if (!/^https?:\/\/[^/?#]+\/?$/i.test(candidate)) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}
