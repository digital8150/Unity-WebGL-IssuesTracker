import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useI18n } from '../i18n.jsx';
import { CodeBlock } from './GameDetailPage.jsx';
import Modal from '../components/Modal.jsx';

// Heavy editor libs (guifier + vanilla-jsoneditor) live in this lazily-loaded
// chunk so they only download when the config editor is actually opened.
const ConfigEditModal = lazy(() => import('./ConfigEditModal.jsx'));

import {
  getGameBackend,
  updateGameBackend,
  rotateGameSecret,
  getGeneratedCode,
  getGeneratedSdk,
  issueV2DevToken,
  createLeaderboard,
  updateLeaderboard,
  deleteLeaderboard,
  getLeaderboardEntries,
  deleteLegacyLeaderboardEntries,
  getLeaderboardScores,
  deleteLeaderboardScore,
  deleteDevLeaderboardScores,
  getCloudSaves,
  deleteCloudSave,
  deleteDevCloudSaves,
  createConfigKey,
  updateConfigKey,
  deleteConfigKey,
} from '../api.js';

function pageInfo(data, page = 1, fallbackRows = []) {
  const rows = data?.scores ?? data?.saves ?? data?.items ?? data?.rows ?? data?.entries ?? fallbackRows;
  const current = Number(data?.page) || page;
  const pages = Math.max(current, Number(data?.pages ?? data?.totalPages ?? 1) || 1);
  return {
    ...data,
    rows: Array.isArray(rows) ? rows : [],
    page: current,
    pages,
    total: Number(data?.total ?? data?.count ?? rows?.length ?? 0),
  };
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function getIntegrationMode(serverBackend) {
  if (serverBackend?.liveOpsMode === 'v2') return 'v2';
  if (serverBackend?.liveOpsMode === 'legacy') return 'legacy';
  return serverBackend?.v2Enabled ? 'v2' : 'legacy';
}

function hasLegacyBackendConfiguration(serverBackend) {
  return Boolean(
    serverBackend?.secret
      || serverBackend?.leaderboardEnabled
      || serverBackend?.configEnabled
      || serverBackend?.v2Enabled
      || serverBackend?.cloudSaveEnabled,
  );
}

function hasLegacyCompatibilityData(serverBackend) {
  return Boolean(
    serverBackend?.secret
      || serverBackend?.leaderboardEnabled
      || serverBackend?.configEnabled,
  );
}

function hasExplicitLiveOpsMode(serverBackend) {
  return serverBackend?.liveOpsMode === 'legacy' || serverBackend?.liveOpsMode === 'v2';
}

function resolveLiveOpsEnabled(serverBackend) {
  if (
    serverBackend?.liveOpsEnabled === false
    && !hasExplicitLiveOpsMode(serverBackend)
    && hasLegacyCompatibilityData(serverBackend)
  ) return true;
  if (serverBackend?.liveOpsEnabled !== undefined) return Boolean(serverBackend.liveOpsEnabled);
  return hasLegacyBackendConfiguration(serverBackend);
}

export default function ServerIntegrationTab({ gameId }) {
  const { lang, t } = useI18n();
  const td = t.gameDetail;

  const [backend, setBackend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [entriesByLb, setEntriesByLb] = useState({});
  const [entriesModalLb, setEntriesModalLb] = useState(null);
  const [scoresByLb, setScoresByLb] = useState({});
  const [scoresLoadingByLb, setScoresLoadingByLb] = useState({});
  const [configModalCfg, setConfigModalCfg] = useState(null);
  const [generated, setGenerated] = useState(null);
  const [genError, setGenError] = useState('');
  const [generatedSdk, setGeneratedSdk] = useState(null);
  const [sdkError, setSdkError] = useState('');
  const [devToken, setDevToken] = useState(null);
  const [devTokenBusy, setDevTokenBusy] = useState(false);
  const [cloudSaves, setCloudSaves] = useState(null);
  const [cloudSavesLoading, setCloudSavesLoading] = useState(false);

  const [newLb, setNewLb] = useState({ key: '', label: '', sort: 'desc', maxEntries: 10, scoreMin: '', scoreMax: '' });
  const [newCfg, setNewCfg] = useState({ key: '', value: '' });

  const refresh = useCallback(async () => {
    try {
      const data = await getGameBackend(gameId);
      setBackend(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => { refresh(); }, [refresh]);

  const loadCloudSaves = useCallback(async (page = 1) => {
    setCloudSavesLoading(true);
    try {
      const data = await getCloudSaves(gameId, page);
      setCloudSaves(pageInfo(data, page));
    } catch (err) {
      setError(err.message);
    } finally {
      setCloudSavesLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    if (
      backend?.serverBackend?.cloudSaveEnabled
      && getIntegrationMode(backend.serverBackend) === 'v2'
    ) loadCloudSaves(1);
  }, [backend?.serverBackend?.cloudSaveEnabled, backend?.serverBackend?.liveOpsMode, loadCloudSaves]);

  async function updateBackend(fields) {
    setError('');
    try {
      await updateGameBackend(gameId, fields);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleToggle(field, value) {
    await updateBackend({ [field]: value });
  }

  async function handleLiveOpsToggle(value) {
    await updateBackend({ liveOpsEnabled: value });
  }

  async function handleModeChange(mode) {
    setGenerated(null);
    setGeneratedSdk(null);
    setGenError('');
    setSdkError('');
    setEntriesModalLb(null);
    setConfigModalCfg(null);
    await updateBackend({ liveOpsEnabled: true, liveOpsMode: mode, v2Enabled: mode === 'v2' });
  }

  async function handleRotateSecret() {
    if (!window.confirm(td.siSecretRotateConfirm)) return;
    setError('');
    try {
      await rotateGameSecret(gameId);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateLeaderboard(e) {
    e.preventDefault();
    setError('');
    try {
      await createLeaderboard(gameId, {
        key: newLb.key.trim(),
        label: newLb.label,
        sort: newLb.sort,
        maxEntries: Number(newLb.maxEntries),
        scoreMin: newLb.scoreMin === '' ? null : Number(newLb.scoreMin),
        scoreMax: newLb.scoreMax === '' ? null : Number(newLb.scoreMax),
      });
      setNewLb({ key: '', label: '', sort: 'desc', maxEntries: 10, scoreMin: '', scoreMax: '' });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUpdateLeaderboard(lbId, fields) {
    setError('');
    try {
      await updateLeaderboard(gameId, lbId, fields);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteLeaderboard(lbId) {
    if (!window.confirm(td.siDeleteLeaderboardConfirm)) return;
    setError('');
    try {
      await deleteLeaderboard(gameId, lbId);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  const loadLegacyEntries = useCallback(async (lbId) => {
    try {
      const { entries } = await getLeaderboardEntries(gameId, lbId);
      setEntriesByLb((prev) => ({ ...prev, [lbId]: entries ?? [] }));
    } catch (err) {
      setError(err.message);
    }
  }, [gameId]);

  const loadScores = useCallback(async (lbId, page = 1) => {
    setScoresLoadingByLb((prev) => ({ ...prev, [lbId]: true }));
    try {
      const data = await getLeaderboardScores(gameId, lbId, page);
      setScoresByLb((prev) => ({ ...prev, [lbId]: pageInfo(data, page) }));
    } catch (err) {
      setError(err.message);
      setScoresByLb((prev) => ({ ...prev, [lbId]: pageInfo(null, page) }));
    } finally {
      setScoresLoadingByLb((prev) => ({ ...prev, [lbId]: false }));
    }
  }, [gameId]);

  async function handleOpenEntries(lb) {
    setEntriesModalLb(lb);
    const mode = getIntegrationMode(backend?.serverBackend);
    if (mode === 'legacy' && entriesByLb[lb._id] === undefined) loadLegacyEntries(lb._id);
    if (mode === 'v2' && scoresByLb[lb._id] === undefined) loadScores(lb._id, 1);
  }

  async function handleDeleteLegacyEntries(lbId) {
    if (!window.confirm(td.siV2DeleteLegacyConfirm)) return;
    setError('');
    try {
      await deleteLegacyLeaderboardEntries(gameId, lbId);
      await loadLegacyEntries(lbId);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteScore(lbId, scoreId) {
    setError('');
    try {
      await deleteLeaderboardScore(gameId, lbId, scoreId);
      const currentPage = scoresByLb[lbId]?.page ?? 1;
      await loadScores(lbId, currentPage);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteDevScores(lbId) {
    if (!window.confirm(td.siV2DeleteTestConfirm)) return;
    setError('');
    try {
      await deleteDevLeaderboardScores(gameId, lbId);
      await loadScores(lbId, scoresByLb[lbId]?.page ?? 1);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateConfig(e) {
    e.preventDefault();
    setError('');
    try {
      await createConfigKey(gameId, { key: newCfg.key.trim(), value: newCfg.value });
      setNewCfg({ key: '', value: '' });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUpdateConfig(cfgId, fields) {
    setError('');
    try {
      await updateConfigKey(gameId, cfgId, fields);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteConfig(cfgId) {
    setError('');
    try {
      await deleteConfigKey(gameId, cfgId);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleGenerateCode() {
    setGenError('');
    try {
      const data = await getGeneratedCode(gameId);
      setGenerated(data);
    } catch (err) {
      setGenError(err.message);
    }
  }

  async function handleGenerateSdk() {
    setSdkError('');
    try {
      const data = await getGeneratedSdk(gameId, lang);
      setGeneratedSdk(data);
    } catch (err) {
      setSdkError(err.message);
    }
  }

  async function handleIssueDevToken() {
    if (devToken && !window.confirm(td.siV2DevTokenReissueConfirm)) return;
    setDevTokenBusy(true);
    setSdkError('');
    try {
      const data = await issueV2DevToken(gameId);
      setDevToken(data);
    } catch (err) {
      setSdkError(err.message);
    } finally {
      setDevTokenBusy(false);
    }
  }

  async function handleCopyDevToken() {
    if (!devToken?.token) return;
    try {
      await navigator.clipboard.writeText(devToken.token);
      setSdkError('');
    } catch (err) {
      setSdkError(err.message);
    }
  }

  async function handleDeleteSave(saveId, isDev) {
    setError('');
    try {
      await deleteCloudSave(gameId, saveId, isDev);
      await loadCloudSaves(cloudSaves?.page ?? 1);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteDevSaves() {
    if (!window.confirm(td.siV2DeleteTestConfirm)) return;
    setError('');
    try {
      await deleteDevCloudSaves(gameId);
      await loadCloudSaves(cloudSaves?.page ?? 1);
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <div className="gd-section si-loading">Loading…</div>;
  if (!backend) return <div className="gd-section gd-error">{error}</div>;

  const serverBackend = backend.serverBackend ?? {};
  const leaderboards = backend.leaderboards ?? [];
  const config = backend.config ?? [];
  const liveOpsEnabled = resolveLiveOpsEnabled(serverBackend);
  const integrationMode = getIntegrationMode(serverBackend);

  return (
    <div className="gd-section si-shell">
      <div className="si-masthead">
        <div className="si-masthead-copy">
          <p className="si-overline">LIVEOPS / GAME SERVICES</p>
          <h2 className="si-page-title">{td.siPageTitle}</h2>
          <p className="si-intro">{td.siIntro}</p>
        </div>
        <label className={`si-master-card${liveOpsEnabled ? ' is-on' : ''}`}>
          <span className="si-master-copy">
            <strong>{td.siMasterToggle}</strong>
            <small>{liveOpsEnabled ? td.siMasterOn : td.siMasterOff}</small>
          </span>
          <input
            type="checkbox"
            checked={liveOpsEnabled}
            onChange={(e) => handleLiveOpsToggle(e.target.checked)}
            aria-label={td.siMasterToggle}
          />
          <span className="si-switch" aria-hidden="true"><span /></span>
        </label>
      </div>
      {error && <div className="gd-error">{error}</div>}

      {liveOpsEnabled && (
        <>
          <section className="si-mode-section" aria-labelledby="liveops-mode-title">
            <div className="si-section-number">01</div>
            <div className="si-mode-copy">
              <p className="si-overline">{td.siModeKicker}</p>
              <h2 id="liveops-mode-title">{td.siModeTitle}</h2>
              <p>{td.siModeDesc}</p>
            </div>
            <div className="si-mode-grid" role="radiogroup" aria-label={td.siModeTitle}>
              <label className={`si-mode-card${integrationMode === 'legacy' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="liveops-mode"
                  value="legacy"
                  checked={integrationMode === 'legacy'}
                  onChange={() => handleModeChange('legacy')}
                />
                <span className="si-mode-mark">V1</span>
                <span className="si-mode-card-copy">
                  <strong>{td.siLegacyTitle}</strong>
                  <small>{td.siLegacyDesc}</small>
                  <em>{td.siLegacyFiles}</em>
                </span>
              </label>
              <label className={`si-mode-card${integrationMode === 'v2' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="liveops-mode"
                  value="v2"
                  checked={integrationMode === 'v2'}
                  onChange={() => handleModeChange('v2')}
                />
                <span className="si-mode-mark is-v2">V2</span>
                <span className="si-mode-card-copy">
                  <strong>{td.siV2Title}</strong>
                  <small>{td.siV2ChoiceDesc}</small>
                  <em>{td.siV2Files}</em>
                </span>
              </label>
            </div>
          </section>

          <div className="si-content-divider" />

          {integrationMode === 'legacy' && (
            <div className="gd-subsection si-legacy-secret">
              <div className="si-subsection-heading">
                <div>
                  <p className="si-overline">{td.siLegacyTitle}</p>
                  <h3 className="gd-section-title">{td.siSecretTitle}</h3>
                </div>
                <span className="si-resource-badge">{td.siLegacyActive}</span>
              </div>
              <p className="gi-step-warn">{td.siSecurityNotice}</p>
              <p className="si-secret-preserved">{td.siSecretPreserved}</p>
              <div className="gd-upload-row">
                <input
                  type="text"
                  className="form-input"
                  readOnly
                  value={serverBackend.secret || td.siSecretNotProvisioned}
                  style={{ flex: 1, fontFamily: 'monospace' }}
                />
                <button className="btn btn-ghost" onClick={handleRotateSecret}>{td.siSecretRotate}</button>
              </div>
            </div>
          )}

      {/* Shared data definitions; the delivery path changes with the selected mode. */}
      <div className="gd-subsection si-data-subsection" style={{ marginTop: 24 }}>
        {integrationMode === 'legacy' ? (
          <label className="gd-upload-row">
            <input
              type="checkbox"
              checked={Boolean(serverBackend.leaderboardEnabled)}
              onChange={(e) => handleToggle('leaderboardEnabled', e.target.checked)}
            />
            <h3 className="gd-section-title" style={{ margin: 0 }}>{td.siLeaderboardTitle}</h3>
            <span>{td.siLeaderboardEnable}</span>
          </label>
        ) : (
          <div className="si-subsection-heading">
            <div>
              <p className="si-overline">{td.siV2Kicker}</p>
              <h3 className="gd-section-title">{td.siLeaderboardTitle}</h3>
              <p className="si-subsection-desc">{td.siV2ResourceDesc}</p>
            </div>
            <span className="si-resource-badge">{td.siV2Active}</span>
          </div>
        )}

        {leaderboards.length === 0 ? (
          <p className="gd-empty-text">{td.siLeaderboardEmpty}</p>
        ) : (
          <div className="gd-build-list">
            {leaderboards.map((lb) => (
              <div key={lb._id} className="gd-build-row">
                <div className="gd-build-meta">
                  <span className="gd-build-version">{lb.key}</span>
                  {lb.label && <span className="gd-build-date">{lb.label}</span>}
                  <span className="gd-build-date">{lb.sort === 'asc' ? td.siSortAsc : td.siSortDesc}</span>
                  <span className="gd-build-date">Top {lb.maxEntries}</span>
                  {(lb.scoreMin !== null || lb.scoreMax !== null) && (
                    <span className="gd-build-date">[{lb.scoreMin ?? '−∞'}, {lb.scoreMax ?? '+∞'}]</span>
                  )}
                </div>
                <div className="gd-build-actions">
                  <label className="si-inline-check">
                    <input
                      type="checkbox"
                      aria-label={td.siLeaderboardEnable}
                      checked={Boolean(lb.enabled)}
                      onChange={(e) => handleUpdateLeaderboard(lb._id, { enabled: e.target.checked })}
                    />
                  </label>
                  <button className="btn btn-ghost" onClick={() => handleOpenEntries(lb)}>{td.siEdit}</button>
                  <button className="btn btn-ghost gd-delete-btn" onClick={() => handleDeleteLeaderboard(lb._id)}>{td.siDeleteLeaderboard}</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <form className="gd-upload-form" onSubmit={handleCreateLeaderboard} style={{ marginTop: 12 }}>
          <div className="gd-upload-row">
            <input className="form-input" placeholder={td.siKey} value={newLb.key} onChange={(e) => setNewLb({ ...newLb, key: e.target.value })} />
            <input className="form-input" placeholder={td.siLabel} value={newLb.label} onChange={(e) => setNewLb({ ...newLb, label: e.target.value })} />
            <select className="form-input" value={newLb.sort} onChange={(e) => setNewLb({ ...newLb, sort: e.target.value })}>
              <option value="desc">{td.siSortDesc}</option>
              <option value="asc">{td.siSortAsc}</option>
            </select>
          </div>
          <div className="gd-upload-row">
            <input type="number" className="form-input gd-version-input" min="1" max="100" placeholder={td.siMaxEntries} value={newLb.maxEntries} onChange={(e) => setNewLb({ ...newLb, maxEntries: e.target.value })} />
            <input type="number" className="form-input gd-version-input" placeholder={td.siScoreMin} value={newLb.scoreMin} onChange={(e) => setNewLb({ ...newLb, scoreMin: e.target.value })} />
            <input type="number" className="form-input gd-version-input" placeholder={td.siScoreMax} value={newLb.scoreMax} onChange={(e) => setNewLb({ ...newLb, scoreMax: e.target.value })} />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!newLb.key.trim()}>{td.siLeaderboardAdd}</button>
          </div>
          <p className="gd-upload-hint">{td.siKeyHint}</p>
        </form>
      </div>

      <div className="gd-subsection si-data-subsection" style={{ marginTop: 24 }}>
        {integrationMode === 'legacy' ? (
          <label className="gd-upload-row">
            <input
              type="checkbox"
              aria-label={td.siConfigEnable}
              checked={Boolean(serverBackend.configEnabled)}
              onChange={(e) => handleToggle('configEnabled', e.target.checked)}
            />
            <h3 className="gd-section-title" style={{ margin: 0 }}>{td.siConfigTitle}</h3>
            <span>{td.siConfigEnable}</span>
          </label>
        ) : (
          <div className="si-subsection-heading">
            <div>
              <p className="si-overline">{td.siV2Kicker}</p>
              <h3 className="gd-section-title">{td.siConfigTitle}</h3>
              <p className="si-subsection-desc">{td.siV2ResourceDesc}</p>
            </div>
            <span className="si-resource-badge">{td.siV2Active}</span>
          </div>
        )}

        {config.length === 0 ? (
          <p className="gd-empty-text">{td.siConfigEmpty}</p>
        ) : (
          <div className="gd-build-list">
            {config.map((cfg) => (
              <div key={cfg._id} className="gd-build-row">
                <div className="gd-build-meta">
                  <span className="gd-build-version">{cfg.key}</span>
                  <span className="si-config-preview" title={cfg.value}>{cfg.value}</span>
                </div>
                <div className="gd-build-actions">
                  <label className="si-inline-check">
                    <input type="checkbox" checked={Boolean(cfg.enabled)} onChange={(e) => handleUpdateConfig(cfg._id, { enabled: e.target.checked })} />
                  </label>
                  <button className="btn btn-ghost" onClick={() => setConfigModalCfg(cfg)}>{td.siEdit}</button>
                  <button className="btn btn-ghost gd-delete-btn" onClick={() => handleDeleteConfig(cfg._id)}>{td.siConfigDelete}</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <form className="gd-upload-form" onSubmit={handleCreateConfig} style={{ marginTop: 12 }}>
          <div className="gd-upload-row">
            <input className="form-input" placeholder={td.siKey} value={newCfg.key} onChange={(e) => setNewCfg({ ...newCfg, key: e.target.value })} />
            <input className="form-input" placeholder={td.siConfigValue} value={newCfg.value} onChange={(e) => setNewCfg({ ...newCfg, value: e.target.value })} style={{ flex: 1, fontFamily: 'monospace' }} />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!newCfg.key.trim() || !newCfg.value.trim()}>{td.siConfigAdd}</button>
          </div>
          <p className="gd-upload-hint">{td.siConfigValueHint}</p>
        </form>
      </div>

      {integrationMode === 'legacy' && (
        <div className="gd-subsection si-generated-section" style={{ marginTop: 24 }}>
          <div className="si-subsection-heading">
            <div>
              <p className="si-overline">{td.siLegacyTitle}</p>
              <h3 className="gd-section-title">{td.siGeneratedCodeTitle}</h3>
              <p className="si-subsection-desc">{td.siLegacyGeneratedDesc}</p>
            </div>
            <button className="btn btn-ghost" onClick={handleGenerateCode}>{td.siGeneratedCodeGenerate}</button>
          </div>
          {genError && <div className="gd-error">{genError}</div>}
          {generated && (
            <>
              {(generated.files ?? []).map((file) => <CodeBlock key={file.filename} filename={file.filename} code={file.code} />)}
              <h3 className="gd-section-title" style={{ marginTop: 16 }}>{td.siGuideTitle}</h3>
              {(generated.docs ?? []).map((doc, index) => (
                <div key={index} className="gi-step">
                  <h4>{doc.title}</h4>
                  <p className="gi-step-desc">{doc.body}</p>
                  {doc.snippet && <CodeBlock filename={`example-${index}.cs`} code={doc.snippet} />}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* SDK v2 delivery and signed-in player services */}
      {integrationMode === 'v2' && (
        <div className="si-v2-panel" style={{ marginTop: 32 }}>
        <div className="si-v2-heading">
          <div>
            <p className="si-v2-kicker">{td.siV2Kicker}</p>
            <h2 className="gd-section-title">{td.siV2Title}</h2>
            <p className="si-v2-intro">{td.siV2Intro}</p>
          </div>
          <span className="si-v2-status is-on">
            {td.siV2On}
          </span>
        </div>

        <div className="si-v2-toggle-grid">
          <label className="si-v2-toggle-card">
            <input type="checkbox" checked={Boolean(serverBackend.cloudSaveEnabled)} onChange={(e) => handleToggle('cloudSaveEnabled', e.target.checked)} />
            <span>
              <strong>{td.siV2CloudSaveEnabled}</strong>
              <small>{td.siV2CloudSaveEnabledDesc}</small>
            </span>
          </label>
        </div>

        <div className="si-v2-warning">{td.siV2ModeNotice}</div>

        <div className="si-v2-block">
          <div className="si-v2-block-heading">
            <div>
              <h3>{td.siV2GeneratedTitle}</h3>
              <p>{td.siV2GeneratedDesc}</p>
            </div>
            <button className="btn btn-ghost" onClick={handleGenerateSdk}>{td.siV2GeneratedRefresh}</button>
          </div>
          {sdkError && <div className="gd-error">{sdkError}</div>}
          {generatedSdk && (
            <>
              <div className="si-sdk-files">
                {(generatedSdk.files ?? []).map((file) => <CodeBlock key={file.filename} filename={file.filename} code={file.code} defaultOpen={false} />)}
              </div>
              <div className="si-v2-docs">
                {(generatedSdk.docs ?? []).map((doc, index) => (
                  <details className="si-v2-doc" key={`${doc.title}-${index}`} open={index === 0}>
                    <summary>{doc.title}</summary>
                    <p>{doc.body}</p>
                    {doc.snippet && <CodeBlock filename={`sdk-example-${index}.cs`} code={doc.snippet} />}
                  </details>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="si-v2-block si-dev-token-block">
          <div className="si-v2-block-heading">
            <div>
              <h3>{td.siV2DevTokenTitle}</h3>
              <p>{td.siV2DevTokenDesc}</p>
            </div>
            <button className="btn btn-primary" onClick={handleIssueDevToken} disabled={devTokenBusy}>
              {devTokenBusy ? td.siV2DevTokenWorking : (devToken ? td.siV2DevTokenReissue : td.siV2DevTokenIssue)}
            </button>
          </div>
          {devToken ? (
            <div className="si-dev-token-value">
              <div className="si-dev-token-input-row">
                <input className="form-input" readOnly value={devToken.token ?? ''} aria-label={td.siV2DevTokenTitle} />
                <button className="btn btn-ghost" onClick={handleCopyDevToken}>{td.siV2DevTokenCopy}</button>
              </div>
              <p className="si-dev-token-expiry">{td.siV2DevTokenExpires}: {formatDate(devToken.expiresAt)}</p>
            </div>
          ) : (
            <p className="si-v2-empty-note">{td.siV2DevTokenEmpty}</p>
          )}
          <ol className="si-dev-token-guide">
            <li>{td.siV2DevTokenGuide1}</li>
            <li>{td.siV2DevTokenGuide2}</li>
            <li>{td.siV2DevTokenGuide3}</li>
          </ol>
        </div>

        {serverBackend.cloudSaveEnabled && (
          <div className="si-v2-block">
            <div className="si-v2-block-heading">
              <div>
                <h3>{td.siV2CloudSavesTitle}</h3>
                <p>{td.siV2CloudSavesDesc}</p>
              </div>
              <div className="si-v2-actions">
                <button className="btn btn-ghost" onClick={() => loadCloudSaves(cloudSaves?.page ?? 1)}>{td.siV2Refresh}</button>
                <button className="btn btn-ghost gd-delete-btn" onClick={handleDeleteDevSaves}>{td.siV2DeleteTestRecords}</button>
              </div>
            </div>
            {cloudSavesLoading ? (
              <p className="si-v2-empty-note">{td.siV2Loading}</p>
            ) : cloudSaves?.rows?.length ? (
              <>
                <div className="si-table-wrap">
                  <table className="si-table si-v2-table">
                    <thead><tr><th>{td.siV2CloudSaveSlot}</th><th>{td.siV2CloudSaveSize}</th><th>{td.siV2CloudSaveRevision}</th><th>{td.siV2CloudSaveUpdated}</th><th>{td.siV2CloudSaveActions}</th></tr></thead>
                    <tbody>
                      {cloudSaves.rows.map((save) => (
                        <tr key={save._id}>
                          <td><strong>{save.slot}</strong>{save.isDev && <span className="si-test-badge">{td.siV2TestBadge}</span>}</td>
                          <td>{save.size ?? 0} B</td>
                          <td>{save.rev ?? '—'}</td>
                          <td>{formatDate(save.updatedAt)}</td>
                          <td><button className="btn btn-ghost gd-delete-btn" onClick={() => handleDeleteSave(save._id, save.isDev)}>{td.siV2CloudSaveDelete}</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination data={cloudSaves} onChange={loadCloudSaves} td={td} />
              </>
            ) : (
              <p className="si-v2-empty-note">{td.siV2CloudSavesEmpty}</p>
            )}
          </div>
         )}
        </div>
      )}
       </>
      )}

      {liveOpsEnabled && entriesModalLb && (
        <LeaderboardEntriesModal
          lb={entriesModalLb}
          entries={entriesByLb[entriesModalLb._id]}
          v2Enabled={integrationMode === 'v2'}
          v2Data={scoresByLb[entriesModalLb._id]}
          v2Loading={Boolean(scoresLoadingByLb[entriesModalLb._id])}
          td={td}
          onClose={() => setEntriesModalLb(null)}
          onLoadScores={loadScores}
          onDeleteScore={handleDeleteScore}
          onDeleteDevScores={handleDeleteDevScores}
          onDeleteLegacyEntries={handleDeleteLegacyEntries}
        />
      )}

      {liveOpsEnabled && configModalCfg && (
        <Suspense
          fallback={<Modal title={`${configModalCfg.key} · ${td.siEdit}`} onClose={() => setConfigModalCfg(null)} wide><p className="gd-empty-text">{td.loading}</p></Modal>}
        >
          <ConfigEditModal cfg={configModalCfg} td={td} onClose={() => setConfigModalCfg(null)} onSave={handleUpdateConfig} />
        </Suspense>
      )}
    </div>
  );
}

function Pagination({ data, onChange, td }) {
  if (!data || data.pages <= 1) return null;
  return (
    <div className="si-pagination" aria-label={td.siV2Pagination}>
      <button className="btn btn-ghost" disabled={data.page <= 1} onClick={() => onChange(data.page - 1)}>{td.siV2Previous}</button>
      <span>{data.page} / {data.pages}</span>
      <button className="btn btn-ghost" disabled={data.page >= data.pages} onClick={() => onChange(data.page + 1)}>{td.siV2Next}</button>
    </div>
  );
}

function LeaderboardEntriesModal({
  lb,
  entries,
  v2Enabled,
  v2Data,
  v2Loading,
  td,
  onClose,
  onLoadScores,
  onDeleteScore,
  onDeleteDevScores,
  onDeleteLegacyEntries,
}) {
  const showV2 = v2Enabled;
  const showLegacy = Array.isArray(entries) && entries.length > 0;
  const [tab, setTab] = useState(showV2 ? 'v2' : 'legacy');
  const [search, setSearch] = useState('');
  const [scoreMin, setScoreMin] = useState('');
  const [scoreMax, setScoreMax] = useState('');
  const [sortField, setSortField] = useState('score');
  const [sortDir, setSortDir] = useState(lb.sort === 'asc' ? 'asc' : 'desc');

  useEffect(() => {
    if (tab === 'v2' && showV2 && !v2Data && !v2Loading) onLoadScores(lb._id, 1);
    if (tab === 'legacy' && !showLegacy && showV2) setTab('v2');
  }, [tab, showV2, showLegacy, v2Data, v2Loading, onLoadScores, lb._id]);

  const legacyRows = useMemo(() => {
    let list = entries ?? [];
    const query = search.trim().toLowerCase();
    if (query) list = list.filter((entry) => String(entry.name ?? '').toLowerCase().includes(query));
    if (scoreMin !== '') list = list.filter((entry) => entry.score >= Number(scoreMin));
    if (scoreMax !== '') list = list.filter((entry) => entry.score <= Number(scoreMax));
    return [...list].sort((a, b) => {
      let av = a[sortField];
      let bv = b[sortField];
      if (sortField === 'createdAt') { av = new Date(av).getTime(); bv = new Date(bv).getTime(); }
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [entries, search, scoreMin, scoreMax, sortField, sortDir]);

  function toggleSort(field) {
    if (sortField === field) setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('desc'); }
  }

  function sortIndicator(field) {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  const title = `${lb.key}${lb.label ? ` · ${lb.label}` : ''} · ${td.siEntries}`;
  const v2Rows = v2Data?.rows ?? [];
  const v2Page = v2Data?.page ?? 1;
  const v2Pages = v2Data?.pages ?? 1;
  const v2Limit = (v2Data?.limit ?? v2Rows.length) || 1;

  return (
    <Modal title={title} onClose={onClose} wide>
      {(showV2 || showLegacy) && (
        <div className="si-modal-tabs" role="tablist">
          {showV2 && <button role="tab" aria-selected={tab === 'v2'} className={`si-modal-tab${tab === 'v2' ? ' active' : ''}`} onClick={() => setTab('v2')}>{td.siV2ScoresTab}</button>}
          {showLegacy && <button role="tab" aria-selected={tab === 'legacy'} className={`si-modal-tab${tab === 'legacy' ? ' active' : ''}`} onClick={() => setTab('legacy')}>{td.siV2LegacyTab}</button>}
        </div>
      )}

      {tab === 'v2' && showV2 ? (
        <div className="si-v2-modal-panel">
          <div className="si-entries-toolbar">
            <span className="si-modal-context">{td.siV2ScoresDesc}</span>
            <button className="btn btn-ghost gd-delete-btn" onClick={() => onDeleteDevScores(lb._id)}>{td.siV2DeleteTestRecords}</button>
          </div>
          {v2Loading ? <p className="gd-empty-text">{td.siV2Loading}</p> : v2Rows.length === 0 ? <p className="gd-empty-text">{td.siV2NoScores}</p> : (
            <>
              <div className="si-table-wrap">
                <table className="si-table si-v2-table">
                  <thead><tr><th>{td.siV2ScoreColRank}</th><th>{td.siV2ScoreColName}</th><th>{td.siV2ScoreColScore}</th><th>{td.siV2ScoreColPlays}</th><th>{td.siV2ScoreColDate}</th><th>{td.siV2ScoreColActions}</th></tr></thead>
                  <tbody>
                    {v2Rows.map((score, index) => (
                      <tr key={score._id}>
                        <td>{score.rank ?? ((v2Page - 1) * v2Limit) + index + 1}</td>
                        <td><strong>{score.displayName ?? score.name ?? '—'}</strong>{score.isDev && <span className="si-test-badge">{td.siV2TestBadge}</span>}</td>
                        <td>{score.score}</td>
                        <td>{score.playCount ?? 0}</td>
                        <td>{formatDate(score.updatedAt ?? score.bestAt ?? score.createdAt)}</td>
                        <td><button className="btn btn-ghost gd-delete-btn" onClick={() => onDeleteScore(lb._id, score._id)}>{td.siV2DeleteScore}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="si-pagination" aria-label={td.siV2Pagination}>
                <button className="btn btn-ghost" disabled={v2Page <= 1} onClick={() => onLoadScores(lb._id, v2Page - 1)}>{td.siV2Previous}</button>
                <span>{v2Page} / {v2Pages}</span>
                <button className="btn btn-ghost" disabled={v2Page >= v2Pages} onClick={() => onLoadScores(lb._id, v2Page + 1)}>{td.siV2Next}</button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="si-legacy-modal-panel">
          <div className="si-entries-toolbar">
            <input className="form-input" placeholder={td.siEntriesSearchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1 }} />
            <input type="number" className="form-input si-entries-filter" placeholder={td.siEntriesFilterScoreMin} value={scoreMin} onChange={(e) => setScoreMin(e.target.value)} />
            <input type="number" className="form-input si-entries-filter" placeholder={td.siEntriesFilterScoreMax} value={scoreMax} onChange={(e) => setScoreMax(e.target.value)} />
            {showLegacy && <button className="btn btn-ghost gd-delete-btn" onClick={() => onDeleteLegacyEntries(lb._id)}>{td.siV2DeleteLegacy}</button>}
          </div>
          {entries === undefined ? <p className="gd-empty-text">{td.siV2Loading}</p> : legacyRows.length === 0 ? <p className="gd-empty-text">{entries.length === 0 ? td.siNoEntries : td.siEntriesNoResults}</p> : (
            <>
              <div className="si-table-wrap">
                <table className="si-table">
                  <thead><tr><th>{td.siEntriesColRank}</th><th className="si-sortable" onClick={() => toggleSort('name')}>{td.siEntriesColName}{sortIndicator('name')}</th><th className="si-sortable" onClick={() => toggleSort('score')}>{td.siEntriesColScore}{sortIndicator('score')}</th><th>{td.siEntriesColMeta}</th><th className="si-sortable" onClick={() => toggleSort('createdAt')}>{td.siEntriesColDate}{sortIndicator('createdAt')}</th></tr></thead>
                  <tbody>
                    {legacyRows.map((entry, index) => (
                      <tr key={entry._id}>
                        <td>{index + 1}</td>
                        <td>{entry.name}</td>
                        <td>{entry.score}</td>
                        <td className="si-table-meta" title={entry.meta ? JSON.stringify(entry.meta) : ''}>{entry.meta ? JSON.stringify(entry.meta) : '—'}</td>
                        <td>{formatDate(entry.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="si-entries-count">{legacyRows.length} / {entries.length} {td.siEntriesCountLabel}</p>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
