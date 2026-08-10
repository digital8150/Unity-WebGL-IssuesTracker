import React from 'react';
import { useI18n } from '../i18n.jsx';
import { stripLocale, withLocale } from '../i18n/localePath.js';
import PageLink from './PageLink.jsx';
import './MachineTranslationNotice.css';

export default function MachineTranslationNotice({ translation, path }) {
  const { lang } = useI18n();
  if (lang !== 'en' || translation?.origin !== 'machine') return null;
  const originalPath = path || stripLocale(window.location.pathname).path;
  const originalUrl = new URL(withLocale(originalPath, 'ko'), window.location.origin);
  const isGameDescription = originalPath.startsWith('/play/')
    && !/^\/play\/[^/]+\/articles(?:\/|$)/.test(originalPath);
  const originalTo = {
    pathname: originalUrl.pathname,
    search: originalUrl.search,
    hash: originalUrl.hash,
  };

  return (
    <div className="machine-translation-notice" role="note">
      <span>
        {isGameDescription
          ? 'This game description was machine-translated from Korean.'
          : 'This page was machine-translated from Korean.'}
      </span>
      <PageLink to={originalTo}>View the Korean original →</PageLink>
    </div>
  );
}
