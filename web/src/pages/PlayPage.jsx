import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import UnityGame from '../components/UnityGame.jsx';
import { getPlayInfo } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import './LandingPage.css';

export default function PlayPage() {
  const { gameSlug, buildId } = useParams();
  const { user } = useAuth();
  const { lang, toggleLang, t } = useI18n();

  const [buildInfo,    setBuildInfo]    = useState(null);
  const [loadError,    setLoadError]    = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const sendMessageFn = useRef(null);
  const gameWrapRef   = useRef(null);
  const isWaitingForReport = useRef(false);
  const navRef = useRef(null);

  // ── Load build info ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameSlug) { setBuildInfo('legacy'); return; }
    getPlayInfo(gameSlug, buildId || null)
      .then(setBuildInfo)
      .catch((err) => setLoadError(err.message));
  }, [gameSlug, buildId]);

  // ── Unity receive hook ───────────────────────────────────────────────────
  useEffect(() => {
    window.__issueTrackerReceive = (payloadJson) => {
      sessionStorage.setItem('pendingReport', payloadJson);
      const url = `/report/${gameSlug || 'local'}${buildId ? `/${buildId}` : ''}`;
      window.open(url, '_blank');
      isWaitingForReport.current = false;
    };
    return () => { delete window.__issueTrackerReceive; };
  }, [gameSlug, buildId]);

  // ── Fullscreen change listener ───────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ── Nav scroll effect ────────────────────────────────────────────────────
  useEffect(() => {
    function onScroll() {
      navRef.current?.classList.toggle('scrolled', window.scrollY > 8);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ── Trigger Report ───────────────────────────────────────────────────────
  const handleReportClick = () => {
    if (!sendMessageFn.current) {
      const url = `/report/${gameSlug || 'local'}${buildId ? `/${buildId}` : ''}`;
      window.open(url, '_blank');
      return;
    }
    isWaitingForReport.current = true;
    sendMessageFn.current('IssueTracker', 'SubmitReport', JSON.stringify({ manualTrigger: true }));
    setTimeout(() => {
      if (isWaitingForReport.current) {
        const url = `/report/${gameSlug || 'local'}${buildId ? `/${buildId}` : ''}`;
        window.open(url, '_blank');
        isWaitingForReport.current = false;
      }
    }, 2000);
  };

  // ── Fullscreen toggle ─────────────────────────────────────────────────────
  const toggleFullscreen = () => {
    if (!gameWrapRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      gameWrapRef.current.requestFullscreen?.();
    }
  };

  // ── Error / loading states ────────────────────────────────────────────────
  if (loadError) return (
    <div style={centeredPage}>
      <p style={errTitle}>Unable to Load Game</p>
      <p style={errSub}>{loadError}</p>
    </div>
  );
  if (!buildInfo) return (
    <div style={centeredPage}>
      <p style={errSub}>Loading…</p>
    </div>
  );

  // ── Derived values ────────────────────────────────────────────────────────
  const isLegacy      = buildInfo === 'legacy';
  const gameName      = isLegacy ? 'Local Build'   : (buildInfo.gameName      ?? 'Untitled Game');
  const buildVersion  = isLegacy ? null             : (buildInfo.buildVersion  ?? null);
  const developerName = isLegacy ? null             : (buildInfo.developerName ?? null);
  const canvasW       = isLegacy ? 1920             : (buildInfo.canvasWidth   ?? 1920);
  const canvasH       = isLegacy ? 1080             : (buildInfo.canvasHeight  ?? 1080);

  const urls = isLegacy
    ? { loaderUrl: '/unity/Build/game.loader.js', dataUrl: '/unity/Build/game.data',
        frameworkUrl: '/unity/Build/game.framework.js', codeUrl: '/unity/Build/game.wasm' }
    : { loaderUrl: buildInfo.urls.loader, dataUrl: buildInfo.urls.data,
        frameworkUrl: buildInfo.urls.framework, codeUrl: buildInfo.urls.wasm };

  const gameContainerStyle = {
    maxWidth: `min(100%, calc(72vh * ${canvasW / canvasH}))`,
    aspectRatio: `${canvasW} / ${canvasH}`,
    width: '100%',
    margin: '0 auto',
    background: '#000',
    borderRadius: 12,
    overflow: 'hidden',
  };

  return (
    <div style={pageWrap}>

      {/* ── Global Nav ─────────────────────────────────────────────────── */}
      <nav className="l-nav" ref={navRef}>
        <Link to="/" className="l-logo"><BrandLogo size="md" /></Link>
        <div className="l-nav-links">
          <Link to="/arcade" className="l-nav-link">{t.nav.arcade}</Link>
          <button className="l-lang-toggle" onClick={toggleLang} aria-label="Toggle language">
            {lang === 'en' ? '한국어' : 'English'}
          </button>
          {user ? (
            <Link
              to={user.status === 'approved' ? '/dashboard' : '/pending'}
              className="btn btn-primary btn-sm"
            >
              {t.nav.dashboard}
            </Link>
          ) : (
            <>
              <Link to="/login" className="l-nav-link">{t.nav.signIn}</Link>
              <Link to="/register" className="btn btn-primary btn-sm">{t.nav.getStarted}</Link>
            </>
          )}
        </div>
      </nav>

      {/* ── Game context bar ───────────────────────────────────────────── */}
      <div style={contextBar}>
        <div style={contextBarInner}>
          <span style={contextGameName}>{gameName}</span>
          <button onClick={handleReportClick} style={reportBtn}>
            Report a Bug
          </button>
        </div>
      </div>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section style={heroSection}>
        <div style={container}>
          <h1 style={heroTitle}>{gameName}</h1>
          <p style={heroMeta}>
            {buildVersion  && <span>v{buildVersion}</span>}
            {buildVersion && developerName && <span style={dot}>·</span>}
            {developerName && <span>by {developerName}</span>}
            {!buildVersion && !developerName && (
              <span style={{ opacity: 0.45 }}>Bug reporting is integrated with Unity logs</span>
            )}
          </p>
        </div>
      </section>

      {/* ── Game view ──────────────────────────────────────────────────── */}
      <section style={gameSection}>
        <div style={{ ...container, maxWidth: 1200 }}>
          <div ref={gameWrapRef} style={gameContainerStyle}>
            <UnityGame
              {...urls}
              onReady={(fn) => { sendMessageFn.current = fn; }}
            />
          </div>
          <div style={gameActions}>
            <span style={canvasLabel}>{canvasW} × {canvasH}</span>
            <button onClick={toggleFullscreen} style={fsBtn}>
              {isFullscreen ? '✕ Exit Full Screen' : '⛶ Full Screen'}
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="l-footer">
        <span className="l-footer-logo"><BrandLogo size="sm" /></span>
        <span className="l-footer-copy">{t.footer.tagline}</span>
      </footer>

    </div>
  );
}

// ── Tokens / style objects ────────────────────────────────────────────────────

const FONT     = '"Pretendard", system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';
const INK      = '#171717';
const MUTED    = '#888888';
const HAIRLINE = '#ebebeb';
const DARK_BG  = '#0a0a0a';

const centeredPage = {
  minHeight: '100vh', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  fontFamily: FONT, background: '#fafafa',
};
const errTitle = { fontSize: 20, fontWeight: 600, color: INK, letterSpacing: '-0.03em', margin: 0 };
const errSub   = { fontSize: 14, color: MUTED, marginTop: 8, fontFamily: FONT };

const pageWrap = { fontFamily: FONT, background: '#ffffff', minHeight: '100vh', color: INK };
const container = { maxWidth: 980, margin: '0 auto', padding: '0 24px' };

/* game context bar (secondary, below global nav) */
const contextBar = {
  position: 'sticky',
  top: 'var(--nav-height)',
  zIndex: 100,
  background: 'rgba(255,255,255,0.85)',
  backdropFilter: 'saturate(1.8) blur(16px)',
  WebkitBackdropFilter: 'saturate(1.8) blur(16px)',
  borderBottom: `1px solid ${HAIRLINE}`,
  height: 48,
};
const contextBarInner = {
  maxWidth: 980, margin: '0 auto', padding: '0 24px',
  height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
};
const contextGameName = { fontSize: 14, fontWeight: 600, color: INK, letterSpacing: '-0.02em' };
const reportBtn = {
  padding: '0 16px', height: 30, background: INK, color: '#fff',
  border: 'none', borderRadius: 100, cursor: 'pointer',
  fontSize: 12, fontWeight: 500, fontFamily: FONT,
  transition: 'opacity 0.15s',
};

/* hero */
const heroSection = { padding: '56px 0 40px', background: '#ffffff' };
const heroTitle   = {
  fontSize: 36, fontWeight: 600, color: INK,
  letterSpacing: '-0.04em', lineHeight: 1.1, margin: '0 0 8px',
};
const heroMeta = { fontSize: 14, color: MUTED, margin: 0, display: 'flex', gap: 8, alignItems: 'center', fontFamily: FONT };
const dot = { color: HAIRLINE };

/* game section */
const gameSection = { background: DARK_BG, padding: '36px 0 28px' };
const gameActions = {
  maxWidth: `min(100%, calc(72vh * 2))`,
  margin: '12px auto 0',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '0 4px',
};
const canvasLabel = { fontSize: 11, color: '#555', fontVariantNumeric: 'tabular-nums', fontFamily: '"SF Mono","Menlo","Consolas",monospace' };
const fsBtn = {
  padding: '0 14px', height: 30, background: 'rgba(255,255,255,0.06)', color: '#aaa',
  border: '1px solid rgba(255,255,255,0.10)', borderRadius: 6,
  cursor: 'pointer', fontSize: 12, fontFamily: FONT,
  transition: 'background 0.15s',
};
