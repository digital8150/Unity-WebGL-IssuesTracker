import React, { useLayoutEffect, useRef } from 'react';
import { Outlet, useLocation, useViewTransitionState } from 'react-router-dom';
import { LocaleSync } from './i18n.jsx';

function transitionKind(pathname) {
  if (pathname === '/login' || pathname === '/register'
    || pathname === '/blog' || pathname.startsWith('/blog/')) {
    return 'directional';
  }
  return 'standard';
}

function transitionSurface(pathname) {
  return pathname === '/dashboard' || pathname.startsWith('/dashboard/')
    || pathname === '/admin' || pathname.startsWith('/admin/')
    ? 'internal'
    : 'public';
}

function RoutedPages() {
  const location = useLocation();
  const isViewTransitioning = useViewTransitionState(location.pathname);
  const previousPathname = useRef(null);
  const nativeTransitionPathname = useRef(null);
  const isNavigation = previousPathname.current !== null
    && previousPathname.current !== location.pathname;
  const kind = transitionKind(location.pathname);
  const surface = transitionSurface(location.pathname);

  // React Router exposes this only while its document.startViewTransition call
  // is active. Remember it for this keyed route wrapper so the fallback does
  // not start again when the native transition finishes.
  if (isNavigation && isViewTransitioning) {
    nativeTransitionPathname.current = location.pathname;
  }
  const hasNativeTransition = isNavigation
    && nativeTransitionPathname.current === location.pathname;

  useLayoutEffect(() => {
    previousPathname.current = location.pathname;
    document.documentElement.dataset.routeTransition = kind;
    document.documentElement.dataset.routeTransitionSurface = surface;
  }, [kind, location.pathname]);

  return (
    <>
    <LocaleSync />
    <div
      key={location.pathname}
      className={[
        'route-transition',
        `route-transition--${kind}`,
        `route-transition--${surface}`,
        isNavigation ? 'route-transition--navigation' : '',
        hasNativeTransition ? 'route-transition--native' : '',
      ].filter(Boolean).join(' ')}
    >
      <Outlet />
    </div>
    </>
  );
}

export default function App() {
  return <RoutedPages />;
}
