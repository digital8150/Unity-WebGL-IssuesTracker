import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import BrandLogo from './BrandLogo.jsx';
import DarkModeToggle from './DarkModeToggle.jsx';
import './PublicNav.css';

export default function PublicNav({ active = '' }) {
  const { lang, toggleLang, t } = useI18n();
  const gamesActive = active === 'games';
  const blogActive = active === 'articles';

  return (
    <nav className="public-nav">
      <Link to="/" className="public-nav-logo" aria-label={t.nav.home}>
        <BrandLogo size="md" />
      </Link>
      <div className="public-nav-links">
        <Link
          to="/arcade"
          className={`public-nav-link${gamesActive ? ' is-active' : ''}`}
          aria-current={gamesActive ? 'page' : undefined}
        >
          {t.nav.games}
        </Link>
        <Link
          to="/blog"
          className={`public-nav-link${blogActive ? ' is-active' : ''}`}
          aria-current={blogActive ? 'page' : undefined}
        >
          {t.nav.articles}
        </Link>
        <button
          className="public-nav-language"
          onClick={toggleLang}
          aria-label={t.nav.toggleLanguage}
        >
          {lang === 'en' ? t.nav.switchToKo : t.nav.switchToEn}
        </button>
        <DarkModeToggle />
      </div>
    </nav>
  );
}
