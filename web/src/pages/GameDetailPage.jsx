import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { getGame, uploadBuild, activateBuild, getGameReports, updateGame } from '../api.js';
import './DashboardPage.css';
import './GameDetailPage.css';

function fmtDate(iso, lang) {
  return new Date(iso).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function GameDetailPage() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { lang, toggleLang, t } = useI18n();

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
      setUploadError(t.gameDetail.chooseFiles);
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

  const td = t.gameDetail;

  if (loading) {
    return (
      <div className="dash-layout">
        <aside className="dash-sidebar">
          <div className="dash-logo">BugDrop</div>
        </aside>
        <main className="dash-main">
          <p className="dash-loading">{t.loading}</p>
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
          <Link className="dash-nav-item" to="/dashboard">{td.back}</Link>
        </nav>
        <div className="dash-sidebar-footer">
          <button className="dash-footer-btn" onClick={toggleLang}>
            {lang === 'en' ? '한국어' : 'English'}
          </button>
        </div>
      </aside>

      <main className="dash-main">
        <header className="dash-header">
          <div>
            <h1 className="dash-page-title">{game.name}</h1>
            <p className="dash-page-sub">
              {td.playUrl}:{' '}
              <a className="gd-play-link" href={playUrl} target="_blank" rel="noopener noreferrer">
                {window.location.origin}{playUrl}
              </a>
            </p>
          </div>
        </header>

        {/* Tabs */}
        <div className="gd-tabs">
          <button className={`gd-tab${tab === 'builds' ? ' active' : ''}`} onClick={() => setTab('builds')}>
            {td.builds} ({builds.length})
          </button>
          <button className={`gd-tab${tab === 'reports' ? ' active' : ''}`} onClick={() => setTab('reports')}>
            {td.reports} ({reports.length})
          </button>
          <button className={`gd-tab${tab === 'settings' ? ' active' : ''}`} onClick={() => setTab('settings')}>
            {td.settings}
          </button>
        </div>

        {/* ── Builds ── */}
        {tab === 'builds' && (
          <div className="gd-section">
            <h2 className="gd-section-title">{td.uploadTitle}</h2>
            <form className="gd-upload-form" onSubmit={handleUpload}>
              <div className="gd-upload-row">
                <input
                  type="text"
                  className="form-input gd-version-input"
                  placeholder={td.versionPlaceholder}
                  value={uploadVersion}
                  onChange={(e) => setUploadVersion(e.target.value)}
                />
                <label className="btn btn-ghost gd-file-label">
                  {td.chooseFiles}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".js,.wasm,.data,.br,.gz,.html,.json"
                    style={{ display: 'none' }}
                  />
                </label>
                <button type="submit" className="btn btn-primary btn-sm" disabled={uploading}>
                  {uploading ? td.uploading : td.upload}
                </button>
              </div>
              <p className="gd-upload-hint">{td.uploadHint}</p>
              {uploadError && <div className="gd-error">{uploadError}</div>}
            </form>

            {builds.length === 0 ? (
              <p className="gd-empty-text">{td.noBuilds}</p>
            ) : (
              <div className="gd-build-list">
                {builds.map((b) => (
                  <div key={b._id} className={`gd-build-row${b.isActive ? ' active' : ''}`}>
                    <div className="gd-build-meta">
                      {b.isActive && <span className="gd-badge">{td.active}</span>}
                      <span className="gd-build-version">{b.version || '—'}</span>
                      <span className="gd-build-date">{fmtDate(b.createdAt, lang)}</span>
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
                        {td.setActive}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Reports ── */}
        {tab === 'reports' && (
          <div className="gd-section">
            {reports.length === 0 ? (
              <p className="gd-empty-text">{td.noReports}</p>
            ) : (
              <div className="gd-report-list">
                {reports.map((r) => (
                  <Link key={r._id} className="gd-report-row" to={`/dashboard/games/${gameId}/issues/${r._id}`}>
                    <div className="gd-report-title">{r.title}</div>
                    <div className="gd-report-meta">
                      {r.description && (
                        <span className="gd-report-desc">
                          {r.description.slice(0, 80)}{r.description.length > 80 ? '…' : ''}
                        </span>
                      )}
                      <span className="gd-report-date">{fmtDate(r.createdAt, lang)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Settings ── */}
        {tab === 'settings' && (
          <div className="gd-section">
            <h2 className="gd-section-title">{td.discordTitle}</h2>
            <p className="gd-section-desc">{td.discordDesc}</p>
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
                <div className="gd-webhook-actions">
                  <button type="submit" className="btn btn-primary btn-sm" disabled={savingWebhook}>
                    {savingWebhook ? td.saving : td.save}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditingWebhook(false)}>
                    {td.cancel}
                  </button>
                </div>
              </form>
            ) : (
              <div className="gd-webhook-display">
                <span className="gd-webhook-val">
                  {game.discordWebhookUrl || <em className="gd-not-set">{td.notSet}</em>}
                </span>
                <button className="btn btn-ghost" onClick={() => setEditingWebhook(true)}>{td.edit}</button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
