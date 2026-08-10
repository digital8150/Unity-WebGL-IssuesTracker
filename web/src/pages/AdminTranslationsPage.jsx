import React, { useEffect, useMemo, useRef, useState } from 'react';
import DashSidebar from '../components/DashSidebar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { usePageNavigate } from '../hooks/usePageTransition.js';
import { useI18n } from '../i18n.jsx';
import {
  backfillTranslations,
  getTranslationSettings,
  getTranslationStatus,
  listTranslationModels,
  retryTranslation,
  updateTranslationSettings,
  validateGeminiKey,
} from '../api.js';
import './DashboardPage.css';
import './AdminTranslationsPage.css';

const POLL_INTERVAL_MS = 12000;
const QUEUE_STATUSES = ['pending', 'translating', 'ready', 'stale', 'failed'];

const EMPTY_TRANSLATION = {
  enabled: false,
  publishEnabled: false,
  modelChain: [],
  targetLocales: ['en'],
  promptVersion: 'v1',
  maxChunkChars: 12000,
  dailyRequestCap: 0,
};

function quotaRows(status) {
  return Array.isArray(status?.quotas) ? status.quotas : [];
}

export default function AdminTranslationsPage() {
  const { user: me, logout } = useAuth();
  const { t } = useI18n();
  const navigate = usePageNavigate();
  const copy = t.admin.translations;
  const mountedRef = useRef(false);
  const requestInFlightRef = useRef(false);

  const [settings, setSettings] = useState(null);
  const [translation, setTranslation] = useState(EMPTY_TRANSLATION);
  const [models, setModels] = useState([]);
  const [status, setStatus] = useState(null);
  const [failed, setFailed] = useState([]);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [backfillConfirm, setBackfillConfirm] = useState(false);
  const [expandedError, setExpandedError] = useState(null);

  function applyStatus(nextStatus) {
    if (!mountedRef.current) return;
    setStatus(nextStatus);
    setFailed(Array.isArray(nextStatus?.failed) ? nextStatus.failed : []);
  }

  async function refresh({ manual = false } = {}) {
    if (requestInFlightRef.current) return;

    requestInFlightRef.current = true;
    if (manual) setBusy('refresh');
    else setLoading(true);
    setError('');

    try {
      const [nextSettings, nextStatus] = await Promise.all([
        getTranslationSettings(),
        getTranslationStatus(),
      ]);
      let nextModels = [];

      if (nextSettings.configured) {
        try {
          nextModels = (await listTranslationModels()).models || [];
        } catch {
          nextModels = [];
        }
      }

      if (!mountedRef.current) return;
      setSettings(nextSettings);
      setTranslation({ ...EMPTY_TRANSLATION, ...(nextSettings.translation || {}) });
      setModels(nextModels);
      applyStatus(nextStatus);
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      requestInFlightRef.current = false;
      if (mountedRef.current) {
        if (manual) setBusy('');
        else setLoading(false);
      }
    }
  }

  async function refreshStatus() {
    if (requestInFlightRef.current || document.visibilityState === 'hidden') return;

    requestInFlightRef.current = true;
    try {
      applyStatus(await getTranslationStatus());
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      requestInFlightRef.current = false;
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    refresh();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshStatus();
    }, POLL_INTERVAL_MS);

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') refreshStatus();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

  function updateChain(index, field, value) {
    setTranslation((current) => ({
      ...current,
      modelChain: current.modelChain.map((entry, entryIndex) => (
        entryIndex === index
          ? { ...entry, [field]: field === 'enabled' ? value : Number(value) || 0 }
          : entry
      )),
    }));
  }

  function addModel(model) {
    if (!model || translation.modelChain.some((entry) => entry.model === model)) return;
    setTranslation((current) => ({
      ...current,
      modelChain: [
        ...current.modelChain,
        { model, rpd: 0, rpm: 0, enabled: true },
      ],
    }));
  }

  function moveModel(index, direction) {
    const next = index + direction;
    if (next < 0 || next >= translation.modelChain.length) return;

    setTranslation((current) => {
      const chain = [...current.modelChain];
      [chain[index], chain[next]] = [chain[next], chain[index]];
      return { ...current, modelChain: chain };
    });
  }

  async function saveSettings() {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setBusy('save');
    setMessage('');
    setError('');

    try {
      const result = await updateTranslationSettings({
        ...(apiKey ? { geminiApiKey: apiKey } : {}),
        translation,
      });
      if (!mountedRef.current) return;
      setSettings(result);
      setApiKey('');
      setMessage(copy.settingsSaved);
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      requestInFlightRef.current = false;
      if (mountedRef.current) setBusy('');
    }
  }

  async function testConnection() {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setBusy('test');
    setMessage('');
    setError('');

    try {
      const result = await validateGeminiKey(apiKey);
      if (!mountedRef.current) return;
      setModels(result.models || []);
      setMessage(copy.modelsReturned.replace('{count}', String(result.models?.length || 0)));
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      requestInFlightRef.current = false;
      if (mountedRef.current) setBusy('');
    }
  }

  async function runBackfill() {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setBusy('backfill');
    setMessage('');
    setError('');

    try {
      const result = await backfillTranslations({});
      const latest = await getTranslationStatus();
      if (!mountedRef.current) return;
      setBackfillConfirm(false);
      setMessage(copy.jobsQueued.replace('{count}', String(result.count || 0)));
      applyStatus(latest);
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      requestInFlightRef.current = false;
      if (mountedRef.current) setBusy('');
    }
  }

  async function retryFailed(row) {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setBusy(`retry-${row.refId}`);
    setError('');

    try {
      await retryTranslation(row.refType, row.refId);
      const latest = await getTranslationStatus();
      if (!mountedRef.current) return;
      setExpandedError(null);
      applyStatus(latest);
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      requestInFlightRef.current = false;
      if (mountedRef.current) setBusy('');
    }
  }

  const counts = useMemo(() => status?.counts || [], [status]);
  const failedCount = counts
    .filter((row) => row.status === 'failed')
    .reduce((sum, row) => sum + row.count, 0);
  const selectedModels = new Set(translation.modelChain.map((entry) => entry.model));
  const source = settings?.source || 'missing';

  return (
    <div className="dash-layout admin-translations-page">
      <DashSidebar user={me} active="translations" onLogout={handleLogout} />

      <main className="dash-main admin-translations-main">
        <header className="dash-header admin-translations-header">
          <div>
            <p className="translation-kicker">{copy.kicker}</p>
            <h1 className="dash-page-title">{copy.title}</h1>
            <p className="dash-page-sub">{copy.subtitle}</p>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={saveSettings}
            disabled={busy !== '' || loading}
          >
            {busy === 'save' ? copy.saving : copy.save}
          </button>
        </header>

        {loading && <p className="dash-loading">{copy.loading}</p>}
        {error && <div className="translation-alert translation-alert-error">{error}</div>}
        {message && <div className="translation-alert translation-alert-success">{message}</div>}

        {!loading && (
          <div className="translation-console">
            <section className="translation-panel translation-key-panel">
              <div className="translation-panel-heading">
                <div>
                  <p className="translation-kicker">{copy.credentialKicker}</p>
                  <h2>{copy.apiKeyTitle}</h2>
                </div>
                <span className={`translation-source-badge ${source}`}>
                  {copy.sources[source] || copy.sources.missing}
                </span>
              </div>
              <p className="translation-muted">
                {copy.apiKeyHintBefore} <code>{copy.selectFalse}</code> {copy.apiKeyHintAfter}
              </p>
              <div className="translation-key-row">
                <input
                  className="form-input"
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={settings?.configured
                    ? `${copy.apiKeyPrefix}${copy.maskedKey}${settings.last4 || copy.maskedKey}`
                    : copy.apiKeyPlaceholder}
                  autoComplete="new-password"
                />
                <button
                  className="btn btn-ghost"
                  onClick={testConnection}
                  disabled={busy !== ''}
                >
                  {busy === 'test' ? copy.testing : copy.testConnection}
                </button>
              </div>
            </section>

            <section className="translation-panel translation-chain-panel">
              <div className="translation-panel-heading">
                <div>
                  <p className="translation-kicker">{copy.chainKicker}</p>
                  <h2>{copy.modelChainTitle}</h2>
                </div>
                <select
                  className="form-input translation-model-picker"
                  value=""
                  onChange={(event) => addModel(event.target.value)}
                  disabled={busy !== ''}
                >
                  <option value="">{copy.addModel}</option>
                  {models
                    .filter((model) => !selectedModels.has(model.name))
                    .map((model) => (
                      <option key={model.name} value={model.name}>
                        {model.name}
                      </option>
                    ))}
                </select>
              </div>
              <p className="translation-muted">{copy.modelChainHint}</p>
              <div className="translation-chain-list">
                {translation.modelChain.length === 0 && (
                  <div className="translation-empty">{copy.modelChainEmpty}</div>
                )}
                {translation.modelChain.map((entry, index) => (
                  <div className="translation-chain-row" key={entry.model}>
                    <div className="translation-chain-order">
                      <button
                        type="button"
                        aria-label={copy.moveUp}
                        onClick={() => moveModel(index, -1)}
                        disabled={index === 0 || busy !== ''}
                      >
                        {copy.moveUpIcon}
                      </button>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <button
                        type="button"
                        aria-label={copy.moveDown}
                        onClick={() => moveModel(index, 1)}
                        disabled={index === translation.modelChain.length - 1 || busy !== ''}
                      >
                        {copy.moveDownIcon}
                      </button>
                    </div>
                    <strong>{entry.model}</strong>
                    <label>
                      <span>{copy.rpd}</span>
                      <input
                        className="form-input quota-input"
                        type="number"
                        min="0"
                        value={entry.rpd}
                        onChange={(event) => updateChain(index, 'rpd', event.target.value)}
                        disabled={busy !== ''}
                      />
                    </label>
                    <label>
                      <span>{copy.rpm}</span>
                      <input
                        className="form-input quota-input"
                        type="number"
                        min="0"
                        value={entry.rpm}
                        onChange={(event) => updateChain(index, 'rpm', event.target.value)}
                        disabled={busy !== ''}
                      />
                    </label>
                    <label className="translation-enabled">
                      <input
                        type="checkbox"
                        checked={entry.enabled !== false}
                        onChange={(event) => updateChain(index, 'enabled', event.target.checked)}
                        disabled={busy !== ''}
                      />
                      <span>{copy.enabled}</span>
                    </label>
                  </div>
                ))}
              </div>
            </section>

            <section className="translation-panel translation-quota-panel">
              <div className="translation-panel-heading">
                <div>
                  <p className="translation-kicker">{copy.quotaKicker}</p>
                  <h2>{copy.quotaTitle}</h2>
                </div>
                <span className={`translation-live-badge ${translation.enabled ? 'on' : ''}`}>
                  {translation.enabled ? copy.workerEnabled : copy.workerPaused}
                </span>
              </div>
              <div className="translation-switch-grid">
                <label>
                  <span>{copy.workerLabel}</span>
                  <small>{copy.workerHint}</small>
                  <input
                    type="checkbox"
                    checked={translation.enabled}
                    onChange={(event) => setTranslation((current) => ({
                      ...current,
                      enabled: event.target.checked,
                    }))}
                    disabled={busy !== ''}
                  />
                </label>
                <label>
                  <span>{copy.publishLabel}</span>
                  <small>{copy.publishHint}</small>
                  <input
                    type="checkbox"
                    checked={translation.publishEnabled}
                    onChange={(event) => setTranslation((current) => ({
                      ...current,
                      publishEnabled: event.target.checked,
                    }))}
                    disabled={busy !== ''}
                  />
                </label>
              </div>
              <div className="translation-number-grid">
                <label>
                  <span>{copy.dailyCapLabel}</span>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    value={translation.dailyRequestCap}
                    onChange={(event) => setTranslation((current) => ({
                      ...current,
                      dailyRequestCap: Number(event.target.value) || 0,
                    }))}
                    disabled={busy !== ''}
                  />
                  <small>{copy.dailyCapHint}</small>
                </label>
                <label>
                  <span>{copy.chunkCharsLabel}</span>
                  <input
                    className="form-input"
                    type="number"
                    min="1000"
                    value={translation.maxChunkChars}
                    onChange={(event) => setTranslation((current) => ({
                      ...current,
                      maxChunkChars: Number(event.target.value) || 12000,
                    }))}
                    disabled={busy !== ''}
                  />
                  <small>{copy.chunkCharsHint}</small>
                </label>
              </div>
            </section>

            <section className="translation-panel translation-status-panel">
              <div className="translation-panel-heading">
                <div>
                  <p className="translation-kicker">{copy.telemetryKicker}</p>
                  <h2>{copy.queueStatusTitle}</h2>
                </div>
                <div className="translation-status-tools">
                  <span className="translation-poll-note">{copy.polling}</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => refresh({ manual: true })}
                    disabled={busy !== ''}
                  >
                    {busy === 'refresh' ? copy.refreshing : copy.refresh}
                  </button>
                </div>
              </div>
              <div className="translation-stat-grid">
                {QUEUE_STATUSES.map((state) => (
                  <div
                    className={`translation-stat translation-stat-${state}`}
                    key={state}
                  >
                    <span>{copy.statuses[state]}</span>
                    <strong>
                      {counts
                        .filter((row) => row.status === state)
                        .reduce((sum, row) => sum + row.count, 0)}
                    </strong>
                  </div>
                ))}
              </div>
              <div className="translation-quota-readout">
                <strong>{copy.pacificDay}</strong>
                <span>{status?.today || copy.emptyValue}</span>
                {quotaRows(status).slice(0, 6).map((row) => (
                  <span key={`${row.model}-${row.window}-${row.key}`}>
                    {row.model} {copy.quotaSeparator} {row.window} {row.count}
                  </span>
                ))}
              </div>
              <div className="translation-queue-actions">
                {!backfillConfirm ? (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setBackfillConfirm(true)}
                    disabled={busy !== ''}
                  >
                    {copy.backfill}
                  </button>
                ) : (
                  <div className="translation-confirm-row" role="alert">
                    <p>{copy.backfillWarning}</p>
                    <div className="translation-confirm-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={runBackfill}
                        disabled={busy !== ''}
                      >
                        {busy === 'backfill' ? copy.queueing : copy.confirmBackfill}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setBackfillConfirm(false)}
                        disabled={busy !== ''}
                      >
                        {copy.cancel}
                      </button>
                    </div>
                  </div>
                )}
                {failedCount > 0 && (
                  <span className="translation-failure-note">
                    {copy.failedJobsNeedReview.replace('{count}', String(failedCount))}
                  </span>
                )}
              </div>
              {failed.length > 0 && (
                <div className="translation-failed-table-wrap">
                  <h3>{copy.failedJobsTitle}</h3>
                  <table className="translation-failed-table">
                    <thead>
                      <tr>
                        <th>{copy.failedType}</th>
                        <th>{copy.failedReference}</th>
                        <th>{copy.failedAttempts}</th>
                        <th>{copy.failedError}</th>
                        <th>{copy.failedAction}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failed.map((row) => {
                        const rowKey = `${row.refType}-${row.refId}`;
                        const isExpanded = expandedError === rowKey;
                        return (
                          <tr key={rowKey}>
                            <td>{row.refType}</td>
                            <td><code>{row.refId}</code></td>
                            <td>{row.attempts}</td>
                            <td className="translation-error-cell">
                              <button
                                type="button"
                                className={`translation-error-toggle${isExpanded ? ' is-expanded' : ''}`}
                                aria-expanded={isExpanded}
                                onClick={() => setExpandedError(isExpanded ? null : rowKey)}
                              >
                                {row.lastError || copy.unknownError}
                              </button>
                            </td>
                            <td>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => retryFailed(row)}
                                disabled={busy !== ''}
                              >
                                {busy === `retry-${row.refId}` ? copy.retrying : copy.retry}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
