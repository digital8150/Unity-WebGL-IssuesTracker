export const LOCALE_PREFIX = Object.freeze({ ko: '', en: '/en' });

const LOCALIZED_ROUTE_PATTERNS = [
  '/',
  '/arcade',
  '/privacy',
  '/privacy/:date',
  '/blog',
  '/blog/:slug',
  '/play/:gameSlug',
  '/play/:gameSlug/:buildId',
  '/play/:gameSlug/articles',
  '/play/:gameSlug/articles/:articleSlug',
];

function splitPath(value) {
  const input = String(value || '/');
  const match = input.match(/^([^?#]*)([?#].*)?$/);
  return { pathname: match?.[1] || '/', suffix: match?.[2] || '' };
}

function matchesPattern(pathname, pattern) {
  const actual = pathname.replace(/\/+$/, '') || '/';
  const expected = pattern.replace(/\/+$/, '') || '/';
  const actualParts = actual.split('/').filter(Boolean);
  const expectedParts = expected.split('/').filter(Boolean);
  if (actualParts.length !== expectedParts.length) return false;
  return expectedParts.every((part, index) => part.startsWith(':') || part === actualParts[index]);
}

export function stripLocale(value) {
  const { pathname, suffix } = splitPath(value);
  if (pathname === '/en' || pathname.startsWith('/en/')) {
    const stripped = pathname.slice(3) || '/';
    return { path: stripped + suffix, locale: 'en' };
  }
  return { path: pathname + suffix, locale: 'ko' };
}

export function isLocalizedPath(value) {
  const { pathname } = splitPath(value);
  const { path } = stripLocale(pathname);
  return LOCALIZED_ROUTE_PATTERNS.some((pattern) => matchesPattern(path, pattern));
}

export function withLocale(value, lang = 'ko') {
  const { pathname, suffix } = splitPath(value);
  const normalizedLang = lang === 'en' ? 'en' : 'ko';
  const basePath = stripLocale(pathname).path;
  if (normalizedLang === 'ko') return basePath + suffix;
  return `${LOCALE_PREFIX.en}${basePath === '/' ? '' : basePath}${suffix}` || '/en';
}

export function resolveLang(pathname, storedPref) {
  const { pathname: rawPath } = splitPath(pathname);
  if (rawPath === '/en' || rawPath.startsWith('/en/')) return 'en';
  if (isLocalizedPath(rawPath)) return 'ko';
  return storedPref === 'en' || storedPref === 'ko' ? storedPref : 'ko';
}

export { LOCALIZED_ROUTE_PATTERNS };
