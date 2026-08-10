import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { listPublicGameArticles } from '../api.js';
import { useI18n } from '../i18n.jsx';
import Footer from '../components/Footer.jsx';
import PublicNav from '../components/PublicNav.jsx';
import PageLink from '../components/PageLink.jsx';
import ArticleCardGrid from '../components/ArticleCardGrid.jsx';
import { assetUrl } from '../utils/gameVisuals.js';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import { readSsrData } from '../utils/ssrData.js';
import './GameArticlesPage.css';

export default function GameArticlesPage() {
  const { gameSlug } = useParams();
  const { lang, t } = useI18n();
  const bootstrap = readSsrData('/play/:gameSlug/articles');
  const initialGame = bootstrap?.game ?? null;
  const initialArticles = Array.isArray(bootstrap?.articles) ? bootstrap.articles : [];
  const hasBootstrap = Boolean(initialGame && Array.isArray(bootstrap?.articles));
  const [game, setGame] = useState(initialGame);
  const [articles, setArticles] = useState(initialArticles);
  const [loading, setLoading] = useState(!hasBootstrap);
  const [notFound, setNotFound] = useState(false);
  const bootstrapPendingRef = useRef(hasBootstrap);

  const canonicalUrl = `${window.location.origin}/play/${gameSlug}/articles`;
  const articleListJsonLd = game ? {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${game.name} — ${t.gameArticles.publicTitle}`,
    description: game.description || t.gameArticles.publicSub,
    url: canonicalUrl,
    isPartOf: {
      '@type': 'VideoGame',
      name: game.name,
      url: `${window.location.origin}/play/${gameSlug}`,
    },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: articles.map((article, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: article.title,
        url: `${window.location.origin}/play/${gameSlug}/articles/${article.slug}`,
      })),
    },
  } : undefined;

  useDocumentMeta({
    title: game
      ? `${game.name} · ${t.gameArticles.publicTitle} — BCSDLab. Arcade`
      : `${t.gameArticles.publicTitle} — BCSDLab. Arcade`,
    description: game?.description || t.gameArticles.publicSub,
    image: game?.thumbnailUrl ? assetUrl(game.thumbnailUrl) : undefined,
    url: canonicalUrl,
    type: 'website',
    robots: game && !notFound && articles.length > 0 ? 'index,follow' : 'noindex,follow',
    jsonLd: articleListJsonLd,
  });

  useEffect(() => {
    if (bootstrapPendingRef.current) {
      bootstrapPendingRef.current = false;
      return undefined;
    }

    let active = true;
    setLoading(true);
    setNotFound(false);
    setGame(null);
    setArticles([]);

    listPublicGameArticles(gameSlug)
      .then(({ game: gameInfo, articles: loadedArticles }) => {
        if (!active) return;
        setGame(gameInfo ?? null);
        setArticles(loadedArticles ?? []);
      })
      .catch(() => {
        if (active) setNotFound(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [gameSlug]);

  return (
    <div className="game-articles-page">
      <PublicNav active="games" />

      <main className="game-articles-main">
        {loading ? (
          <p className="game-articles-loading">{t.blog.loading}</p>
        ) : notFound || !game ? (
          <div className="game-articles-notfound">
            <h1>{t.play.loadError}</h1>
            <PageLink to={`/play/${gameSlug}`} className="btn btn-ghost">
              {t.gameArticles.articleBack}
            </PageLink>
          </div>
        ) : (
          <>
            <header className="game-articles-header">
              <PageLink to={`/play/${gameSlug}`} className="game-articles-back">
                {t.gameArticles.articleBack}
              </PageLink>
              <p className="game-articles-eyebrow">GAME ARTICLES</p>
              <h1>{game.name}</h1>
              <p>{game.description || t.gameArticles.publicSub}</p>
            </header>

            <section className="game-articles-results" aria-labelledby="game-articles-title">
              <div className="game-articles-results-heading">
                <div>
                  <p className="game-articles-eyebrow">DEVLOG &amp; PATCH NOTES</p>
                  <h2 id="game-articles-title">{t.gameArticles.publicTitle}</h2>
                </div>
                <span className="game-articles-count">{articles.length}</span>
              </div>

              {articles.length > 0 ? (
                <ArticleCardGrid
                  posts={articles}
                  lang={lang}
                  labels={t.blog}
                  linkForPost={(article) => `/play/${gameSlug}/articles/${article.slug}`}
                  className="game-articles-grid"
                />
              ) : (
                <div className="game-articles-empty">
                  <p>{t.gameArticles.publicEmpty}</p>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
