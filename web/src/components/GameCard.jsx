import React from 'react';
import { useI18n } from '../i18n.jsx';
import PageLink from './PageLink.jsx';
import { artworkFor, assetUrl } from '../utils/gameVisuals.js';
import { activateGameTransitionSource, gameTransitionName } from '../utils/gameTransitions.js';
import './GameCard.css';

export default function GameCard({ game, index = 0, isTransitionSource = false, onTransitionIntent }) {
  const { t } = useI18n();
  const title = game.name || t.arcade.untitled;
  const artwork = artworkFor(game);
  const transitionName = gameTransitionName(game.slug);
  const mediaRef = React.useRef(null);

  const activateSource = () => {
    onTransitionIntent?.(game.id);
    activateGameTransitionSource(mediaRef.current, transitionName);
  };

  return (
    <PageLink
      to={`/play/${game.slug}`}
      className="game-card"
      style={{ animationDelay: `${index * 0.06}s` }}
      onMouseEnter={activateSource}
      onFocus={activateSource}
      onClick={activateSource}
    >
      <div
        ref={mediaRef}
        className="game-card-media"
        style={isTransitionSource ? { viewTransitionName: transitionName } : undefined}
      >
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
    </PageLink>
  );
}
