import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import UnityGame from '../components/UnityGame.jsx';
import PageLink from '../components/PageLink.jsx';
import { getArcadeGames, getPlayInfo, issuePlayToken, listPublicGameArticles } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import Footer from '../components/Footer.jsx';
import { BlogMedia } from '../components/BlogMedia.jsx';
import { GRAC_CONTENT_MARKS, GRAC_RATING_MARKS } from '../constants/gracAssets.js';
import { assetUrl } from '../utils/gameVisuals.js';
import { gameTransitionName } from '../utils/gameTransitions.js';
import { readSsrData } from '../utils/ssrData.js';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import { withLocale } from '../i18n/localePath.js';
import MachineTranslationNotice from '../components/MachineTranslationNotice.jsx';
import CommentSection from '../components/CommentSection.jsx';
import { renderMarkdown } from '../utils/renderMarkdown.js';
import '../styles/markdown-body.css';
import './PlayPage.css';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';
const TOKEN_REFRESH_MS = 9 * 60 * 1000;
const TOKEN_REQUEST_DEBOUNCE_MS = 2 * 1000;
const TOKEN_RETRY_MS = 5 * 1000;

function formatReviewDate(date, lang) {
  if (!date) return '';
  return new Date(date).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatArticleDate(date, lang) {
  if (!date) return '';
  return new Date(date).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function toBuildInfo(bootstrap) {
  const { game, build } = bootstrap ?? {};
  if (!game || !build) return null;
  return {
    gameId: game.id,
    gameSlug: game.slug,
    gameName: game.name,
    description: game.description || '',
    longDescription: game.longDescription || '',
    thumbnailUrl: game.thumbnailUrl || '',
    visibility: game.visibility || 'private',
    reviewInfo: game.reviewInfo || null,
    sdkV2: game.sdkV2 || { enabled: false, cloudSaveEnabled: false },
    developerName: game.developerName ?? null,
    buildId: build.id,
    buildVersion: build.version ?? null,
    canvasWidth: build.canvasWidth ?? 1920,
    canvasHeight: build.canvasHeight ?? 1080,
    urls: build.urls ?? {},
  };
}

export default function PlayPage() {
  const { gameSlug, buildId } = useParams();
  const { lang, t } = useI18n();
  const { user, loading: authLoading } = useAuth() ?? {};

  const bootstrap = readSsrData(buildId ? '/play/:gameSlug/:buildId' : '/play/:gameSlug');
  const initialBuildInfo = toBuildInfo(bootstrap);
  const initialArticles = Array.isArray(bootstrap?.articles) ? bootstrap.articles : [];
  const hasBootstrap = Boolean(initialBuildInfo);
  const [buildInfo, setBuildInfo] = useState(initialBuildInfo);
  const [translation, setTranslation] = useState(bootstrap?.translation ?? null);
  const [loadError, setLoadError] = useState('');
  const [articles, setArticles] = useState(initialArticles);
  const [articlesLoading, setArticlesLoading] = useState(!hasBootstrap);
  const [relatedGames, setRelatedGames] = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const bootstrapBuildPendingRef = useRef(hasBootstrap);
  const bootstrapArticlesPendingRef = useRef(hasBootstrap);

  const sendMessageFn = useRef(null);
  const gameWrapRef = useRef(null);
  const isWaitingForReport = useRef(false);
  const tokenRef = useRef(null);

  useEffect(() => {
    if (bootstrapBuildPendingRef.current) {
      bootstrapBuildPendingRef.current = false;
      return undefined;
    }

    if (!gameSlug) {
      setBuildInfo(null);
      setLoadError('');
      return;
    }
    setBuildInfo(null);
    setLoadError('');
    getPlayInfo(gameSlug, buildId || null, lang)
      .then((response) => {
        setTranslation(response.translation ?? null);
        setBuildInfo(response);
      })
      .catch((err) => setLoadError(err.message));
  }, [gameSlug, buildId, lang]);

  useEffect(() => {
    const sdkV2Enabled = buildInfo?.sdkV2?.enabled === true;
    const shouldConnect = Boolean(gameSlug && sdkV2Enabled && !authLoading && user);

    tokenRef.current = null;
    if (!shouldConnect) return undefined;

    let disposed = false;
    let refreshTimer = null;
    let debounceTimer = null;
    let lastRequestAt = 0;
    let requestInFlight = null;

    const pushCredential = () => {
      const nextToken = tokenRef.current;
      if (!nextToken || !sendMessageFn.current) return;
      sendMessageFn.current('ArcadeSdk', 'SetCredential', JSON.stringify(nextToken));
    };

    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        requestToken();
      }, TOKEN_REFRESH_MS);
    };

    const refreshToken = () => {
      if (disposed || requestInFlight) return requestInFlight;
      lastRequestAt = Date.now();
      requestInFlight = issuePlayToken(gameSlug)
        .then((nextToken) => {
          if (!nextToken?.token) throw new Error('Play token response did not include a token');
          if (disposed) return;
          tokenRef.current = nextToken;
          pushCredential();
          scheduleRefresh();
        })
        .catch((error) => {
          if (!disposed) {
            console.warn('[ArcadeSdk] play token request failed', error);
            window.clearTimeout(refreshTimer);
            refreshTimer = window.setTimeout(() => {
              refreshTimer = null;
              if (!disposed) requestToken();
            }, TOKEN_RETRY_MS);
          }
        })
        .finally(() => {
          requestInFlight = null;
        });
      return requestInFlight;
    };

    const requestToken = () => {
      if (disposed) return;
      const waitMs = TOKEN_REQUEST_DEBOUNCE_MS - (Date.now() - lastRequestAt);
      if (waitMs > 0) {
        window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
          debounceTimer = null;
          refreshToken();
        }, waitMs);
        return;
      }
      refreshToken();
    };

    // Unity may announce readiness before its React wrapper reports isLoaded;
    // the callback remains available until either side is ready.
    window.__arcadeSdkReady = pushCredential;
    // Unity can also ask the page for a replacement after a 401. Keep this
    // browser-owned request path debounced so repeated SDK calls cannot stampede
    // the play-token endpoint.
    window.__arcadeSdkRequestToken = requestToken;
    requestToken();

    return () => {
      disposed = true;
      tokenRef.current = null;
      window.clearTimeout(refreshTimer);
      window.clearTimeout(debounceTimer);
      if (window.__arcadeSdkReady === pushCredential) delete window.__arcadeSdkReady;
      if (window.__arcadeSdkRequestToken === requestToken) delete window.__arcadeSdkRequestToken;
    };
  }, [gameSlug, buildInfo?.sdkV2?.enabled, authLoading, user]);

  useEffect(() => {
    if (bootstrapArticlesPendingRef.current) {
      bootstrapArticlesPendingRef.current = false;
      return undefined;
    }

    if (!gameSlug || !buildInfo) {
      setArticles([]);
      setArticlesLoading(false);
      return;
    }
    setArticles([]);
    setArticlesLoading(true);
    listPublicGameArticles(gameSlug, lang)
      .then(({ articles: loadedArticles }) => setArticles(loadedArticles ?? []))
      .catch(() => setArticles([]))
      .finally(() => setArticlesLoading(false));
  }, [gameSlug, buildInfo, lang]);

  useEffect(() => {
    if (!gameSlug) {
      setRelatedGames([]);
      return undefined;
    }
    setRelatedGames([]);
    getArcadeGames(lang)
      .then(({ games }) => {
        setRelatedGames((games ?? []).filter((game) => game.slug !== gameSlug).slice(0, 3));
      })
      .catch(() => setRelatedGames([]));
    return undefined;
  }, [gameSlug, lang]);

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
    const handler = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);

      if (active) {
        // Chrome/Edge: let the game receive a short Escape press while the
        // browser keeps a long press as the fullscreen escape hatch.
        const keyboard = navigator.keyboard;
        if (keyboard?.lock) keyboard.lock(['Escape']).catch(() => {});
      } else {
        navigator.keyboard?.unlock?.();
      }
    };
    document.addEventListener('fullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      navigator.keyboard?.unlock?.();
    };
  }, []);

  const SITE = 'BCSDLab. Arcade';
  const isRealBuild = Boolean(gameSlug && buildInfo);
  const canonicalPath = gameSlug ? `/play/${gameSlug}${buildId ? `/${buildId}` : ''}` : '/play';
  const canonicalUrl = gameSlug ? `${window.location.origin}${withLocale(canonicalPath, lang)}` : window.location.href;
    const metaCanonicalUrl = lang === 'en' && (!translation || translation.noindex)
    ? `${window.location.origin}${withLocale(canonicalPath, 'ko')}`
    : canonicalUrl;
  const alternateLinks = translation && !translation.noindex ? [
    { hreflang: 'ko', href: `${window.location.origin}${withLocale(canonicalPath, 'ko')}` },
    { hreflang: 'en', href: `${window.location.origin}${withLocale(canonicalPath, 'en')}` },
    { hreflang: 'x-default', href: `${window.location.origin}${withLocale(canonicalPath, 'ko')}` },
  ] : null;
  const seoReviewInfo = isRealBuild && buildInfo.reviewInfo?.enabled ? buildInfo.reviewInfo : null;
  const seoRatingLabel = seoReviewInfo?.rating
    ? (t.gameDetail.reviewRatings[seoReviewInfo.rating] ?? seoReviewInfo.rating)
    : '';
  const seoDescriptorLabels = (seoReviewInfo?.contentDescriptors ?? [])
    .map((key) => t.gameDetail.reviewDescriptorLabels[key])
    .filter(Boolean);
  const seoReviewProperties = seoReviewInfo ? [
    [t.gameDetail.reviewTitleField, seoReviewInfo.title],
    [t.gameDetail.reviewBusinessName, seoReviewInfo.businessName],
    [t.gameDetail.reviewRating, seoRatingLabel],
    [t.gameDetail.reviewClassificationNumber, seoReviewInfo.classificationNumber],
    [t.gameDetail.reviewClassificationDate, formatReviewDate(seoReviewInfo.classificationDate, lang)],
    [t.gameDetail.reviewDeveloperReportNumber, seoReviewInfo.developerReportNumber],
  ].filter(([, value]) => value).map(([name, value]) => ({
    '@type': 'PropertyValue',
    name,
    value: String(value),
  })) : [];
  const seoArticleParts = articles.map((article) => ({
    '@type': 'Article',
    headline: article.title,
    description: article.summary || undefined,
    url: `${window.location.origin}${withLocale(`/play/${gameSlug}/articles/${article.slug}`, lang)}`,
    datePublished: article.publishedAt || article.createdAt,
    dateModified: article.updatedAt || article.publishedAt || article.createdAt,
  }));
  useDocumentMeta(isRealBuild ? {
    title: `${buildInfo.gameName} — ${SITE}`,
    description: buildInfo.description || undefined,
    image: buildInfo.thumbnailUrl ? `${API_BASE}${buildInfo.thumbnailUrl}` : undefined,
    url: metaCanonicalUrl,
    type: 'website',
      robots: lang === 'en' && (!translation || translation.noindex) ? 'noindex,follow' : (buildInfo.visibility === 'public' ? 'index,follow' : 'noindex,follow'),
    alternates: alternateLinks,
    jsonLd: buildInfo.visibility === 'public' ? {
      '@context': 'https://schema.org',
      '@type': 'VideoGame',
      name: buildInfo.gameName,
      description: buildInfo.description || undefined,
      image: buildInfo.thumbnailUrl ? `${API_BASE}${buildInfo.thumbnailUrl}` : undefined,
      url: metaCanonicalUrl,
      gamePlatform: 'Web browser',
      applicationCategory: 'Game',
      author: buildInfo.developerName ? { '@type': 'Person', name: buildInfo.developerName } : undefined,
      version: buildInfo.buildVersion || undefined,
      contentRating: seoRatingLabel || undefined,
      keywords: seoDescriptorLabels.length ? seoDescriptorLabels.join(', ') : undefined,
      additionalProperty: seoReviewProperties.length ? seoReviewProperties : undefined,
      hasPart: seoArticleParts.length ? seoArticleParts : undefined,
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

  const pushCredential = () => {
    if (!tokenRef.current || !sendMessageFn.current) return;
    sendMessageFn.current('ArcadeSdk', 'SetCredential', JSON.stringify(tokenRef.current));
  };

  const toggleFullscreen = async () => {
    if (!gameWrapRef.current) return;
    if (document.fullscreenElement) {
      navigator.keyboard?.unlock?.();
      document.exitFullscreen();
    } else {
      await gameWrapRef.current.requestFullscreen?.();
    }
  };

  const transitionName = gameTransitionName(gameSlug);
  const sdkV2Enabled = buildInfo?.sdkV2?.enabled === true;
  const showAuthLoading = sdkV2Enabled && Boolean(authLoading);
  const showLoginGate = sdkV2Enabled && !authLoading && !user;
  const loginGateFallback = lang === 'ko'
    ? {
        eyebrow: 'ARCADE ID',
        title: '로그인하고 게임을 플레이하세요',
        description: 'Arcade ID로 로그인하면 게임 기록과 클라우드 세이브를 안전하게 이어갈 수 있습니다.',
        action: '로그인하기',
        note: '로그인 후 이 페이지로 돌아옵니다.',
      }
    : {
        eyebrow: 'ARCADE ID',
        title: 'Sign in to play this game',
        description: 'Sign in with your Arcade ID to keep your scores and cloud saves with you.',
        action: 'Sign in',
        note: 'You will come straight back to this game.',
      };
  const loginGateCopy = {
    eyebrow: t.play.loginRequiredEyebrow ?? loginGateFallback.eyebrow,
    title: t.play.loginRequiredTitle ?? loginGateFallback.title,
    description: t.play.loginRequiredDescription ?? loginGateFallback.description,
    action: t.play.loginRequiredAction ?? t.nav.login ?? loginGateFallback.action,
    note: t.play.loginRequiredNote ?? loginGateFallback.note,
  };

  if (!gameSlug) return (
    <div className="play-state" style={{ viewTransitionName: transitionName }}>
      <p className="play-state-title">{t.play.noGameTitle}</p>
      <p className="play-state-sub">{t.play.noGameDescription}</p>
    </div>
  );
  if (loadError) return (
    <div className="play-state" style={{ viewTransitionName: transitionName }}>
      <p className="play-state-title">{t.play.loadError}</p>
      <p className="play-state-sub">{loadError}</p>
    </div>
  );
  if (!buildInfo) return (
    <div className="play-state" style={{ viewTransitionName: transitionName }}>
      <p className="play-state-sub">{t.loading}</p>
    </div>
  );

  const gameName = buildInfo.gameName ?? t.play.untitledGame;
  const buildVersion = buildInfo.buildVersion ?? null;
  const developerName = buildInfo.developerName ?? null;
  const description = buildInfo.description ?? '';
  const longDescription = buildInfo.longDescription ?? '';
  const reviewInfo = buildInfo.reviewInfo;
  const canvasW = buildInfo.canvasWidth ?? 1920;
  const canvasH = buildInfo.canvasHeight ?? 1080;
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

  const urls = {
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
      <section className="play-player" aria-label={gameName}>
        <div className="play-player-bar">
          <div className="play-player-left">
            <PageLink to="/" className="play-back" aria-label={t.play.backToArcade}>
              ←
            </PageLink>
            <PageLink to="/" className="play-player-brand" aria-label={t.nav.home}>
              <BrandLogo size="sm" />
            </PageLink>
            <span className="play-player-divider" aria-hidden="true" />
            <strong className="play-player-name">{gameName}</strong>
            <span className="play-player-version">
              {buildVersion ? `${t.home.versionPrefix}${buildVersion}` : t.play.noVersion}
            </span>
          </div>
          <div className="play-player-actions">
            <span className="play-player-dimensions">{canvasW} × {canvasH}</span>
            <button type="button" onClick={handleReportClick} className="play-player-report">
              <span aria-hidden="true">↗</span> {t.play.reportBug}
            </button>
            <button type="button" onClick={toggleFullscreen} className="play-player-fullscreen">
              {isFullscreen ? `✕ ${t.play.exitFullScreen}` : `⛶ ${t.play.fullScreen}`}
            </button>
          </div>
        </div>
        <div className="play-canvas-stage">
          <div
            ref={gameWrapRef}
            className="play-canvas-frame"
            style={{ ...gameContainerStyle, viewTransitionName: transitionName }}
          >
            {showLoginGate ? (
              <div className="play-login-gate" role="region" aria-label={loginGateCopy.title}>
                <div className="play-login-gate-glow" aria-hidden="true" />
                <div className="play-login-gate-content">
                  <div className="play-login-gate-mark" aria-hidden="true">
                    <svg viewBox="0 0 48 48" focusable="false">
                      <path d="M15 21v-4a9 9 0 0 1 18 0v4" />
                      <rect x="10" y="20" width="28" height="20" rx="5" />
                      <path d="M24 28v5" />
                    </svg>
                  </div>
                  <p className="play-login-gate-eyebrow">{loginGateCopy.eyebrow}</p>
                  <h2>{loginGateCopy.title}</h2>
                  <p className="play-login-gate-description">{loginGateCopy.description}</p>
                  <PageLink
                    to="/login"
                    state={{ from: canonicalPath }}
                    className="play-login-gate-action"
                  >
                    <span>{loginGateCopy.action}</span>
                    <span aria-hidden="true">↗</span>
                  </PageLink>
                  <p className="play-login-gate-note">{loginGateCopy.note}</p>
                </div>
                <div className="play-login-gate-grid" aria-hidden="true" />
              </div>
            ) : showAuthLoading ? (
              <div className="play-login-gate play-login-gate-loading" aria-busy="true">
                <div className="play-login-gate-content">
                  <span className="play-login-gate-spinner" aria-hidden="true" />
                  <p className="play-login-gate-eyebrow">ARCADE ID</p>
                  <p className="play-login-gate-loading-label">{t.loading}</p>
                </div>
              </div>
            ) : (
              <UnityGame
                {...urls}
                onReady={(fn) => { sendMessageFn.current = fn; if (fn) pushCredential(); }}
                gameOverTitle={t.play.gameOver}
                gameOverReload={t.play.reload}
                clickToActivate={t.play.clickToActivate}
                unityErrorTitle={t.play.unityErrorTitle}
                leavingLabel={t.play.leavingGame}
              />
            )}
          </div>
        </div>
      </section>

      <main className="play-content">
        <div className="play-info-layout play-shell">
          <div className="play-main-column">
            <h1 className="play-title">{gameName}</h1>
            <div className="play-meta">
              <span>{developerName ? `${t.play.by} ${developerName}` : t.arcade.trackName}</span>
              <span className="play-meta-dot">·</span>
              <span>{buildVersion ? `${t.home.versionPrefix}${buildVersion}` : t.play.noVersion}</span>
            </div>
            <h2 className="play-description-heading">{t.play.descriptionLabel}</h2>
            {longDescription ? (
              <div
                className="play-description-body markdown-body"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(longDescription) }}
              />
            ) : (
              <p className="play-description">{description || t.play.descriptionEmpty}</p>
            )}
            <MachineTranslationNotice translation={translation} path={canonicalPath} />

            {!articlesLoading && articles.length > 0 && (
              <section className="play-articles-section">
                <div className="play-articles-heading">
                  <div>
                    <p className="play-section-eyebrow">{t.play.devlogEyebrow}</p>
                    <h2>{t.play.updatesTitle}</h2>
                  </div>
                  <PageLink to={`/play/${gameSlug}/articles`} className="play-view-all">{t.play.viewAllArticles}</PageLink>
                </div>
                <div className="play-article-list">
                  {articles.map((article) => {
                    const articleDate = article.publishedAt || article.createdAt;
                    return (
                      <PageLink
                        key={article._id || article.slug}
                        to={`/play/${gameSlug}/articles/${article.slug}`}
                        className="play-article-row"
                      >
                        <div className="play-article-thumb">
                          {article.coverImageUrl ? (
                            <BlogMedia src={assetUrl(article.coverImageUrl)} alt="" loading="lazy" />
                          ) : (
                            <div className="play-article-thumb-fallback" aria-hidden="true" />
                          )}
                        </div>
                        <div className="play-article-copy">
                          <div className="play-article-meta">
                            <span className="play-article-tag">
                              {article.tags?.[0] || t.home.articleFallbackTag}
                            </span>
                            <time dateTime={articleDate}>{formatArticleDate(articleDate, lang)}</time>
                          </div>
                          <h3>{article.title}</h3>
                          {article.summary && <p>{article.summary}</p>}
                        </div>
                      </PageLink>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          <aside className="play-rail">
            <section className="play-info-card">
              <h2 className="play-rail-eyebrow">{t.play.gameInfo}</h2>
              <dl className="play-info-list">
                <div><dt>{t.play.developerLabel}</dt><dd>{developerName || '—'}</dd></div>
                <div><dt>{t.play.latestBuildLabel}</dt><dd>{buildVersion ? `${t.home.versionPrefix}${buildVersion}` : '—'}</dd></div>
              </dl>

              {reviewInfo && (
                <div className="play-rating-block">
                  <h3>{t.play.reviewLabel}</h3>
                  <div className="play-review-marks" aria-label={t.gameDetail.reviewDescriptors}>
                    {ratingMark && (
                      <img className="play-rating-mark" src={ratingMark} alt={ratingLabel} />
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
                  <dl className="play-review-detail-list" aria-label={t.play.reviewLabel}>
                    {reviewDetails.map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value || '—'}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </section>

            {relatedGames.length > 0 && (
              <section className="play-related-section">
                <h2 className="play-rail-eyebrow">{t.play.continuePlaying}</h2>
                <div className="play-related-list">
                  {relatedGames.map((game) => (
                    <PageLink key={game.id} to={`/play/${game.slug}`} className="play-related-card">
                      <div className="play-related-thumb">
                        {game.thumbnailUrl ? (
                          <img src={assetUrl(game.thumbnailUrl)} alt="" loading="lazy" />
                        ) : (
                          <div className="play-related-thumb-fallback" aria-hidden="true" />
                        )}
                      </div>
                      <span className="play-related-copy">
                        <strong>{game.name}</strong>
                        <small>{game.developerName || t.arcade.trackName}</small>
                      </span>
                    </PageLink>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>

        <div className="play-shell">
          <CommentSection gameSlug={gameSlug} />
        </div>
      </main>

      <Footer variant="slim" />
    </div>
  );
}
