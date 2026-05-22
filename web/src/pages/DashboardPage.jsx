import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate, Link } from 'react-router-dom';
import { listGames, createGame } from '../api.js';
import './DashboardPage.css';

export default function DashboardPage() {
  const { user, logout } = useAuth();
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
      <aside className="dash-sidebar">
        <div className="dash-logo">BugDrop</div>
        <nav className="dash-nav">
          <span className="dash-nav-item active">Games</span>
        </nav>
        <div className="dash-sidebar-footer">
          <div className="dash-user">
            <div className="dash-avatar">{user?.name?.[0]?.toUpperCase()}</div>
            <div className="dash-user-info">
              <div className="dash-user-name">{user?.name}</div>
              <div className="dash-user-email">{user?.email}</div>
            </div>
          </div>
          <button className="dash-logout" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <main className="dash-main">
        <header className="dash-header">
          <div>
            <h1 className="dash-page-title">Games</h1>
            <p className="dash-page-sub">Manage your Unity WebGL builds and bug reports</p>
          </div>
          <button className="btn btn-primary" onClick={() => { setShowForm(true); setFormError(''); }}>
            + New Game
          </button>
        </header>

        {showForm && (
          <form className="dash-create-form" onSubmit={handleCreate}>
            <div className="dash-create-row">
              <input
                className="form-input"
                placeholder="Game name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                required
              />
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? 'Creating…' : 'Create'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
            {formError && <div className="dash-form-error">{formError}</div>}
          </form>
        )}

        {loading ? (
          <div className="dash-empty"><p style={{ color: 'var(--text-muted)' }}>Loading…</p></div>
        ) : games.length === 0 ? (
          <div className="dash-empty">
            <div className="dash-empty-icon">🎮</div>
            <h2 className="dash-empty-title">No games yet</h2>
            <p className="dash-empty-desc">
              Create your first game to upload a Unity WebGL build and start collecting bug reports.
            </p>
            <button className="btn btn-primary" onClick={() => { setShowForm(true); setFormError(''); }}>
              Create your first game
            </button>
          </div>
        ) : (
          <div className="dash-game-grid">
            {games.map((game) => (
              <Link key={game._id} className="dash-game-card" to={`/dashboard/games/${game._id}`}>
                <div className="dash-game-icon">🎮</div>
                <div className="dash-game-info">
                  <div className="dash-game-name">{game.name}</div>
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
