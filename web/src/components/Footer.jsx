import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import BrandLogo from './BrandLogo.jsx';

export default function Footer() {
  const { t } = useI18n();
  return (
    <footer className="l-footer">
      <span className="l-footer-brand">
        <span className="l-footer-logo"><BrandLogo size="sm" /></span>
        <span className="l-footer-divider" aria-hidden="true" />
        <Link to="/privacy" className="l-footer-privacy">{t.footer.privacyPolicy}</Link>
      </span>
      <span className="l-footer-copy">{t.footer.tagline}</span>
    </footer>
  );
}
