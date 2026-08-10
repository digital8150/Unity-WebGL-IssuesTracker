import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function getReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(getReducedMotion);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event) => setReducedMotion(event.matches);
    mediaQuery.addEventListener?.('change', handleChange);
    return () => mediaQuery.removeEventListener?.('change', handleChange);
  }, []);

  return reducedMotion;
}

export function usePageNavigate() {
  const navigate = useNavigate();
  const reducedMotion = usePrefersReducedMotion();

  return useCallback((to, options = {}) => {
    navigate(to, {
      ...options,
      viewTransition: !reducedMotion && options.viewTransition !== false,
    });
  }, [navigate, reducedMotion]);
}
