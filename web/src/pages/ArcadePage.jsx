import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import { getArcadeGames } from '../api.js';
import BrandLogo from '../components/BrandLogo.jsx';
import DarkModeToggle from '../components/DarkModeToggle.jsx';
import './ArcadePage.css';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

const GRADIENTS = [
  'linear-gradient(135deg, #007cf0, #00dfd8)',
  'linear-gradient(135deg, #7928ca, #ff0080)',
  'linear-gradient(135deg, #ff4d4d, #f9cb28)',
  'linear-gradient(135deg, #00dfd8, #7928ca)',
  'linear-gradient(135deg, #f9cb28, #ff4d4d)',
];

function gradientFor(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

export default function ArcadePage() {
  const { user } = useAuth();
  const { lang, toggleLang, t } = useI18n();

  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getArcadeGames()
      .then(({ games }) => setGames(games))
      .catch(() => setGames([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="arcade-page">
      <nav className="arcade-nav">
        <Link to="/" className="arcade-logo"><BrandLogo size="md" /></Link>
        <div className="arcade-nav-links">
          <span className="l-nav-link arcade-nav-active">{t.nav.arcade}</span>
          <Link to="/blog" className="l-nav-link">{t.nav.blog}</Link>
          <button className="l-lang-toggle" onClick={toggleLang}>
            {lang === 'en' ? '한국어' : 'English'}
          </button>
          <DarkModeToggle />
          {user ? (
            <Link
              to={user.status === 'approved' ? '/dashboard' : '/pending'}
              className="btn btn-primary btn-sm"
            >
              {t.nav.dashboard}
            </Link>
          ) : (
            <>
              <Link to="/login" className="l-nav-link nav-signin">{t.nav.signIn}</Link>
              <Link to="/register" className="btn btn-primary btn-sm">{t.nav.getStarted}</Link>
            </>
          )}
        </div>
      </nav>

      <header className="arcade-hero">
        <div className="arcade-hero-mesh" aria-hidden="true" />
        <div className="arcade-hero-inner">
          <h1 className="arcade-hero-title">{t.arcade.title}</h1>
          <p className="arcade-hero-sub">{t.arcade.sub}</p>
        </div>
      </header>

      <main className="arcade-main">
        {loading ? (
          <p className="arcade-loading">{t.arcade.loading}</p>
        ) : games.length === 0 ? (
          <div className="arcade-empty">
            <p>{t.arcade.empty}</p>
          </div>
        ) : (
          <div className="arcade-grid">
            {games.map((g) => (
              <Link key={g.id} to={`/play/${g.slug}`} className="arcade-card">
                <div className="arcade-card-thumb">
                  {g.thumbnailUrl ? (
                    <img src={`${API_BASE}${g.thumbnailUrl}`} alt="" loading="lazy" />
                  ) : (
                    <div
                      className="arcade-card-thumb-fallback"
                      style={{ background: gradientFor(g.slug) }}
                    >
                      <span>{g.name?.[0]?.toUpperCase() || '?'}</span>
                    </div>
                  )}
                </div>
                <div className="arcade-card-body">
                  <div className="arcade-card-title">{g.name}</div>
                  {g.developerName && (
                    <div className="arcade-card-dev">
                      {t.arcade.by} {g.developerName}
                    </div>
                  )}
                  {g.description && <p className="arcade-card-desc">{g.description}</p>}
                  <div className="arcade-card-meta">
                    {g.latestBuildVersion && <span>v{g.latestBuildVersion}</span>}
                    <span className="arcade-card-play">{t.arcade.play} ▸</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      <footer className="l-footer">
        <span className="l-footer-logo"><BrandLogo size="sm" /></span>
        <span className="l-footer-copy">{t.footer.tagline}</span>
      </footer>
    </div>
  );
}
