import React, { useEffect, useRef, useState } from 'react';
import { supportsHtmlInCanvas } from './Blaze.tsx';
import './CanvasFxLayer.css';

const MIN_VIEWPORT_WIDTH = 834;

function canTryEffect() {
  return typeof window !== 'undefined'
    && typeof IntersectionObserver !== 'undefined'
    && typeof ResizeObserver !== 'undefined'
    && window.innerWidth >= MIN_VIEWPORT_WIDTH
    && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
}

/**
 * Hosts any Canvas UI html-in-canvas effect and keeps it opt-in and
 * layout-safe. `effect` is the vendored component (Blaze, Glass, Displacement,
 * …);
 * every one of them takes the same className/style/children contract, and
 * `supportsHtmlInCanvas` is identical across the files, so Blaze's copy stands
 * in for all of them.
 *
 * Before activation the caller's children stay ordinary DOM, so unsupported
 * browsers get the original markup with no wrapper at all.
 *
 * IMPORTANT for callers: give `.fx-layer-content` an opaque background. These
 * effects paint the live subtree and draw their canvas treatment above it. The
 * captured DOM stays available underneath, so unsupported or transparent
 * portions remain crisp and interactive.
 */
export default function CanvasFxLayer({
  children,
  effect: Effect,
  mode = 'fill',
  className = '',
  options = {},
}) {
  const sentinelRef = useRef(null);
  const contentRef = useRef(null);
  const [supported, setSupported] = useState(false);
  const [eligible, setEligible] = useState(false);
  // A fill layer covers a section that is already on screen, so waiting for an
  // intersection would only delay it. Only a measured layer lazy-starts.
  const lazy = mode === 'measure';
  const [inView, setInView] = useState(!lazy);
  const [contentHeight, setContentHeight] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const updateEligibility = () => {
      const nextEligible = canTryEffect() && supportsHtmlInCanvas();
      setSupported(nextEligible);
      setEligible(nextEligible);
      if (!nextEligible) setInView(!lazy);
    };
    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    updateEligibility();
    const onMotionChange = updateEligibility;
    const onResize = updateEligibility;
    motionQuery?.addEventListener?.('change', onMotionChange);
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      motionQuery?.removeEventListener?.('change', onMotionChange);
      window.removeEventListener('resize', onResize);
    };
  }, [lazy]);

  useEffect(() => {
    if (!lazy || !supported || !eligible || !sentinelRef.current) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      // Latch on. The sentinel stays mounted after activation, but a layer
      // that switched itself off whenever it scrolled away would tear the
      // canvas down and rebuild it on every pass.
      if (entry?.isIntersecting) setInView(true);
      // Shrinking the root's bottom edge holds activation back until a real
      // slice of the section is on screen. Lighting up while it is one pixel
      // past the fold shows an unpainted canvas frame.
    }, { threshold: 0, rootMargin: '0px 0px -20% 0px' });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [lazy, supported, eligible]);

  const active = supported && eligible && inView;

  // Pre-measure while the children are still ordinary DOM. The effect moves
  // them into an absolutely positioned canvas subtree, so a layer that only
  // starts measuring after it activates collapses to zero height for a frame
  // and the page jumps. The sentinel is inset:0 of the host section, so its
  // own box already carries the height to adopt.
  useEffect(() => {
    if (active || mode !== 'measure' || !sentinelRef.current) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const borderBox = entry?.borderBoxSize?.[0]?.blockSize;
      const nextHeight = Math.ceil(
        borderBox ?? entry?.target?.getBoundingClientRect().height ?? 0,
      );
      if (nextHeight > 0) setContentHeight(nextHeight);
    });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [active, mode]);

  useEffect(() => {
    if (!active || mode !== 'measure' || !contentRef.current) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      // Border box, not contentRect: the caller may move its own padding onto
      // the content wrapper so the effect covers the full section instead of
      // stopping at a visible seam inside it.
      const borderBox = entry?.borderBoxSize?.[0]?.blockSize;
      const nextHeight = Math.ceil(
        borderBox ?? entry?.target?.getBoundingClientRect().height ?? 0,
      );
      if (nextHeight > 0) setContentHeight(nextHeight);
    });
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [active, mode]);

  // Unsupported browsers get the original DOM tree with no wrapper at all.
  if (!supported || !eligible || !Effect) return children;

  // The sentinel is rendered in both branches. Unmounting it on activation
  // would detach the observer's target, which immediately reports
  // isIntersecting: false and switches the layer straight back off.
  const sentinel = lazy ? (
    <span ref={sentinelRef} className="fx-layer-sentinel" aria-hidden="true" />
  ) : null;

  if (!active) {
    return (
      <>
        {sentinel}
        {children}
      </>
    );
  }

  const layerClassName = ['fx-layer', `fx-layer--${mode}`, className]
    .filter(Boolean)
    .join(' ');
  const layerStyle = mode === 'fill'
    ? { position: 'absolute', inset: 0 }
    : { position: 'relative', width: '100%', ...(contentHeight ? { height: contentHeight } : {}) };

  return (
    <>
      {sentinel}
      <div className={layerClassName} data-fx-active="true" style={layerStyle}>
        <Effect
          {...options}
          className="fx-layer-effect"
          style={{ width: '100%', height: '100%' }}
        >
          <div ref={contentRef} className="fx-layer-content">
            {children}
          </div>
        </Effect>
      </div>
    </>
  );
}
