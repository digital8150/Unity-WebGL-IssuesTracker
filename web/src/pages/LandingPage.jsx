import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getArcadeGames, listBlogPosts } from '../api.js';
import { useI18n } from '../i18n.jsx';
import Footer from '../components/Footer.jsx';
import GameCard from '../components/GameCard.jsx';
import PublicNav from '../components/PublicNav.jsx';
import { BlogMedia } from '../components/BlogMedia.jsx';
import { assetUrl, gradientFor } from '../utils/gameVisuals.js';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import './LandingPage.css';

function formatArticleDate(dateStr, lang) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function gameBackground(game) {
  if (game?.thumbnailUrl) return `url("${assetUrl(game.thumbnailUrl)}")`;
  return gradientFor(game?.slug || game?.name || 'arcade');
}

function RecentArticle({ post, lang, t }) {
  const coverUrl = post.coverImageUrl ? assetUrl(post.coverImageUrl) : '';
  return (
    <Link to={`/blog/${post.slug}`} className="l-recent-card">
      <div className="l-recent-cover">
        {coverUrl ? (
          <BlogMedia src={coverUrl} alt={post.title} loading="lazy" />
        ) : (
          <div className="l-recent-cover-fallback" aria-hidden="true" />
        )}
      </div>
      <div className="l-recent-card-copy">
        <span className="l-article-tag">{post.tags?.[0] || t.home.articleFallbackTag}</span>
        <h3>{post.title}</h3>
        <time dateTime={post.publishedAt || post.createdAt}>
          {formatArticleDate(post.publishedAt || post.createdAt, lang)}
        </time>
      </div>
    </Link>
  );
}

export default function LandingPage() {
  const { lang, t } = useI18n();
  const [games, setGames] = useState([]);
  const [recentPosts, setRecentPosts] = useState([]);
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [articlesLoading, setArticlesLoading] = useState(true);

  useDocumentMeta({
    title: t.home.seoTitle,
    description: t.home.seoDescription,
    url: window.location.origin,
    type: 'website',
  });

  useEffect(() => {
    let cancelled = false;
    setGamesLoading(true);
    setArticlesLoading(true);

    Promise.allSettled([
      getArcadeGames(),
      listBlogPosts({ page: 1, limit: 3 }),
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
  }, []);

  const featuredGame = games.find((game) => game.id === selectedGameId) ?? games[0] ?? null;

  return (
    <div className="landing">
      <PublicNav />

      {gamesLoading ? (
        <section className="l-featured-hero l-featured-empty" aria-label={t.home.featuredEyebrow}>
          <div className="l-featured-empty-inner">
            <span className="l-featured-pill">{t.home.featuredEyebrow}</span>
            <p className="l-hero-loading">{t.arcade.loading}</p>
          </div>
        </section>
      ) : featuredGame ? (
        <section className="l-featured-hero">
          <div
            className="l-featured-art"
            style={{ backgroundImage: gameBackground(featuredGame) }}
            aria-hidden="true"
          />
          <div className="l-featured-texture" aria-hidden="true" />
          <div className="l-featured-scrim" aria-hidden="true" />
          <div className="l-featured-inner">
            <div className="l-hero-copy">
              <div className="l-hero-meta-row">
                <span className="l-featured-pill">{t.home.featuredEyebrow}</span>
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
                <Link to={`/play/${featuredGame.slug}`} className="l-hero-primary">
                  <span aria-hidden="true">▶</span> {t.home.playNow}
                </Link>
                <span className="l-hero-note">{t.home.featuredInstallNote}</span>
              </div>
            </div>
          </div>

          <div className="l-featured-strip" aria-label={t.home.featuredEyebrow}>
            <div className="l-featured-strip-inner">
              {games.slice(0, 5).map((game) => (
                <button
                  key={game.id}
                  type="button"
                  className={`l-featured-chip${game.id === featuredGame.id ? ' is-selected' : ''}`}
                  onClick={() => setSelectedGameId(game.id)}
                  aria-pressed={game.id === featuredGame.id}
                >
                  <span
                    className="l-featured-chip-art"
                    style={{ backgroundImage: gameBackground(game) }}
                    aria-hidden="true"
                  />
                  <span className="l-featured-chip-copy">
                    <strong>{game.name}</strong>
                    <small>
                      {game.developerName || t.arcade.trackName}
                      {game.latestBuildVersion && ` · ${t.home.versionPrefix}${game.latestBuildVersion}`}
                    </small>
                  </span>
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
            <Link to="/arcade" className="l-hero-secondary">{t.nav.games}</Link>
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
            <div className="l-games-state"><p>{t.arcade.loading}</p></div>
          ) : games.length === 0 ? (
            <div className="l-games-empty"><p>{t.home.noGames}</p></div>
          ) : (
            <div className="l-games-grid">
              {games.map((game, index) => <GameCard key={game.id} game={game} index={index} />)}
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
              <Link to="/blog" className="l-section-link">{t.home.viewAll}</Link>
            </div>
            {articlesLoading ? (
              <p className="l-recent-state">{t.blog.loading}</p>
            ) : recentPosts.length > 0 ? (
              <div className="l-recent-grid">
                {recentPosts.map((post) => (
                  <RecentArticle key={post._id || post.slug} post={post} lang={lang} t={t} />
                ))}
              </div>
            ) : (
              <p className="l-recent-state">{t.home.noArticles}</p>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
