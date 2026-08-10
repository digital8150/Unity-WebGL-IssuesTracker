import React from 'react';
import { useI18n } from '../i18n.jsx';
import BrandLogo from './BrandLogo.jsx';
import PageLink from './PageLink.jsx';
import './Footer.css';

export default function Footer({ variant = 'full' }) {
  const { t } = useI18n();
  const isSlim = variant === 'slim';

  if (isSlim) {
    return (
      <footer className="site-footer site-footer--slim">
        <div className="site-footer-bottom">
          <span>{t.footer.copyright}</span>
          <span className="site-footer-slim-links">
            <PageLink to="/dashboard" className="site-footer-link">{t.footer.trackDashboard}</PageLink>
            <PageLink to="/privacy" className="site-footer-link">{t.footer.privacyPolicy}</PageLink>
          </span>
        </div>
      </footer>
    );
  }

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <PageLink to="/" className="site-footer-brand-link" aria-label={t.nav.home}>
            <BrandLogo size="md" />
          </PageLink>
          <p className="site-footer-tagline">{t.footer.tagline}</p>
        </div>
        <div className="site-footer-columns">
          <nav className="site-footer-column" aria-label={t.footer.playHeading}>
            <span className="site-footer-heading">{t.footer.playHeading}</span>
            <PageLink to="/arcade" className="site-footer-link">{t.footer.playAllGames}</PageLink>
            <PageLink to="/blog" className="site-footer-link">{t.footer.playArticles}</PageLink>
          </nav>
          <nav className="site-footer-column" aria-label={t.footer.trackHeading}>
            <span className="site-footer-heading">{t.footer.trackHeading}</span>
            <PageLink to="/dashboard" className="site-footer-link">{t.footer.trackDashboard}</PageLink>
          </nav>
        </div>
      </div>
      <div className="site-footer-bottom">
        <span>{t.footer.copyright}</span>
        <PageLink to="/privacy" className="site-footer-link">{t.footer.privacyPolicy}</PageLink>
      </div>
    </footer>
  );
}
