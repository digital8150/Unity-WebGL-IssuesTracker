import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import { useNavigate, Link } from 'react-router-dom';
import { listGames, createGame } from '../api.js';
import StorageBar from '../components/StorageBar.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import './DashboardPage.css';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const { lang, toggleLang, t } = useI18n();
  const navigate = useNavigate();

  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    listGames()
      .then(({ games }) => setGames(games))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setFormError('');
    setCreating(true);
    try {
      const { game } = await createGame(newName.trim());
      setGames((prev) => [game, ...prev]);
      setNewName('');
      setShowForm(false);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="dash-layout">
      {/* Sidebar */}
      <aside className="dash-sidebar">
        <Link to="/" className="dash-logo"><BrandLogo /></Link>
        <nav className="dash-nav">
          <span className="dash-nav-item active">{t.dash.title}</span>
          <Link className="dash-nav-item" to="/arcade">{t.nav.arcade}</Link>
          <Link className="dash-nav-item" to="/admin/blog">{t.nav.blogAdmin} CMS</Link>
          {user?.role === 'admin' && (
            <Link className="dash-nav-item" to="/admin/users">{t.nav.admin}</Link>
          )}
        </nav>
        <div className="dash-sidebar-footer">
          <StorageBar label={t.storage.label} />
          <div className="dash-user">
            <div className="dash-avatar">{user?.name?.[0]?.toUpperCase()}</div>
            <div className="dash-user-info">
              <div className="dash-user-name">{user?.name}</div>
              <div className="dash-user-email">{user?.email}</div>
            </div>
          </div>
          <button className="dash-footer-btn" onClick={toggleLang}>
            {lang === 'en' ? '한국어' : 'English'}
          </button>
          <button className="dash-footer-btn" onClick={handleLogout}>{t.nav.signOut}</button>
        </div>
      </aside>

      {/* Main */}
      <main className="dash-main">
        <header className="dash-header">
          <div>
            <h1 className="dash-page-title">{t.dash.title}</h1>
            <p className="dash-page-sub">{t.dash.sub}</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => { setShowForm(true); setFormError(''); }}>
            {t.dash.newGame}
          </button>
        </header>

        {showForm && (
          <form className="dash-create-form" onSubmit={handleCreate}>
            <div className="dash-create-row">
              <input
                className="form-input"
                placeholder={t.dash.gameName}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                required
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>
                {creating ? t.dash.creating : t.dash.create}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>
                {t.dash.cancel}
              </button>
            </div>
            {formError && <div className="dash-form-error">{formError}</div>}
          </form>
        )}

        {loading ? (
          <div className="dash-empty"><p className="dash-loading">{t.dash.loading}</p></div>
        ) : games.length === 0 ? (
          <div className="dash-empty">
            <h2 className="dash-empty-title">{t.dash.noGames}</h2>
            <p className="dash-empty-desc">{t.dash.noGamesDesc}</p>
            <button className="btn btn-primary btn-sm" onClick={() => { setShowForm(true); setFormError(''); }}>
              {t.dash.createFirst}
            </button>
          </div>
        ) : (
          <div className="dash-game-grid">
            {games.map((game) => (
              <Link key={game._id} className="dash-game-card" to={`/dashboard/games/${game._id}`}>
                <div className="dash-game-info">
                  <div className="dash-game-name-row">
                    <div className="dash-game-name">{game.name}</div>
                    {!game.isOwner && (
                      <span className="dash-collab-badge">{t.collab.collabBadge}</span>
                    )}
                  </div>
                  <div className="dash-game-slug">/{game.slug}</div>
                </div>
                <div className="dash-game-arrow">›</div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
