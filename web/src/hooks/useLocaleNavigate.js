import { useCallback } from 'react';
import { usePageNavigate } from './usePageTransition.js';
import { isLocalizedPath, withLocale } from '../i18n/localePath.js';
import { useI18n } from '../i18n.jsx';

export function useLocaleNavigate() {
  const navigate = usePageNavigate();
  const { lang } = useI18n();
  return useCallback((to, options = {}) => {
    if (typeof to !== 'string' || !to.startsWith('/') || !isLocalizedPath(to)) {
      navigate(to, options);
      return;
    }
    navigate(withLocale(to, lang), options);
  }, [lang, navigate]);
}
