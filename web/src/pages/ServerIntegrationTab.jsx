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
  createLeaderboard,
  updateLeaderboard,
  deleteLeaderboard,
  getLeaderboardEntries,
  deleteLeaderboardEntry,
  createConfigKey,
  updateConfigKey,
  deleteConfigKey,
} from '../api.js';

export default function ServerIntegrationTab({ gameId }) {
  const { t } = useI18n();
  const td = t.gameDetail;

  const [backend, setBackend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [entriesByLb, setEntriesByLb] = useState({});
  const [entriesModalLb, setEntriesModalLb] = useState(null);
  const [configModalCfg, setConfigModalCfg] = useState(null);
  const [generated, setGenerated] = useState(null);
  const [genError, setGenError] = useState('');

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

  async function handleToggle(field, value) {
    setError('');
    try {
      await updateGameBackend(gameId, { [field]: value });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
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

  async function handleOpenEntries(lb) {
    setEntriesModalLb(lb);
    if (!entriesByLb[lb._id]) {
      try {
        const { entries } = await getLeaderboardEntries(gameId, lb._id);
        setEntriesByLb((prev) => ({ ...prev, [lb._id]: entries }));
      } catch (err) {
        setError(err.message);
      }
    }
  }

  async function handleDeleteEntry(lbId, entryId) {
    setError('');
    try {
      await deleteLeaderboardEntry(gameId, lbId, entryId);
      const { entries } = await getLeaderboardEntries(gameId, lbId);
      setEntriesByLb((prev) => ({ ...prev, [lbId]: entries }));
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

  if (loading) return <div className="gd-section">…</div>;
  if (!backend) return <div className="gd-section gd-error">{error}</div>;

  const { serverBackend, leaderboards, config } = backend;

  return (
    <div className="gd-section">
      <p className="gi-intro">{td.siIntro}</p>
      {error && <div className="gd-error">{error}</div>}

      {/* Secret */}
      <div className="gd-subsection">
        <h3 className="gd-section-title">{td.siSecretTitle}</h3>
        <p className="gi-step-warn">{td.siSecurityNotice}</p>
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

      {/* Leaderboards */}
      <div className="gd-subsection" style={{ marginTop: 24 }}>
        <label className="gd-upload-row">
          <input
            type="checkbox"
            checked={serverBackend.leaderboardEnabled}
            onChange={(e) => handleToggle('leaderboardEnabled', e.target.checked)}
          />
          <h3 className="gd-section-title" style={{ margin: 0 }}>{td.siLeaderboardTitle}</h3>
          <span>{td.siLeaderboardEnable}</span>
        </label>

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
                    <span className="gd-build-date">[{lb.scoreMin ?? '-∞'}, {lb.scoreMax ?? '+∞'}]</span>
                  )}
                </div>
                <div className="gd-build-actions">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={lb.enabled}
                      onChange={(e) => handleUpdateLeaderboard(lb._id, { enabled: e.target.checked })}
                    />
                  </label>
                  <button className="btn btn-ghost" onClick={() => handleOpenEntries(lb)}>
                    {td.siEdit}
                  </button>
                  <button className="btn btn-ghost gd-delete-btn" onClick={() => handleDeleteLeaderboard(lb._id)}>
                    {td.siDeleteLeaderboard}
                  </button>
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

      {/* Config */}
      <div className="gd-subsection" style={{ marginTop: 24 }}>
        <label className="gd-upload-row">
          <input
            type="checkbox"
            checked={serverBackend.configEnabled}
            onChange={(e) => handleToggle('configEnabled', e.target.checked)}
          />
          <h3 className="gd-section-title" style={{ margin: 0 }}>{td.siConfigTitle}</h3>
          <span>{td.siConfigEnable}</span>
        </label>

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
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={cfg.enabled}
                      onChange={(e) => handleUpdateConfig(cfg._id, { enabled: e.target.checked })}
                    />
                  </label>
                  <button className="btn btn-ghost" onClick={() => setConfigModalCfg(cfg)}>
                    {td.siEdit}
                  </button>
                  <button className="btn btn-ghost gd-delete-btn" onClick={() => handleDeleteConfig(cfg._id)}>
                    {td.siConfigDelete}
                  </button>
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

      {/* Generated code */}
      <div className="gd-subsection" style={{ marginTop: 24 }}>
        <h3 className="gd-section-title">{td.siGeneratedCodeTitle}</h3>
        <button className="btn btn-ghost" onClick={handleGenerateCode}>{td.siGeneratedCodeRefresh}</button>
        {genError && <div className="gd-error">{genError}</div>}
        {generated && (
          <>
            {generated.files.map((f) => (
              <CodeBlock key={f.filename} filename={f.filename} code={f.code} />
            ))}
            <h3 className="gd-section-title" style={{ marginTop: 16 }}>{td.siGuideTitle}</h3>
            {generated.docs.map((doc, i) => (
              <div key={i} className="gi-step">
                <h4>{doc.title}</h4>
                <p className="gi-step-desc">{doc.body}</p>
                {doc.snippet && <CodeBlock filename={`example-${i}.cs`} code={doc.snippet} />}
              </div>
            ))}
          </>
        )}
      </div>

      {entriesModalLb && (
        <LeaderboardEntriesModal
          lb={entriesModalLb}
          entries={entriesByLb[entriesModalLb._id]}
          td={td}
          onClose={() => setEntriesModalLb(null)}
          onDeleteEntry={handleDeleteEntry}
        />
      )}

      {configModalCfg && (
        <Suspense
          fallback={(
            <Modal title={`${configModalCfg.key} · ${td.siEdit}`} onClose={() => setConfigModalCfg(null)} wide>
              <p className="gd-empty-text">…</p>
            </Modal>
          )}
        >
          <ConfigEditModal
            cfg={configModalCfg}
            td={td}
            onClose={() => setConfigModalCfg(null)}
            onSave={handleUpdateConfig}
          />
        </Suspense>
      )}
    </div>
  );
}

// ── Leaderboard entries: search / sort / filter table modal ───────────────────

function LeaderboardEntriesModal({ lb, entries, td, onClose, onDeleteEntry }) {
  const [search, setSearch] = useState('');
  const [scoreMin, setScoreMin] = useState('');
  const [scoreMax, setScoreMax] = useState('');
  const [sortField, setSortField] = useState('score');
  const [sortDir, setSortDir] = useState(lb.sort === 'asc' ? 'asc' : 'desc');

  const rows = useMemo(() => {
    let list = entries ?? [];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q));
    if (scoreMin !== '') list = list.filter((e) => e.score >= Number(scoreMin));
    if (scoreMax !== '') list = list.filter((e) => e.score <= Number(scoreMax));
    list = [...list].sort((a, b) => {
      let av = a[sortField];
      let bv = b[sortField];
      if (sortField === 'createdAt') { av = new Date(av).getTime(); bv = new Date(bv).getTime(); }
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [entries, search, scoreMin, scoreMax, sortField, sortDir]);

  function toggleSort(field) {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('desc'); }
  }

  function sortIndicator(field) {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  const title = `${lb.key}${lb.label ? ` — ${lb.label}` : ''} · ${td.siEntries}`;

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="si-entries-toolbar">
        <input
          className="form-input"
          placeholder={td.siEntriesSearchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        <input type="number" className="form-input si-entries-filter" placeholder={td.siEntriesFilterScoreMin} value={scoreMin} onChange={(e) => setScoreMin(e.target.value)} />
        <input type="number" className="form-input si-entries-filter" placeholder={td.siEntriesFilterScoreMax} value={scoreMax} onChange={(e) => setScoreMax(e.target.value)} />
      </div>

      {entries === undefined ? (
        <p className="gd-empty-text">…</p>
      ) : rows.length === 0 ? (
        <p className="gd-empty-text">{entries.length === 0 ? td.siNoEntries : td.siEntriesNoResults}</p>
      ) : (
        <>
          <div className="si-table-wrap">
            <table className="si-table">
              <thead>
                <tr>
                  <th>{td.siEntriesColRank}</th>
                  <th className="si-sortable" onClick={() => toggleSort('name')}>{td.siEntriesColName}{sortIndicator('name')}</th>
                  <th className="si-sortable" onClick={() => toggleSort('score')}>{td.siEntriesColScore}{sortIndicator('score')}</th>
                  <th>{td.siEntriesColMeta}</th>
                  <th className="si-sortable" onClick={() => toggleSort('createdAt')}>{td.siEntriesColDate}{sortIndicator('createdAt')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry, i) => (
                  <tr key={entry._id}>
                    <td>{i + 1}</td>
                    <td>{entry.name}</td>
                    <td>{entry.score}</td>
                    <td className="si-table-meta" title={entry.meta ? JSON.stringify(entry.meta) : ''}>
                      {entry.meta ? JSON.stringify(entry.meta) : '—'}
                    </td>
                    <td>{new Date(entry.createdAt).toLocaleString()}</td>
                    <td>
                      <button className="btn btn-ghost gd-delete-btn" onClick={() => onDeleteEntry(lb._id, entry._id)}>{td.siDeleteEntry}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="si-entries-count">{rows.length} / {entries.length} {td.siEntriesCountLabel}</p>
        </>
      )}
    </Modal>
  );
}

