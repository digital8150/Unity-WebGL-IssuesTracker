import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import BrandLogo from './BrandLogo.jsx';
import DarkModeToggle from './DarkModeToggle.jsx';
import './PublicNav.css';

export default function PublicNav({ active = '', showAllGames = false }) {
  const { user } = useAuth();
  const { lang, toggleLang, t } = useI18n();

  return (
    <nav className="public-nav">
      <Link to="/" className="public-nav-logo" aria-label={t.nav.home}>
        <BrandLogo size="md" />
      </Link>
      <div className="public-nav-links">
        {active === 'games' ? (
          <span className="public-nav-link is-active" aria-current="page">{t.nav.games}</span>
        ) : (
          <Link to="/" className="public-nav-link">{t.nav.games}</Link>
        )}
        {active === 'articles' ? (
          <span className="public-nav-link is-active" aria-current="page">{t.nav.articles}</span>
        ) : (
          <Link to="/blog" className="public-nav-link">{t.nav.articles}</Link>
        )}
        <button
          className="public-nav-language"
          onClick={toggleLang}
          aria-label={t.nav.toggleLanguage}
        >
          {lang === 'en' ? t.nav.switchToKo : t.nav.switchToEn}
        </button>
        <DarkModeToggle />
        {showAllGames && (
          <Link to="/arcade" className="public-nav-all-games">
            {t.home.allGamesButton}
          </Link>
        )}
        {user ? (
          <Link
            to={user.status === 'approved' ? '/dashboard' : '/pending'}
            className="public-nav-auth public-nav-auth-primary"
          >
            {t.nav.dashboard}
          </Link>
        ) : (
          <>
            <Link to="/login" className="public-nav-link public-nav-signin">{t.nav.signIn}</Link>
            <Link to="/register" className="public-nav-auth public-nav-auth-primary">{t.nav.getStarted}</Link>
          </>
        )}
      </div>
    </nav>
  );
}
