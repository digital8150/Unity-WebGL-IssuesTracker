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
import { ROUTES } from './routes.config.js';
import { withLocale } from './i18n/localePath.js';
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

function routeToRouter(routeConfig) {
  if (!routeConfig.loaderKey) return { ...routeConfig, element: <Navigate to="/" replace /> };
  if (routeConfig.eager && routeConfig.loaderKey === 'landing') {
    return { ...routeConfig, element: <LandingPage /> };
  }
  return { ...routeConfig, ...lazyPage(routeLoaders[routeConfig.loaderKey], routeConfig.guard) };
}

const routes = ROUTES.flatMap((routeConfig) => [
  routeToRouter(routeConfig),
  ...(routeConfig.localized ? [routeToRouter({ ...routeConfig, path: withLocale(routeConfig.path, 'en') })] : []),
]);

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
