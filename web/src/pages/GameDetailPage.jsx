import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getGame, uploadBuild, activateBuild, getGameReports, updateGame } from '../api.js';
import './DashboardPage.css';
import './GameDetailPage.css';

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function GameDetailPage() {
  const { gameId } = useParams();
  const navigate = useNavigate();

  const [game, setGame] = useState(null);
  const [builds, setBuilds] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('builds');

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadVersion, setUploadVersion] = useState('');
  const fileInputRef = useRef(null);

  const [editingWebhook, setEditingWebhook] = useState(false);
  const [webhookVal, setWebhookVal] = useState('');
  const [savingWebhook, setSavingWebhook] = useState(false);

  useEffect(() => {
    Promise.all([getGame(gameId), getGameReports(gameId)])
      .then(([{ game, builds }, { issues }]) => {
        setGame(game);
        setBuilds(builds);
        setReports(issues);
        setWebhookVal(game.discordWebhookUrl || '');
      })
      .catch(() => navigate('/dashboard', { replace: true }))
      .finally(() => setLoading(false));
  }, [gameId]);

  async function handleUpload(e) {
    e.preventDefault();
    const files = fileInputRef.current?.files;
    if (!files || !files.length) {
      setUploadError('Select at least one file');
      return;
    }
    setUploadError('');
    setUploading(true);
    try {
      const { build } = await uploadBuild(gameId, Array.from(files), uploadVersion);
      setBuilds((prev) => [build, ...prev]);
      setUploadVersion('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleActivate(buildId) {
    try {
      await activateBuild(gameId, buildId);
      setBuilds((prev) => prev.map((b) => ({ ...b, isActive: b._id === buildId })));
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleSaveWebhook(e) {
    e.preventDefault();
    setSavingWebhook(true);
    try {
      const { game: updated } = await updateGame(gameId, { discordWebhookUrl: webhookVal });
      setGame(updated);
      setEditingWebhook(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingWebhook(false);
    }
  }

  if (loading) {
    return (
      <div className="dash-layout">
        <aside className="dash-sidebar">
          <div className="dash-logo">BugDrop</div>
        </aside>
        <main className="dash-main">
          <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
        </main>
      </div>
    );
  }

  const playUrl = `/play/${game.slug}`;

  return (
    <div className="dash-layout">
      <aside className="dash-sidebar">
        <div className="dash-logo">BugDrop</div>
        <nav className="dash-nav">
          <Link className="dash-nav-item" to="/dashboard">← All Games</Link>
        </nav>
      </aside>

      <main className="dash-main">
        <header className="dash-header">
          <div>
            <h1 className="dash-page-title">{game.name}</h1>
            <p className="dash-page-sub">
              Play URL:{' '}
              <a className="gd-play-link" href={playUrl} target="_blank" rel="noopener noreferrer">
                {window.location.origin}{playUrl}
              </a>
            </p>
          </div>
        </header>

        {/* Tabs */}
        <div className="gd-tabs">
          <button className={`gd-tab${tab === 'builds' ? ' active' : ''}`} onClick={() => setTab('builds')}>
            Builds ({builds.length})
          </button>
          <button className={`gd-tab${tab === 'reports' ? ' active' : ''}`} onClick={() => setTab('reports')}>
            Reports ({reports.length})
          </button>
          <button className={`gd-tab${tab === 'settings' ? ' active' : ''}`} onClick={() => setTab('settings')}>
            Settings
          </button>
        </div>

        {/* ── Builds tab ── */}
        {tab === 'builds' && (
          <div className="gd-section">
            <h2 className="gd-section-title">Upload new build</h2>
            <form className="gd-upload-form" onSubmit={handleUpload}>
              <div className="gd-upload-row">
                <input
                  type="text"
                  className="form-input gd-version-input"
                  placeholder="Version (optional, e.g. 1.2.0)"
                  value={uploadVersion}
                  onChange={(e) => setUploadVersion(e.target.value)}
                />
                <label className="btn btn-ghost gd-file-label">
                  Choose files
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".js,.wasm,.data,.br,.gz,.html,.json"
                    style={{ display: 'none' }}
                  />
                </label>
                <button type="submit" className="btn btn-primary" disabled={uploading}>
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
              </div>
              <p className="gd-upload-hint">
                Select the 4 files from your Unity WebGL Build/ folder: <code>*.loader.js</code>, <code>*.data</code>, <code>*.framework.js</code>, <code>*.wasm</code> (compressed variants accepted).
              </p>
              {uploadError && <div className="gd-error">{uploadError}</div>}
            </form>

            {builds.length === 0 ? (
              <p className="gd-empty-text">No builds uploaded yet.</p>
            ) : (
              <div className="gd-build-list">
                {builds.map((b) => (
                  <div key={b._id} className={`gd-build-row${b.isActive ? ' active' : ''}`}>
                    <div className="gd-build-meta">
                      {b.isActive && <span className="gd-badge">Active</span>}
                      <span className="gd-build-version">{b.version || 'No version'}</span>
                      <span className="gd-build-date">{fmtDate(b.createdAt)}</span>
                    </div>
                    <div className="gd-build-files">
                      {['loader', 'data', 'framework', 'wasm'].map((role) =>
                        b.files?.[role] ? (
                          <span key={role} className="gd-file-chip">{role}</span>
                        ) : (
                          <span key={role} className="gd-file-chip missing">{role}</span>
                        )
                      )}
                    </div>
                    {!b.isActive && (
                      <button className="btn btn-ghost gd-activate-btn" onClick={() => handleActivate(b._id)}>
                        Set active
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Reports tab ── */}
        {tab === 'reports' && (
          <div className="gd-section">
            {reports.length === 0 ? (
              <p className="gd-empty-text">No reports yet. Share the play URL with testers.</p>
            ) : (
              <div className="gd-report-list">
                {reports.map((r) => (
                  <div key={r._id} className="gd-report-row">
                    <div className="gd-report-title">{r.title}</div>
                    <div className="gd-report-meta">
                      {r.description && <span className="gd-report-desc">{r.description.slice(0, 80)}{r.description.length > 80 ? '…' : ''}</span>}
                      <span className="gd-report-date">{fmtDate(r.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Settings tab ── */}
        {tab === 'settings' && (
          <div className="gd-section">
            <h2 className="gd-section-title">Discord webhook</h2>
            <p className="gd-section-desc">New reports will be forwarded to this webhook. Leave blank to use the server-level fallback.</p>
            {editingWebhook ? (
              <form className="gd-webhook-form" onSubmit={handleSaveWebhook}>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://discord.com/api/webhooks/…"
                  value={webhookVal}
                  onChange={(e) => setWebhookVal(e.target.value)}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button type="submit" className="btn btn-primary" disabled={savingWebhook}>
                    {savingWebhook ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditingWebhook(false)}>Cancel</button>
                </div>
              </form>
            ) : (
              <div className="gd-webhook-display">
                <span className="gd-webhook-val">{game.discordWebhookUrl || <em style={{ color: 'var(--text-dim)' }}>Not set</em>}</span>
                <button className="btn btn-ghost" onClick={() => setEditingWebhook(true)}>Edit</button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
