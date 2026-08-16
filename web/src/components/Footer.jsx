import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n.jsx';
import BrandLogo from './BrandLogo.jsx';
import BcsdSymbol from './BcsdSymbol.jsx';
import PageLink from './PageLink.jsx';
import CanvasFxLayer from './canvasui/CanvasFxLayer.jsx';
import Droplets from './canvasui/Droplets.tsx';
import Glass from './canvasui/Glass.tsx';
import Blaze from './canvasui/Blaze.tsx';
import Bubble from './canvasui/Bubble.tsx';
import Liquid from './canvasui/Liquid.tsx';
import Magnify from './canvasui/Magnify.tsx';
import GlyphRain from './canvasui/GlyphRain.tsx';
import ParticleReveal from './canvasui/ParticleReveal.tsx';
import './Footer.css';

const BCSD_SITE = 'https://bcsdlab.com/';

/**
 * Layering two Canvas UI effects on the same footer never worked out (see
 * canvasui/README.md for the two failed attempts with Droplets + Bubble), so
 * instead of stacking effects the footer wears exactly one, chosen at random
 * each time the landing page mounts. Every candidate captures the real footer
 * DOM the same way Droplets always did (`mode="measure"` in CanvasFxLayer),
 * so swapping the array only changes which shader wraps the same markup.
 * Options left at `{}` are the component's own documented defaults; the rest
 * only override what needed to fit a dark footer (mainly recoloring an
 * effect's default accent to white/gray).
 */
const FOOTER_FX_EFFECTS = [
  {
    name: 'droplets',
    effect: Droplets,
    options: {
      intensity: 0.4,
      speed: 0.85,
      scale: 0.45,
      dropLength: 1.1,
      refraction: 0.16,
      blur: 0.12,
      vignette: 0.18,
      fallSpeed: 0.8,
      staticDrops: 0.3,
      interactive: true,
      interactionRadius: 0.32,
      interactionStrength: 0.7,
      interactionDistortion: 2.5,
    },
  },
  { name: 'glass', effect: Glass, options: {} },
  // Spark/smoke default to orange; recolored white so it reads as light, not fire.
  { name: 'blaze', effect: Blaze, options: { sparkColor: [1, 1, 1], smokeColor: [1, 1, 1] } },
  { name: 'bubble', effect: Bubble, options: {} },
  // Trail defaults to blue; recolored to a neutral gray.
  { name: 'liquid', effect: Liquid, options: { color: [0.7, 0.7, 0.7] } },
  { name: 'magnify', effect: Magnify, options: {} },
  // Rain defaults to blue; recolored achromatic (white head, gray trail) to match the footer.
  { name: 'glyph-rain', effect: GlyphRain, options: { color: [0.85, 0.85, 0.85], headColor: [1, 1, 1] } },
  { name: 'particle-reveal', effect: ParticleReveal, options: {} },
];

function pickFooterFx() {
  return FOOTER_FX_EFFECTS[Math.floor(Math.random() * FOOTER_FX_EFFECTS.length)];
}

/**
 * Scales the BCSD symbol + wordmark lockup up (or down) until its rendered
 * width exactly matches the slogan's — a resized logo reads as one finished
 * BI/CI block, where compressing the slogan's letter-spacing to fit a small
 * logo did not. `--mark-scale` drives `calc()` in Footer.css for the
 * symbol's height, the wordmark's font-size, and the gap between them, so
 * the whole lockup grows as one proportional unit rather than a transform
 * that would leave layout space unclaimed.
 *
 * Returns callback refs, not plain `useRef`s read from a mount-time effect:
 * once the landing footer's Canvas UI effect activates, `CanvasFxLayer`
 * re-parents this whole subtree into its capture canvas (see its own
 * comment), which unmounts and remounts the mark and slogan DOM nodes. A
 * `useLayoutEffect` tied to the first mount would keep measuring/writing to
 * those now-detached nodes forever and never touch the ones actually on
 * screen. Callback refs fire again on every (re)attach, so the scale is
 * reapplied against whichever nodes are current. The ResizeObserver on the
 * slogan then keeps it correct afterward (e.g. a web font swap changing its
 * natural width) without needing another remount.
 */
function useScaleMarkToSlogan() {
  const markNode = useRef(null);
  const sloganNode = useRef(null);
  const resizeObserver = useRef(null);

  const apply = useCallback(() => {
    const mark = markNode.current;
    const slogan = sloganNode.current;
    if (!mark || !slogan) return;
    mark.style.setProperty('--mark-scale', 1);
    const markWidth = mark.getBoundingClientRect().width;
    const sloganWidth = slogan.getBoundingClientRect().width;
    if (!markWidth || !sloganWidth) return;
    mark.style.setProperty('--mark-scale', sloganWidth / markWidth);
  }, []);

  const markRef = useCallback((node) => {
    markNode.current = node;
    if (node) apply();
  }, [apply]);

  const sloganRef = useCallback((node) => {
    sloganNode.current = node;
    resizeObserver.current?.disconnect();
    if (!node) return;
    apply();
    resizeObserver.current = new ResizeObserver(apply);
    resizeObserver.current.observe(node);
  }, [apply]);

  useEffect(() => {
    window.addEventListener('resize', apply);
    return () => {
      window.removeEventListener('resize', apply);
      resizeObserver.current?.disconnect();
    };
  }, [apply]);

  return [markRef, sloganRef];
}

/**
 * `landing` is a two-tier footer used only on `/`: the club sits above Arcade,
 * closing the page with who BCSD is rather than a thin link bar. It is also the
 * only variant that carries a Canvas UI effect — the extra height gives it room,
 * and every other page keeps the short footer.
 */
export default function Footer({ variant = 'full' }) {
  const { t } = useI18n();
  const isSlim = variant === 'slim';
  const isLanding = variant === 'landing';
  // Rolled once when the landing footer mounts, not on every render — a fresh
  // pick per render would tear down and rebuild the WebGL context each time.
  const [fx] = useState(() => (isLanding ? pickFooterFx() : null));
  const [markRef, sloganRef] = useScaleMarkToSlogan();

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
          <div className="site-footer-club-identity">
            {/* Symbol and wordmark set as one lockup in a single ink. The
                visible "BCSD" carries the name, so the symbol stays decorative
                rather than repeating it to a screen reader. `useScaleMarkToSlogan`
                grows this to exactly the slogan's width below it. */}
            <div className="site-footer-club-mark" ref={markRef}>
              <BcsdSymbol className="site-footer-bcsd-symbol" mono />
              <span className="site-footer-bcsd-wordmark">BCSD</span>
            </div>
            {/* Slogan reads as a tagline under the BI/CI lockup, in the same
                ink as the mark, so the two read as one finished BI/CI block. */}
            <span className="site-footer-club-slogan" ref={sloganRef}>{t.footer.bcsdSlogan}</span>
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
      <CanvasFxLayer mode="measure" effect={fx.effect} options={fx.options}>
        {footerContent}
      </CanvasFxLayer>
    </footer>
  );
}
