export const SEO_PAGE_ROUTES = [
  { key: 'home', path: '/', localized: true },
  { key: 'privacy', path: '/privacy', localized: true },
  { key: 'privacyDate', path: '/privacy/:date', localized: true },
  { key: 'arcade', path: '/arcade', localized: true },
  { key: 'blogList', path: '/blog', localized: true },
  { key: 'blogPost', path: '/blog/:slug', localized: true },
  { key: 'gameArticles', path: '/play/:gameSlug/articles', localized: true },
  { key: 'gameArticle', path: '/play/:gameSlug/articles/:articleSlug', localized: true },
  { key: 'play', path: '/play/:gameSlug', localized: true },
  { key: 'playBuild', path: '/play/:gameSlug/:buildId', localized: true },
];

export const ROBOTS_DISALLOW = [
  '/api/blog/admin/',
  '/api/',
  '/dashboard',
  '/admin/',
  '/login',
  '/register',
  '/auth/',
  '/pending',
  '/consent',
  '/report/',
];

export const ROBOTS_DISALLOW_WITH_LOCALE = [
  ...ROBOTS_DISALLOW,
  ...ROBOTS_DISALLOW
    .filter((path) => !path.startsWith('/api/'))
    .map((path) => `/en${path}`),
];

export const NON_PAGE_SEO_ROUTES = new Set(['/robots.txt', '/sitemap.xml']);

export function localizedPath(path, locale) {
  if (locale !== 'en') return path;
  return path === '/' ? '/en' : `/en${path}`;
}

export default SEO_PAGE_ROUTES;
