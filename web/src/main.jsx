import React from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { GrowlProvider } from './context/GrowlContext.jsx';
import { I18nProvider } from './i18n.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import LandingPage from './pages/LandingPage.jsx';
import App from './App.jsx';
import { routeLoaders } from './utils/routeLoaders.js';
import './index.css';

const supportsViewTransitions = typeof document !== 'undefined'
  && typeof document.startViewTransition === 'function';
document.documentElement.classList.toggle('supports-view-transitions', supportsViewTransitions);

function lazyPage(loader, guard) {
  return {
    lazy: async () => {
      const module = await loader();
      const Page = module.default;
      const page = <Page />;
      return {
        element: guard
          ? <ProtectedRoute {...(guard === true ? {} : guard)}>{page}</ProtectedRoute>
          : page,
      };
    },
  };
}

function pageRoute(path, loaderKey) {
  return { path, ...lazyPage(routeLoaders[loaderKey]) };
}

function protectedPageRoute(path, loaderKey, guard = true) {
  return { path, ...lazyPage(routeLoaders[loaderKey], guard) };
}

const routes = [
  { path: '/', element: <LandingPage /> },
  pageRoute('/login', 'login'),
  pageRoute('/register', 'register'),
  pageRoute('/auth/callback', 'authCallback'),
  protectedPageRoute('/consent', 'consent', { requireApproved: false, requireAgeConsent: false }),
  protectedPageRoute('/pending', 'pending', { requireApproved: false }),
  pageRoute('/arcade', 'arcade'),
  pageRoute('/privacy', 'privacy'),
  pageRoute('/privacy/:date', 'privacy'),

  // Blog (public)
  pageRoute('/blog', 'blogList'),
  pageRoute('/blog/:slug', 'blogPost'),

  // Per-game article CMS stays inside the game dashboard view
  protectedPageRoute('/dashboard/games/:gameId/articles', 'gameDetail'),
  protectedPageRoute('/dashboard/games/:gameId/articles/new', 'gameDetail'),
  protectedPageRoute('/dashboard/games/:gameId/articles/:id/edit', 'gameDetail'),
  pageRoute('/play/:gameSlug/articles', 'gameArticles'),
  pageRoute('/play/:gameSlug/articles/:articleSlug', 'blogPost'),

  protectedPageRoute('/dashboard', 'dashboard'),
  protectedPageRoute('/dashboard/games/:gameId', 'gameDetail'),
  protectedPageRoute('/dashboard/games/:gameId/issues/:issueId', 'issueDetail'),

  // Admin
  protectedPageRoute('/admin/users', 'adminUsers', { requireAdmin: true }),
  protectedPageRoute('/admin/blog', 'adminBlog'),
  protectedPageRoute('/admin/blog/new', 'adminBlogEditor'),
  protectedPageRoute('/admin/blog/:id/edit', 'adminBlogEditor'),

  pageRoute('/play/:gameSlug', 'play'),
  pageRoute('/play/:gameSlug/:buildId', 'play'),
  pageRoute('/play', 'play'),
  pageRoute('/report/:gameSlug', 'report'),
  pageRoute('/report/:gameSlug/:buildId', 'report'),
  { path: '*', element: <Navigate to="/" replace /> },
];

const router = createBrowserRouter([
  {
    element: <App />,
    children: routes,
  },
]);

createRoot(document.getElementById('root')).render(
  <I18nProvider>
    <div className="app-shell">
      <ThemeProvider>
        <GrowlProvider>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </GrowlProvider>
      </ThemeProvider>
    </div>
  </I18nProvider>,
);
