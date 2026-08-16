import React, { useEffect, useRef, useState } from 'react';
import { getArcadeGames, listBlogPosts } from '../api.js';
import { useI18n } from '../i18n.jsx';
import Footer from '../components/Footer.jsx';
import GameCard from '../components/GameCard.jsx';
import ArticleCardGrid from '../components/ArticleCardGrid.jsx';
import PageLink from '../components/PageLink.jsx';
import PublicNav from '../components/PublicNav.jsx';
import { flamePaletteFor, gradientFor, assetUrl } from '../utils/gameVisuals.js';
import { activateGameTransitionSource, gameTransitionName } from '../utils/gameTransitions.js';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import { readSsrData } from '../utils/ssrData.js';
import { withLocale } from '../i18n/localePath.js';
import CanvasFxLayer from '../components/canvasui/CanvasFxLayer.jsx';
import Blaze from '../components/canvasui/Blaze.tsx';
import './LandingPage.css';

const FEATURED_GAME_LIMIT = 5;
const CAROUSEL_INTERVAL_MS = 3000;

function gameBackground(game) {
  if (game?.thumbnailUrl) return `url("${assetUrl(game.thumbnailUrl)}")`;
  return gradientFor(game?.slug || game?.name || 'arcade');
}

export default function LandingPage() {
  const { lang, t } = useI18n();
  const bootstrap = readSsrData('/');
  const initialGames = Array.isArray(bootstrap?.games) ? bootstrap.games : [];
  const initialPosts = Array.isArray(bootstrap?.posts) ? bootstrap.posts : [];
  const hasBootstrap = Array.isArray(bootstrap?.games) && Array.isArray(bootstrap?.posts);
  const [games, setGames] = useState(initialGames);
  const [recentPosts, setRecentPosts] = useState(initialPosts);
  const [selectedGameId, setSelectedGameId] = useState(initialGames[0]?.id ?? null);
  const [activeTransition, setActiveTransition] = useState(null);
  const [isCarouselPaused, setIsCarouselPaused] = useState(false);
  const featuredArtRef = useRef(null);
  const [gamesLoading, setGamesLoading] = useState(!hasBootstrap);
  const [articlesLoading, setArticlesLoading] = useState(!hasBootstrap);
  const bootstrapPendingRef = useRef(hasBootstrap);

  useDocumentMeta({
    title: t.home.seoTitle,
    description: t.home.seoDescription,
    url: `${window.location.origin}${withLocale('/', lang)}`,
    type: 'website',
  });

  useEffect(() => {
    if (bootstrapPendingRef.current) {
      bootstrapPendingRef.current = false;
      return undefined;
    }

    let cancelled = false;
    setGamesLoading(true);
    setArticlesLoading(true);

    Promise.allSettled([
      getArcadeGames(lang),
      listBlogPosts({ page: 1, limit: 3, locale: lang }),
    ]).then(([gamesResult, postsResult]) => {
      if (cancelled) return;
      if (gamesResult.status === 'fulfilled') {
        const loadedGames = gamesResult.value.games ?? [];
        setGames(loadedGames);
        setSelectedGameId(loadedGames[0]?.id ?? null);
      } else {
        setGames([]);
      }
      if (postsResult.status === 'fulfilled') setRecentPosts(postsResult.value.posts ?? []);
      else setRecentPosts([]);
      setGamesLoading(false);
      setArticlesLoading(false);
    });

    return () => { cancelled = true; };
  }, [lang]);

  useEffect(() => {
    const featuredGames = games.slice(0, FEATURED_GAME_LIMIT);
    if (featuredGames.length < 2 || isCarouselPaused) return undefined;

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (prefersReducedMotion) return undefined;

    const timer = window.setInterval(() => {
      setSelectedGameId((currentId) => {
        const currentIndex = featuredGames.findIndex((game) => game.id === currentId);
        return featuredGames[(currentIndex + 1) % featuredGames.length].id;
      });
    }, CAROUSEL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [games, isCarouselPaused]);

  const featuredGame = games.find((game) => game.id === selectedGameId) ?? games[0] ?? null;
  const featuredGames = games.slice(0, FEATURED_GAME_LIMIT);
  const featuredTransitionName = featuredGame ? gameTransitionName(featuredGame.slug) : undefined;
  const featuredFlamePalette = featuredGame
    ? flamePaletteFor(featuredGame.slug || featuredGame.name || 'arcade')
    : null;
  const activateFeaturedSource = () => {
    if (!featuredGame) return;
    setActiveTransition({ id: featuredGame.id, type: 'hero' });
    activateGameTransitionSource(featuredArtRef.current, featuredTransitionName);
  };

  return (
    <div className="landing">
      <PublicNav />

      {gamesLoading ? (
        // Mirrors the real hero's structure so the bars sit exactly where the
        // copy lands, continuing the inline shell skeleton in index.html instead
        // of flashing a second, differently-shaped "loading" screen.
        <section
          className="l-featured-hero l-featured-skeleton"
          aria-busy="true"
          aria-label={t.arcade.loading}
        >
          <div className="l-featured-inner">
            <div className="l-hero-copy l-skeleton-hero-copy" aria-hidden="true">
              <span className="l-skeleton-bar" />
              <span className="l-skeleton-bar" />
              <span className="l-skeleton-bar" />
              <span className="l-skeleton-bar" />
              <span className="l-skeleton-bar" />
            </div>
          </div>
        </section>
      ) : featuredGame ? (
        <section
          className="l-featured-hero"
          role="region"
          aria-roledescription="carousel"
          aria-label={t.home.updatedEyebrow}
          onMouseEnter={() => setIsCarouselPaused(true)}
          onMouseLeave={() => setIsCarouselPaused(false)}
          onFocus={() => setIsCarouselPaused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setIsCarouselPaused(false);
          }}
        >
          <CanvasFxLayer
            mode="fill"
            effect={Blaze}
            className="l-hero-fx"
            // The artwork and scrim sit inside the layer so the captured
            // content stays opaque; see the note on .fx-layer-content in
            // Footer.css.
            options={{
              height: 0.9,
              distortion: 0.6,
              layers: 4,
              sparks: 0.5,
              sparkDensity: 1.5,
              sparkSize: 1,
              smoke: 0.5,
              glow: 1.5,
              ...featuredFlamePalette,
            }}
          >
            <div
              key={`art-${featuredGame.id}`}
              ref={featuredArtRef}
              className="l-featured-art"
              style={{
                backgroundImage: gameBackground(featuredGame),
                ...(activeTransition?.type === 'hero' && activeTransition.id === featuredGame.id
                  ? { viewTransitionName: featuredTransitionName }
                  : {}),
              }}
              aria-hidden="true"
            />
            <div className="l-featured-scrim" aria-hidden="true" />
            <div className="l-featured-inner" key={`copy-${featuredGame.id}`}>
              <div className="l-hero-copy l-featured-copy" aria-live={isCarouselPaused ? 'polite' : 'off'}>
                <div className="l-hero-meta-row">
                  <span className="l-featured-pill">{t.home.updatedEyebrow}</span>
                  <span className="l-hero-meta">
                    {featuredGame.developerName || t.arcade.trackName}
                    {featuredGame.latestBuildVersion && ` · ${t.home.versionPrefix}${featuredGame.latestBuildVersion}`}
                  </span>
                </div>
                <h1 className="l-hero-title">{featuredGame.name}</h1>
                <p className="l-hero-description">
                  {featuredGame.description || t.home.featuredDescriptionFallback}
                </p>
                <div className="l-hero-actions">
                  <PageLink
                    to={`/play/${featuredGame.slug}`}
                    className="l-hero-primary"
                    onMouseEnter={activateFeaturedSource}
                    onFocus={activateFeaturedSource}
                    onClick={activateFeaturedSource}
                  >
                    <span className="l-hero-primary-label">
                      <span aria-hidden="true">▶</span> {t.home.playNow}
                    </span>
                  </PageLink>
                  <span className="l-hero-note">{t.home.featuredInstallNote}</span>
                </div>
              </div>
            </div>
          </CanvasFxLayer>

          <div
            className={`l-featured-pagination${isCarouselPaused ? ' is-paused' : ''}`}
            aria-label={t.home.updatedEyebrow}
          >
            <div className="l-featured-dots" aria-label={t.home.updatedEyebrow}>
              {featuredGames.map((game) => (
                <button
                  key={game.id}
                  type="button"
                  className={`l-featured-dot${game.id === featuredGame.id ? ' is-selected' : ''}`}
                  onClick={() => setSelectedGameId(game.id)}
                  aria-label={game.name}
                  aria-current={game.id === featuredGame.id ? 'true' : undefined}
                >
                  <span aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section className="l-featured-hero l-featured-empty">
          <div className="l-featured-empty-inner">
            <span className="l-featured-pill">{t.home.featuredEyebrow}</span>
            <h1 className="l-hero-title">{t.home.featuredEmptyTitle}</h1>
            <p className="l-hero-description">{t.home.featuredEmptyDescription}</p>
            <PageLink to="/arcade" className="l-hero-secondary">{t.nav.games}</PageLink>
          </div>
        </section>
      )}

      <main>
        <section className="l-games-section" id="all-games">
          <div className="l-section-heading">
            <div>
              <p className="l-eyebrow">{t.home.gamesEyebrow}</p>
              <h2>{t.home.gamesTitle}</h2>
            </div>
          </div>
          {gamesLoading ? (
            <div className="l-games-grid" aria-busy="true" aria-label={t.arcade.loading}>
              {[0, 1, 2].map((slot) => (
                <div key={slot} className="l-card-skeleton" aria-hidden="true">
                  <div className="l-card-skeleton-media" />
                  <div className="l-card-skeleton-copy">
                    <span className="l-skeleton-bar" />
                    <span className="l-skeleton-bar" />
                  </div>
                </div>
              ))}
            </div>
          ) : games.length === 0 ? (
            <div className="l-games-empty"><p>{t.home.noGames}</p></div>
          ) : (
            <div className="l-games-grid">
              {games.map((game, index) => (
                <GameCard
                  key={game.id}
                  game={game}
                  index={index}
                  isTransitionSource={activeTransition?.type === 'card' && activeTransition.id === game.id}
                  onTransitionIntent={(id) => setActiveTransition({ id, type: 'card' })}
                />
              ))}
            </div>
          )}
        </section>

        <section className="l-recent-section">
          <div className="l-recent-inner">
            <div className="l-section-heading l-recent-heading">
              <div>
                <p className="l-eyebrow">{t.home.recentEyebrow}</p>
                <h2>{t.home.recentTitle}</h2>
              </div>
              <PageLink to="/blog" className="l-section-link">{t.home.viewAll}</PageLink>
            </div>
            {articlesLoading ? (
              <p className="l-recent-state">{t.blog.loading}</p>
            ) : recentPosts.length > 0 ? (
              <ArticleCardGrid
                posts={recentPosts}
                lang={lang}
                labels={t.blog}
                linkForPost={(post) => `/blog/${post.slug}`}
              />
            ) : (
              <p className="l-recent-state">{t.home.noArticles}</p>
            )}
          </div>
        </section>
      </main>

      <Footer variant="landing" />
    </div>
  );
}
