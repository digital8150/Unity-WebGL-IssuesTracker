import { useI18n } from '../i18n.jsx';
import BrandLogo from './BrandLogo.jsx';
import DarkModeToggle from './DarkModeToggle.jsx';
import PageLink from './PageLink.jsx';
import { useLocation } from 'react-router-dom';
import { isLocalizedPath, stripLocale, withLocale } from '../i18n/localePath.js';
import { usePageNavigate } from '../hooks/usePageTransition.js';
import './PublicNav.css';

export default function PublicNav({ active = '' }) {
  const { lang, toggleLang, t } = useI18n();
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
      </div>
    </nav>
  );
}
