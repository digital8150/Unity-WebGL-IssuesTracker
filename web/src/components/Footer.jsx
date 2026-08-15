import React from 'react';
import { useI18n } from '../i18n.jsx';
import BrandLogo from './BrandLogo.jsx';
import BcsdSymbol from './BcsdSymbol.jsx';
import PageLink from './PageLink.jsx';
import CanvasFxLayer from './canvasui/CanvasFxLayer.jsx';
import Displacement from './canvasui/Displacement.tsx';
import './Footer.css';

const BCSD_SITE = 'https://bcsdlab.com/';

/**
 * `landing` is a two-tier footer used only on `/`: the club sits above Arcade,
 * closing the page with who BCSD is rather than a thin link bar. It is also the
 * only variant that carries the blaze — the extra height gives the effect room,
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
            <span className="site-footer-eyebrow">{t.footer.bcsdEyebrow}</span>
            <p className="site-footer-club-headline">{t.footer.bcsdHeadline}</p>
            <p className="site-footer-club-body">{t.footer.bcsdBody}</p>
            <a
              className="site-footer-club-cta"
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
          <div className="site-footer-club-mark">
            <BcsdSymbol className="site-footer-bcsd-symbol" mono />
            <span className="site-footer-bcsd-wordmark">BCSD</span>
          </div>
        </div>
      )}

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
    </>
  );

  if (!isLanding) {
    return <footer className="site-footer">{footerContent}</footer>;
  }

  return (
    <footer className="site-footer site-footer--landing site-footer--fx">
      <CanvasFxLayer
        mode="measure"
        effect={Displacement}
        // Sweeping the cursor shears the footer into offset, colour-fringed
        // tiles that settle back. `threshold` is the cursor speed in px/s
        // needed to trigger it — the upstream 1000 needs a hard flick, so it
        // is lowered to catch an ordinary sweep. This works at all only
        // because .fx-layer-content is opaque; see the note in Footer.css.
        options={{
          grid: 50,
          cellAspect: 1,
          radius: 0.12,
          strength: 0.14,
          threshold: 350,
          relaxation: 0.92,
          shift: 1.2,
          aberration: 1.8,
          grain: 0.1,
          grainSize: 1,
          grainSpeed: 1,
          scramble: 1,
        }}
      >
        {footerContent}
      </CanvasFxLayer>
    </footer>
  );
}
