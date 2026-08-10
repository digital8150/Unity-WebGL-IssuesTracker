import React, { useEffect, useRef, useState } from 'react';
import { getArcadeGames } from '../api.js';
import { useI18n } from '../i18n.jsx';
import Footer from '../components/Footer.jsx';
import GameCard from '../components/GameCard.jsx';
import PublicNav from '../components/PublicNav.jsx';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import { readSsrData } from '../utils/ssrData.js';
import { withLocale } from '../i18n/localePath.js';
import './ArcadePage.css';

export default function ArcadePage() {
  const { lang, t } = useI18n();
  const bootstrap = readSsrData('/arcade');
  const initialGames = Array.isArray(bootstrap?.games) ? bootstrap.games : [];
  const hasBootstrap = Array.isArray(bootstrap?.games);
  const [games, setGames] = useState(initialGames);
  const [translation, setTranslation] = useState(bootstrap?.translation ?? null);
  const [activeTransitionId, setActiveTransitionId] = useState(null);
  const [loading, setLoading] = useState(!hasBootstrap);
  const bootstrapPendingRef = useRef(hasBootstrap);

  useDocumentMeta({
    title: `${t.arcade.title} — BCSDLab. Arcade`,
    description: t.arcade.sub,
    url: `${window.location.origin}${withLocale('/arcade', lang)}`,
    type: 'website',
  });

  useEffect(() => {
    if (bootstrapPendingRef.current) {
      bootstrapPendingRef.current = false;
      return undefined;
    }

    let cancelled = false;
    getArcadeGames(lang)
      .then(({ games: loadedGames, translation: translationInfo }) => {
        if (!cancelled) {
          setGames(loadedGames ?? []);
          if (lang === 'en' && translationInfo && Object.values(translationInfo).some((row) => row?.origin === 'machine')) {
            setTranslation({ origin: 'machine' });
          } else if (lang === 'en') {
            setTranslation(null);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setGames([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [lang]);

  return (
    <div className="arcade-page">
      <PublicNav active="games" />

      <main className="arcade-main">
        <header className="arcade-header">
          <p className="arcade-eyebrow">{t.arcade.eyebrow}</p>
          <h1>{t.arcade.catalogTitle}</h1>
          <p>{t.arcade.catalogSub}</p>
        </header>

        {loading ? (
          <p className="arcade-loading">{t.arcade.loading}</p>
        ) : games.length === 0 ? (
          <div className="arcade-empty"><p>{t.arcade.empty}</p></div>
        ) : (
          <div className="arcade-grid">
            {games.map((game, index) => (
              <GameCard
                key={game.id}
                game={game}
                index={index}
                isTransitionSource={activeTransitionId === game.id}
                onTransitionIntent={setActiveTransitionId}
              />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
