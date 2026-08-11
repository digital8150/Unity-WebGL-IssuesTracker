import { routeLoaders } from './routeLoaders.js';
import { stripLocale } from '../i18n/localePath.js';

const prefetchedRoutes = new Map();

function pathnameFor(to) {
  if (typeof to !== 'string') return '';
  return to.split(/[?#]/, 1)[0] || '/';
}

export function loaderFor(pathname) {
  if (pathname === '/login') return ['login', routeLoaders.login];
  if (pathname === '/register') return ['register', routeLoaders.register];
  if (pathname === '/auth/callback') return ['authCallback', routeLoaders.authCallback];
  if (pathname === '/pending') return ['pending', routeLoaders.pending];
  if (pathname === '/consent') return ['consent', routeLoaders.consent];
  if (pathname === '/privacy' || pathname.startsWith('/privacy/')) return ['privacy', routeLoaders.privacy];
  if (pathname === '/dashboard') return ['dashboard', routeLoaders.dashboard];
  if (pathname === '/dashboard/profile') return ['profile', routeLoaders.profile];
  if (pathname.startsWith('/dashboard/games/') && pathname.includes('/issues/')) {
    return ['issueDetail', routeLoaders.issueDetail];
  }
  if (pathname.startsWith('/dashboard/games/')) return ['gameDetail', routeLoaders.gameDetail];
  if (pathname === '/arcade') return ['arcade', routeLoaders.arcade];
  if (pathname === '/admin/users') return ['adminUsers', routeLoaders.adminUsers];
  if (pathname === '/admin/blog/new' || pathname.startsWith('/admin/blog/') && pathname.endsWith('/edit')) {
    return ['adminBlogEditor', routeLoaders.adminBlogEditor];
  }
  if (pathname === '/admin/blog') return ['adminBlog', routeLoaders.adminBlog];
  if (pathname === '/admin/translations') return ['adminTranslations', routeLoaders.adminTranslations];
  if (pathname.startsWith('/play/') && pathname.endsWith('/articles')) {
    return ['gameArticles', routeLoaders.gameArticles];
  }
  if (pathname.startsWith('/play/') && pathname.includes('/articles/')) {
    return ['blogPost', routeLoaders.blogPost];
  }
  if (pathname === '/play' || pathname.startsWith('/play/')) return ['play', routeLoaders.play];
  if (pathname === '/report' || pathname.startsWith('/report/')) return ['report', routeLoaders.report];
  if (pathname === '/blog') return ['blogList', routeLoaders.blogList];
  if (pathname.startsWith('/blog/')) return ['blogPost', routeLoaders.blogPost];
  return null;
}

export function prefetchRoute(to) {
  const match = loaderFor(stripLocale(pathnameFor(to)).path);
  if (!match) return;
  const [key, loader] = match;
  if (!prefetchedRoutes.has(key)) {
    prefetchedRoutes.set(key, loader().catch(() => undefined));
  }
}
