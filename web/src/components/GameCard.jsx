import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { artworkFor, assetUrl } from '../utils/gameVisuals.js';
import './GameCard.css';

export default function GameCard({ game, index = 0 }) {
  const { t } = useI18n();
  const title = game.name || t.arcade.untitled;
  const artwork = artworkFor(game);

  return (
    <Link
      to={`/play/${game.slug}`}
      className="game-card"
      style={{ animationDelay: `${index * 0.06}s` }}
    >
      <div className="game-card-media">
        {game.thumbnailUrl ? (
          <img src={assetUrl(game.thumbnailUrl)} alt={title} loading="lazy" />
        ) : (
          <div
            className="game-card-media-fallback"
            style={{ background: artwork }}
            aria-hidden="true"
          >
            <span>{title[0]?.toUpperCase() || '?'}</span>
          </div>
        )}
      </div>
      <div className="game-card-body">
        <h2 className="game-card-title">{title}</h2>
        <div className="game-card-meta">
          <span>{game.developerName || t.arcade.trackName}</span>
        </div>
        {game.description && <p className="game-card-description">{game.description}</p>}
        <div className="game-card-footer">
          <span className="game-card-version">
            {game.latestBuildVersion ? `${t.arcade.versionPrefix}${game.latestBuildVersion}` : t.arcade.buildReady}
          </span>
          <span className="game-card-play">{t.arcade.play} <span aria-hidden="true">▸</span></span>
        </div>
      </div>
    </Link>
  );
}
