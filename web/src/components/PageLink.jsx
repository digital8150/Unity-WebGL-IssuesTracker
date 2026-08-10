import React, { forwardRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { usePrefersReducedMotion } from '../hooks/usePageTransition.js';
import { prefetchRoute } from '../utils/routePrefetch.js';
import { isLocalizedPath, withLocale } from '../i18n/localePath.js';
import { useI18n } from '../i18n.jsx';

const PageLink = forwardRef(function PageLink({
  to,
  onMouseEnter,
  onFocus,
  onTouchStart,
  viewTransition = true,
  ...props
}, ref) {
  const reducedMotion = usePrefersReducedMotion();
  const { lang } = useI18n();
  const resolvedTo = typeof to === 'string' && to.startsWith('/') && isLocalizedPath(to)
    ? withLocale(to, lang)
    : to;

  const handleIntent = useCallback((event, handler) => {
    prefetchRoute(resolvedTo);
    handler?.(event);
  }, [resolvedTo]);

  return (
    <Link
      {...props}
      ref={ref}
      to={resolvedTo}
      viewTransition={!reducedMotion && viewTransition}
      onMouseEnter={(event) => handleIntent(event, onMouseEnter)}
      onFocus={(event) => handleIntent(event, onFocus)}
      onTouchStart={(event) => handleIntent(event, onTouchStart)}
    />
  );
});

export default PageLink;
