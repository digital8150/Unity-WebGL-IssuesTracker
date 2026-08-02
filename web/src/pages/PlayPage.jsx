import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import UnityGame from '../components/UnityGame.jsx';
import ArticleCardGrid from '../components/ArticleCardGrid.jsx';
import { getPlayInfo, listPublicGameArticles } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import Footer from '../components/Footer.jsx';
import DarkModeToggle from '../components/DarkModeToggle.jsx';
import { GRAC_CONTENT_MARKS, GRAC_RATING_MARKS } from '../constants/gracAssets.js';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import './LandingPage.css';
import './PlayPage.css';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

function formatReviewDate(date, lang) {
  if (!date) return '';
  return new Date(date).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

export default function PlayPage() {
  const { gameSlug, buildId } = useParams();
  const { user } = useAuth();
  const { lang, toggleLang, t } = useI18n();

  const [buildInfo, setBuildInfo] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [articles, setArticles] = useState([]);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const sendMessageFn = useRef(null);
  const gameWrapRef = useRef(null);
  const isWaitingForReport = useRef(false);
  const navRef = useRef(null);

  useEffect(() => {
    if (!gameSlug) {
      setBuildInfo('legacy');
      return;
    }
    setBuildInfo(null);
    setLoadError('');
    getPlayInfo(gameSlug, buildId || null)
      .then(setBuildInfo)
      .catch((err) => setLoadError(err.message));
  }, [gameSlug, buildId]);

  useEffect(() => {
    if (!gameSlug || !buildInfo || buildInfo === 'legacy') return;
    setArticlesLoading(true);
    listPublicGameArticles(gameSlug)
      .then(({ articles: loadedArticles }) => setArticles(loadedArticles ?? []))
      .catch(() => setArticles([]))
      .finally(() => setArticlesLoading(false));
  }, [gameSlug, buildInfo]);

  useEffect(() => {
    window.__issueTrackerReceive = (payloadJson) => {
      sessionStorage.setItem('pendingReport', payloadJson);
      const url = `/report/${gameSlug || 'local'}${buildId ? `/${buildId}` : ''}`;
      window.open(url, '_blank');
      isWaitingForReport.current = false;
    };
    return () => { delete window.__issueTrackerReceive; };
  }, [gameSlug, buildId]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => {
    function onScroll() {
      navRef.current?.classList.toggle('scrolled', window.scrollY > 8);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const SITE = 'BCSDLab. Arcade';
  const isRealBuild = buildInfo && buildInfo !== 'legacy';
  useDocumentMeta(isRealBuild ? {
    title: `${buildInfo.gameName} — ${SITE}`,
    description: buildInfo.description || undefined,
    image: buildInfo.thumbnailUrl ? `${API_BASE}${buildInfo.thumbnailUrl}` : undefined,
    url: window.location.href,
    type: 'website',
    robots: buildInfo.visibility === 'public' ? 'index,follow' : 'noindex,follow',
    jsonLd: buildInfo.visibility === 'public' ? {
      '@context': 'https://schema.org',
      '@type': 'VideoGame',
      name: buildInfo.gameName,
      description: buildInfo.description || undefined,
      image: buildInfo.thumbnailUrl ? `${API_BASE}${buildInfo.thumbnailUrl}` : undefined,
      url: window.location.href,
      gamePlatform: 'Web browser',
      applicationCategory: 'Game',
      author: buildInfo.developerName ? { '@type': 'Person', name: buildInfo.developerName } : undefined,
      version: buildInfo.buildVersion || undefined,
    } : undefined,
  } : {});

  const handleReportClick = () => {
    const url = `/report/${gameSlug || 'local'}${buildId ? `/${buildId}` : ''}`;
    if (!sendMessageFn.current) {
      window.open(url, '_blank');
      return;
    }
    isWaitingForReport.current = true;
    sendMessageFn.current('IssueTracker', 'SubmitReport', JSON.stringify({ manualTrigger: true }));
    setTimeout(() => {
      if (isWaitingForReport.current) {
        window.open(url, '_blank');
        isWaitingForReport.current = false;
      }
    }, 2000);
  };

  const toggleFullscreen = async () => {
    if (!gameWrapRef.current) return;
    if (document.fullscreenElement) {
      navigator.keyboard?.unlock?.();
      document.exitFullscreen();
    } else {
      await gameWrapRef.current.requestFullscreen?.();
      await navigator.keyboard?.lock?.(['Escape']).catch(() => {});
    }
  };

  if (loadError) return (
    <div className="play-state">
      <p className="play-state-title">{t.play.loadError}</p>
      <p className="play-state-sub">{loadError}</p>
    </div>
  );
  if (!buildInfo) return (
    <div className="play-state">
      <p className="play-state-sub">{t.loading}</p>
    </div>
  );

  const isLegacy = buildInfo === 'legacy';
  const gameName = isLegacy ? t.play.localBuild : (buildInfo.gameName ?? 'Untitled Game');
  const buildVersion = isLegacy ? null : (buildInfo.buildVersion ?? null);
  const developerName = isLegacy ? null : (buildInfo.developerName ?? null);
  const description = isLegacy ? '' : (buildInfo.description ?? '');
  const reviewInfo = isLegacy ? null : buildInfo.reviewInfo;
  const canvasW = isLegacy ? 1920 : (buildInfo.canvasWidth ?? 1920);
  const canvasH = isLegacy ? 1080 : (buildInfo.canvasHeight ?? 1080);
  const ratingMark = reviewInfo?.rating ? GRAC_RATING_MARKS[reviewInfo.rating] : null;
  const descriptorKeys = (reviewInfo?.contentDescriptors ?? []).filter((key) => GRAC_CONTENT_MARKS[key]);
  const ratingLabel = reviewInfo?.rating
    ? (t.gameDetail.reviewRatings[reviewInfo.rating] ?? reviewInfo.rating)
    : '';
  const reviewDetails = reviewInfo ? [
    [t.gameDetail.reviewTitleField, reviewInfo.title],
    [t.gameDetail.reviewBusinessName, reviewInfo.businessName],
    [t.gameDetail.reviewRating, ratingLabel],
    [t.gameDetail.reviewClassificationNumber, reviewInfo.classificationNumber],
    [t.gameDetail.reviewClassificationDate, formatReviewDate(reviewInfo.classificationDate, lang)],
    [t.gameDetail.reviewDeveloperReportNumber, reviewInfo.developerReportNumber],
  ] : [];

  const urls = isLegacy
    ? {
        loaderUrl: '/unity/Build/game.loader.js',
        dataUrl: '/unity/Build/game.data',
        frameworkUrl: '/unity/Build/game.framework.js',
        codeUrl: '/unity/Build/game.wasm',
      }
    : {
        loaderUrl: buildInfo.urls.loader,
        dataUrl: buildInfo.urls.data,
        frameworkUrl: buildInfo.urls.framework,
        codeUrl: buildInfo.urls.wasm,
        streamingAssetsUrl: buildInfo.urls.streamingAssets ?? undefined,
      };

  const gameContainerStyle = {
    maxWidth: `min(100%, calc(72vh * ${canvasW / canvasH}))`,
    aspectRatio: `${canvasW} / ${canvasH}`,
  };

  return (
    <div className="play-page">
      <nav className="l-nav" ref={navRef}>
        <Link to="/" className="l-logo"><BrandLogo size="md" /></Link>
        <div className="l-nav-links">
          <Link to="/arcade" className="l-nav-link">{t.nav.arcade}</Link>
          <Link to="/blog" className="l-nav-link">{t.nav.blog}</Link>
          <button className="l-lang-toggle" onClick={toggleLang} aria-label="Toggle language">
            {lang === 'en' ? '한국어' : 'English'}
          </button>
          <DarkModeToggle />
          {user ? (
            <Link to={user.status === 'approved' ? '/dashboard' : '/pending'} className="btn btn-primary btn-sm">
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

      <section className="play-game-section">
        <div className="play-shell">
          <div ref={gameWrapRef} className="play-canvas-frame" style={gameContainerStyle}>
            <UnityGame
              {...urls}
              onReady={(fn) => { sendMessageFn.current = fn; }}
              gameOverTitle={t.play.gameOver}
              gameOverReload={t.play.reload}
              clickToActivate={t.play.clickToActivate}
            />
          </div>
          <div className="play-game-actions" style={{ maxWidth: gameContainerStyle.maxWidth }}>
            <span className="play-canvas-label">{canvasW} × {canvasH}</span>
            <button onClick={toggleFullscreen} className="play-fullscreen-btn">
              {isFullscreen ? `✕ ${t.play.exitFullScreen}` : `⛶ ${t.play.fullScreen}`}
            </button>
          </div>
        </div>
      </section>

      <main className="play-content">
        <section className="play-info-section play-shell">
          <div className="play-title-row">
            <div>
              <h1 className="play-title">{gameName}</h1>
              <div className="play-meta">
                {buildVersion && <span>v{buildVersion}</span>}
                {buildVersion && developerName && <span className="play-meta-dot">·</span>}
                {developerName && <span>{t.play.by} {developerName}</span>}
              </div>
            </div>
            <button onClick={handleReportClick} className="play-report-btn">
              <span aria-hidden="true">↗</span> {t.play.reportBug}
            </button>
          </div>

          <div className="play-description-block">
            <h2>{t.play.descriptionLabel}</h2>
            <p>{description || t.play.descriptionEmpty}</p>
          </div>
        </section>

        {reviewInfo && (
          <section className="play-review-section play-shell">
            <div className="play-review-card">
              <h2>{t.play.reviewLabel}</h2>
              <div className="play-review-layout">
                <div className="play-review-visual" aria-label={t.gameDetail.reviewDescriptors}>
                  <div className="play-review-marks">
                    {ratingMark && (
                      <img
                        className="play-rating-mark"
                        src={ratingMark}
                        alt={ratingLabel}
                      />
                    )}
                    {descriptorKeys.map((key) => (
                      <img
                        key={key}
                        className="play-descriptor-mark"
                        src={GRAC_CONTENT_MARKS[key]}
                        alt={t.gameDetail.reviewDescriptorLabels[key]}
                      />
                    ))}
                  </div>
                </div>
                <div className="play-review-details">
                  <div className="play-review-detail-grid" role="table" aria-label={t.play.reviewLabel}>
                    {reviewDetails.map(([label, value]) => (
                      <div key={label} className="play-review-detail-cell" role="row">
                        <span>{label}</span>
                        <strong>{value || '—'}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="play-articles-section play-shell">
          <div className="play-articles-heading">
            <div>
              <h2>{t.gameArticles.publicTitle}</h2>
              <p>{t.gameArticles.publicSub}</p>
            </div>
          </div>
          {articlesLoading ? (
            <p className="play-articles-empty">{t.loading}</p>
          ) : articles.length > 0 ? (
            <ArticleCardGrid
              posts={articles}
              lang={lang}
              labels={t.blog}
              className="play-article-grid"
              linkForPost={(article) => `/play/${gameSlug}/articles/${article.slug}`}
            />
          ) : (
            <p className="play-articles-empty">{t.gameArticles.publicEmpty}</p>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
