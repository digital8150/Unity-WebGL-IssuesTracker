import React from 'react';
import { useI18n } from '../i18n.jsx';
import BrandLogo from './BrandLogo.jsx';
import BcsdSymbol from './BcsdSymbol.jsx';
import PageLink from './PageLink.jsx';
import CanvasFxLayer from './canvasui/CanvasFxLayer.jsx';
import Glass from './canvasui/Glass.tsx';
import './Footer.css';

const BCSD_SITE = 'https://bcsdlab.com/';

/**
 * `landing` is a two-tier footer used only on `/`: the club sits above Arcade,
 * closing the page with who BCSD is rather than a thin link bar. It is also the
 * only variant that carries the glass lens — the extra height gives the effect room,
 * and every other page keeps the short footer.
 */
export default function Footer({ variant = 'full' }) {
  const { t } = useI18n();
  const isSlim = variant === 'slim';
  const isLanding = variant === 'landing';

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

  const footerContent = (
    <>
      {isLanding && (
        <div className="site-footer-club">
          <div className="site-footer-club-copy">
            <span className="site-footer-eyebrow" data-glass-target>{t.footer.bcsdEyebrow}</span>
            <p className="site-footer-club-headline" data-glass-target>{t.footer.bcsdHeadline}</p>
            <p className="site-footer-club-body" data-glass-target>{t.footer.bcsdBody}</p>
            <a
              className="site-footer-club-cta"
              data-glass-target
              href={BCSD_SITE}
              target="_blank"
              rel="noreferrer noopener"
            >
              {t.footer.bcsdCta}
              <span aria-hidden="true">→</span>
            </a>
          </div>
          {/* Symbol and wordmark set as one lockup in a single ink. The
              visible "BCSD" carries the name, so the symbol stays decorative
              rather than repeating it to a screen reader. */}
          <div className="site-footer-club-mark" data-glass-target>
            <BcsdSymbol className="site-footer-bcsd-symbol" mono />
            <span className="site-footer-bcsd-wordmark">BCSD</span>
          </div>
        </div>
      )}

      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <PageLink to="/" className="site-footer-brand-link" data-glass-target aria-label={t.nav.home}>
            <BrandLogo size="md" />
          </PageLink>
          <p className="site-footer-tagline" data-glass-target>{t.footer.tagline}</p>
        </div>
        <div className="site-footer-columns">
          <nav className="site-footer-column" aria-label={t.footer.playHeading}>
            <span className="site-footer-heading" data-glass-target>{t.footer.playHeading}</span>
            <PageLink to="/arcade" className="site-footer-link" data-glass-target>{t.footer.playAllGames}</PageLink>
            <PageLink to="/blog" className="site-footer-link" data-glass-target>{t.footer.playArticles}</PageLink>
          </nav>
          <nav className="site-footer-column" aria-label={t.footer.trackHeading}>
            <span className="site-footer-heading" data-glass-target>{t.footer.trackHeading}</span>
            <PageLink to="/dashboard" className="site-footer-link" data-glass-target>{t.footer.trackDashboard}</PageLink>
          </nav>
        </div>
      </div>
      <div className="site-footer-bottom">
        <span data-glass-target>{t.footer.copyright}</span>
        <PageLink to="/privacy" className="site-footer-link" data-glass-target>{t.footer.privacyPolicy}</PageLink>
      </div>
    </>
  );

  if (!isLanding) {
    return <footer className="site-footer">{footerContent}</footer>;
  }

  return (
    <footer className="site-footer site-footer--landing site-footer--fx">
      <CanvasFxLayer
        mode="measure"
        effect={Glass}
        // The lens follows the cursor and uses `data-glass-target` to zoom
        // footer copy and the BCSD lockup. The content wrapper keeps the
        // captured surface aligned with the footer; see Footer.css.
        options={{
          shape: 'circle',
          size: 104,
          ior: 1.52,
          edge: 0.68,
          bevel: 4,
          depth: 210,
          aberration: 0.85,
          reflection: 1.1,
          shine: 0.08,
          zoom: 1.55,
          targets: '[data-glass-target]',
          follow: 0.26,
        }}
      >
        {footerContent}
      </CanvasFxLayer>
    </footer>
  );
}
