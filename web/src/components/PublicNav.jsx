import { useI18n } from '../i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import BrandLogo from './BrandLogo.jsx';
import DarkModeToggle from './DarkModeToggle.jsx';
import PageLink from './PageLink.jsx';
import { useLocation } from 'react-router-dom';
import { isLocalizedPath, stripLocale, withLocale } from '../i18n/localePath.js';
import { usePageNavigate } from '../hooks/usePageTransition.js';
import './PublicNav.css';

export default function PublicNav({ active = '' }) {
  const { lang, toggleLang, t } = useI18n();
  const user = useAuth()?.user;
  const loginLabel = t.nav.login || t.nav.signIn;
  const myPageLabel = t.nav.myPage || t.nav.profile;
  const location = useLocation();
  const navigate = usePageNavigate();
  const gamesActive = active === 'games';
  const blogActive = active === 'articles';

  function handleLanguageToggle() {
    const next = lang === 'en' ? 'ko' : 'en';
    toggleLang();
    if (isLocalizedPath(location.pathname)) {
      navigate(withLocale(`${stripLocale(location.pathname).path}${location.search}`, next));
    }
  }

  return (
    <nav className="public-nav">
      <PageLink to="/" className="public-nav-logo" aria-label={t.nav.home}>
        <BrandLogo size="md" />
      </PageLink>
      <div className="public-nav-links">
        <PageLink
          to="/arcade"
          className={`public-nav-link${gamesActive ? ' is-active' : ''}`}
          aria-current={gamesActive ? 'page' : undefined}
        >
          {t.nav.games}
        </PageLink>
        <PageLink
          to="/blog"
          className={`public-nav-link${blogActive ? ' is-active' : ''}`}
          aria-current={blogActive ? 'page' : undefined}
        >
          {t.nav.articles}
        </PageLink>
        <button
          className="public-nav-language"
          onClick={handleLanguageToggle}
          aria-label={t.nav.toggleLanguage}
        >
          {lang === 'en' ? t.nav.switchToKo : t.nav.switchToEn}
        </button>
        <DarkModeToggle />
        <div className="public-nav-auth">
          {user ? (
            <PageLink
              to="/me"
              className="public-nav-user"
              aria-label={myPageLabel}
              title={user.name || user.email || myPageLabel}
            >
              <svg className="public-nav-user-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="8" r="3.25" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <path d="M4.5 20c.7-3.15 3.15-5 7.5-5s6.8 1.85 7.5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              <span className="public-nav-user-name">{user.name || user.email || myPageLabel}</span>
            </PageLink>
          ) : (
            <PageLink to="/login" className="public-nav-link">
              {loginLabel}
            </PageLink>
          )}
        </div>
      </div>
    </nav>
  );
}
