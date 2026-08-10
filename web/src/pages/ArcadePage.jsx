import React, { useEffect, useState } from 'react';
import { getArcadeGames } from '../api.js';
import { useI18n } from '../i18n.jsx';
import Footer from '../components/Footer.jsx';
import GameCard from '../components/GameCard.jsx';
import PublicNav from '../components/PublicNav.jsx';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import './ArcadePage.css';

export default function ArcadePage() {
  const { t } = useI18n();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useDocumentMeta({
    title: `${t.arcade.title} — BCSDLab. Arcade`,
    description: t.arcade.sub,
    url: `${window.location.origin}/arcade`,
    type: 'website',
  });

  useEffect(() => {
    let cancelled = false;
    getArcadeGames()
      .then(({ games: loadedGames }) => {
        if (!cancelled) setGames(loadedGames ?? []);
      })
      .catch(() => {
        if (!cancelled) setGames([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

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
            {games.map((game, index) => <GameCard key={game.id} game={game} index={index} />)}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
