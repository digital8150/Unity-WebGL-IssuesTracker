import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import BrandLogo from './BrandLogo.jsx';
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
            <Link to="/dashboard" className="site-footer-link">{t.footer.trackDashboard}</Link>
            <Link to="/privacy" className="site-footer-link">{t.footer.privacyPolicy}</Link>
          </span>
        </div>
      </footer>
    );
  }

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Link to="/" className="site-footer-brand-link" aria-label={t.nav.home}>
            <BrandLogo size="md" />
          </Link>
          <p className="site-footer-tagline">{t.footer.tagline}</p>
        </div>
        <div className="site-footer-columns">
          <nav className="site-footer-column" aria-label={t.footer.playHeading}>
            <span className="site-footer-heading">{t.footer.playHeading}</span>
            <Link to="/arcade" className="site-footer-link">{t.footer.playAllGames}</Link>
            <Link to="/blog" className="site-footer-link">{t.footer.playArticles}</Link>
          </nav>
          <nav className="site-footer-column" aria-label={t.footer.trackHeading}>
            <span className="site-footer-heading">{t.footer.trackHeading}</span>
            <Link to="/dashboard" className="site-footer-link">{t.footer.trackDashboard}</Link>
          </nav>
        </div>
      </div>
      <div className="site-footer-bottom">
        <span>{t.footer.copyright}</span>
        <Link to="/privacy" className="site-footer-link">{t.footer.privacyPolicy}</Link>
      </div>
    </footer>
  );
}
