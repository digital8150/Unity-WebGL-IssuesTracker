// The client route table is deliberately data-only. The server SEO route table
// mirrors the same public entries without importing React or CSS.
export const ROUTES = [
  { path: '/', loaderKey: 'landing', eager: true, localized: true },
  { path: '/login', loaderKey: 'login', localized: false },
  { path: '/register', loaderKey: 'register', localized: false },
  { path: '/auth/callback', loaderKey: 'authCallback', localized: false },
  { path: '/consent', loaderKey: 'consent', guard: { requireApproved: false, requireAgeConsent: false }, localized: false },
  { path: '/pending', loaderKey: 'pending', guard: { requireApproved: false }, localized: false },
  { path: '/arcade', loaderKey: 'arcade', localized: true },
  { path: '/privacy', loaderKey: 'privacy', localized: true },
  { path: '/privacy/:date', loaderKey: 'privacy', localized: true },
  { path: '/blog', loaderKey: 'blogList', localized: true },
  { path: '/blog/:slug', loaderKey: 'blogPost', localized: true },

  { path: '/dashboard/games/:gameId/articles', loaderKey: 'gameDetail', guard: true, localized: false },
  { path: '/dashboard/games/:gameId/articles/new', loaderKey: 'gameDetail', guard: true, localized: false },
  { path: '/dashboard/games/:gameId/articles/:id/edit', loaderKey: 'gameDetail', guard: true, localized: false },
  { path: '/play/:gameSlug/articles', loaderKey: 'gameArticles', localized: true },
  { path: '/play/:gameSlug/articles/:articleSlug', loaderKey: 'blogPost', localized: true },

  { path: '/dashboard', loaderKey: 'dashboard', guard: true, localized: false },
  { path: '/dashboard/games/:gameId', loaderKey: 'gameDetail', guard: true, localized: false },
  { path: '/dashboard/games/:gameId/issues/:issueId', loaderKey: 'issueDetail', guard: true, localized: false },

  { path: '/admin/users', loaderKey: 'adminUsers', guard: { requireAdmin: true }, localized: false },
  { path: '/admin/blog', loaderKey: 'adminBlog', localized: false },
  { path: '/admin/blog/new', loaderKey: 'adminBlogEditor', localized: false },
  { path: '/admin/blog/:id/edit', loaderKey: 'adminBlogEditor', localized: false },
  { path: '/admin/translations', loaderKey: 'adminTranslations', guard: { requireAdmin: true }, localized: false },

  { path: '/play/:gameSlug', loaderKey: 'play', localized: true },
  { path: '/play/:gameSlug/:buildId', loaderKey: 'play', localized: true },
  { path: '/play', loaderKey: 'play', localized: false },
  { path: '/report/:gameSlug', loaderKey: 'report', localized: false },
  { path: '/report/:gameSlug/:buildId', loaderKey: 'report', localized: false },
  { path: '*', loaderKey: null, localized: false },
];

export const LOCALIZED_ROUTES = ROUTES.filter((route) => route.localized);

export default ROUTES;
