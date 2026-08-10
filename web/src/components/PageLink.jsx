import React, { forwardRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { usePrefersReducedMotion } from '../hooks/usePageTransition.js';
import { prefetchRoute } from '../utils/routePrefetch.js';

const PageLink = forwardRef(function PageLink({
  to,
  onMouseEnter,
  onFocus,
  onTouchStart,
  viewTransition = true,
  ...props
}, ref) {
  const reducedMotion = usePrefersReducedMotion();

  const handleIntent = useCallback((event, handler) => {
    prefetchRoute(to);
    handler?.(event);
  }, [to]);

  return (
    <Link
      {...props}
      ref={ref}
      to={to}
      viewTransition={!reducedMotion && viewTransition}
      onMouseEnter={(event) => handleIntent(event, onMouseEnter)}
      onFocus={(event) => handleIntent(event, onFocus)}
      onTouchStart={(event) => handleIntent(event, onTouchStart)}
    />
  );
});

export default PageLink;
