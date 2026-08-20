import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useI18n } from '../i18n.jsx';
import {
  getGameContent,
  uploadGameContent,
  getGameContentFiles,
  deleteGameContent,
  updateGame,
} from '../api.js';

const CHANNEL_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const FILES_PAGE_SIZE = 100;

// Mirrors normalizeHttpOrigin on the server. Client-side validation is a
// courtesy; the server remains the gate.
function normalizeHttpOrigin(value) {
  const candidate = String(value ?? '').trim();
  if (!candidate || /\s/.test(candidate)) return null;
  if (!/^https?:\/\/[^/?#]+\/?$/i.test(candidate)) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || !Number.isFinite(Number(bytes))) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.ceil(seconds % 60);
  return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`;
}

function formatDate(iso, lang) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function uploadErrorText(td, error) {
  if (error?.code === 'STORAGE_QUOTA_EXCEEDED') {
    return td.gcQuotaExceeded(
      formatBytes(error.usedBytes),
      formatBytes(error.projectedBytes),
      formatBytes(error.quotaBytes),
    );
  }
  if (error?.code === 'ARCHIVE_LIMIT_EXCEEDED' || error?.code === 'LIMIT_FILE_SIZE') {
    return td.gcArchiveLimitExceeded;
  }
  return error?.message || td.gcUploadFailure;
}

function layoutWarningText(td, warning) {
  if (warning.code === 'missing_catalog') return td.gcMissingCatalogWarning;
  if (warning.code === 'missing_catalog_hash') return td.gcMissingCatalogHashWarning;
  if (warning.code === 'missing_build_target_directory') return td.gcMissingBuildTargetWarning;
  return warning.code;
}

/**
 * Derives a channel's public content URL from data the API returned — never
 * synthesized from window.location or a hardcoded domain. Existing channels
 * carry their own `publicUrl`; a not-yet-uploaded channel is derived by
 * substituting the channel segment of `defaultChannelUrl`, which the server
 * always returns (even with zero channels) so the RemoteLoadPath is visible
 * before the developer's first upload.
 */
function urlForChannel(channelsData, channel) {
  const existing = channelsData?.channels?.find((c) => c.channel === channel);
  if (existing?.publicUrl) return existing.publicUrl;
  if (!channelsData?.defaultChannelUrl) return '';
  if (channel === channelsData.defaultChannel) return channelsData.defaultChannelUrl;
  const escapedDefault = String(channelsData.defaultChannel || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return channelsData.defaultChannelUrl.replace(new RegExp(`/${escapedDefault}/$`), `/${channel}/`);
}

export default function GameContentTab({ gameId, game, setGame, isOwner }) {
  const { t, lang } = useI18n();
  const td = t.gameDetail;

  const allowedOrigins = game?.allowedOrigins || [];
  const normalizedAllowedOrigins = [...new Set(allowedOrigins.map(normalizeHttpOrigin).filter(Boolean))];
  const [originInput, setOriginInput] = useState('');
  const [originsError, setOriginsError] = useState('');
  const [savingOrigin, setSavingOrigin] = useState(false);
  const [removingOrigin, setRemovingOrigin] = useState(null);

  const [channelsData, setChannelsData] = useState({ channels: [], defaultChannel: 'live', defaultChannelUrl: '' });
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [channelInput, setChannelInput] = useState('live');
  const activeChannel = channelInput.trim().toLowerCase();
  const channelValid = CHANNEL_PATTERN.test(activeChannel);

  const [copied, setCopied] = useState(false);

  const [zipFile, setZipFile] = useState(null);
  const [mode, setMode] = useState('merge');
  const [uploading, setUploading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState('idle');
  const [uploadProgress, setUploadProgress] = useState({ loaded: 0, total: 0, rate: 0, eta: null });
  const [uploadError, setUploadError] = useState('');
  const [lastUploadResult, setLastUploadResult] = useState(null);
  const [layoutWarnings, setLayoutWarnings] = useState([]);
  const fileInputRef = useRef(null);
  const uploadControllerRef = useRef(null);
  const uploadStartedAtRef = useRef(0);

  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [filesOffset, setFilesOffset] = useState(0);
  const [filesHasMore, setFilesHasMore] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState('');

  const [deleting, setDeleting] = useState(false);

  const loadChannels = useCallback(() => {
    setLoadingChannels(true);
    setLoadError('');
    return getGameContent(gameId)
      .then((data) => setChannelsData(data))
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoadingChannels(false));
  }, [gameId]);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  // Switching channels invalidates any upload result and file page from the previous one.
  useEffect(() => {
    setInspectorOpen(false);
    setFiles([]);
    setFilesOffset(0);
    setFilesHasMore(false);
    setFilesError('');
    setFilesLoading(false);
    setLastUploadResult(null);
    setLayoutWarnings([]);
  }, [activeChannel]);

  const currentStats = channelsData.channels.find((c) => c.channel === activeChannel) || null;
  const channelUrl = channelValid ? urlForChannel(channelsData, activeChannel) : '';
  const remoteLoadPath = channelUrl ? `${channelUrl}[BuildTarget]` : '';

  function handleCopyUrl() {
    if (!remoteLoadPath) return;
    navigator.clipboard.writeText(remoteLoadPath)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  }

  async function handleAddOrigin(event) {
    event.preventDefault();
    if (!isOwner) return;
    const normalized = normalizeHttpOrigin(originInput);
    if (!originInput.trim()) return;
    if (!normalized) {
      setOriginsError(td.gcOriginsInvalid);
      return;
    }
    if (normalizedAllowedOrigins.includes(normalized)) {
      setOriginsError(td.gcOriginsDuplicate);
      return;
    }
    setOriginsError('');
    setSavingOrigin(true);
    try {
      const { game: updated } = await updateGame(gameId, {
        allowedOrigins: [...normalizedAllowedOrigins, normalized],
      });
      setGame(updated);
      setOriginInput('');
    } catch (err) {
      setOriginsError(err.message);
    } finally {
      setSavingOrigin(false);
    }
  }

  async function handleRemoveOrigin(origin) {
    if (!isOwner) return;
    setRemovingOrigin(origin);
    setOriginsError('');
    try {
      const { game: updated } = await updateGame(gameId, {
        allowedOrigins: normalizedAllowedOrigins.filter((item) => item !== normalizeHttpOrigin(origin)),
      });
      setGame(updated);
    } catch (err) {
      setOriginsError(err.message);
    } finally {
      setRemovingOrigin(null);
    }
  }

  function handleFileChange(event) {
    setZipFile(event.target.files?.[0] || null);
    setUploadError('');
    setUploadPhase('idle');
    setLayoutWarnings([]);
  }

  function updateUploadProgress({ loaded, total }) {
    const elapsed = Math.max((Date.now() - uploadStartedAtRef.current) / 1000, 0.001);
    const rate = loaded / elapsed;
    setUploadProgress({
      loaded,
      total,
      rate,
      eta: total > loaded && rate > 0 ? (total - loaded) / rate : null,
    });
    setUploadPhase(total > 0 && loaded >= total ? 'processing' : 'transferring');
  }

  function handleCancelUpload() {
    if (!uploadControllerRef.current) return;
    uploadControllerRef.current.abort();
    uploadControllerRef.current = null;
    setUploading(false);
    setUploadPhase('canceled');
  }

  // Switching channels mid-flight would otherwise let the previous channel's
  // page resolve into the current channel's list.
  const activeChannelRef = useRef(activeChannel);
  useEffect(() => { activeChannelRef.current = activeChannel; }, [activeChannel]);

  const loadFiles = useCallback(async (offset) => {
    if (!channelValid) return;
    const requestedChannel = activeChannel;
    setFilesLoading(true);
    setFilesError('');
    try {
      const data = await getGameContentFiles(gameId, requestedChannel, { offset, limit: FILES_PAGE_SIZE });
      if (activeChannelRef.current !== requestedChannel) return;
      setFiles((prev) => (offset === 0 ? data.files : [...prev, ...data.files]));
      setFilesOffset(offset + data.files.length);
      setFilesHasMore(Boolean(data.hasMore));
    } catch (err) {
      if (activeChannelRef.current !== requestedChannel) return;
      setFilesError(err.message);
    } finally {
      if (activeChannelRef.current === requestedChannel) setFilesLoading(false);
    }
  }, [gameId, activeChannel, channelValid]);

  async function handleUpload(event) {
    event.preventDefault();
    if (!isOwner) return;
    if (!channelValid || !zipFile || uploading) return;
    if (mode === 'replace' && !window.confirm(td.gcModeReplaceConfirm)) return;

    setUploadError('');
    setLayoutWarnings([]);
    setUploading(true);
    setUploadPhase('transferring');
    setUploadProgress({ loaded: 0, total: 0, rate: 0, eta: null });
    uploadStartedAtRef.current = Date.now();
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    const requestedChannel = activeChannel;
    try {
      const { content, warnings = [] } = await uploadGameContent(gameId, requestedChannel, zipFile, {
        mode,
        onProgress: updateUploadProgress,
        signal: controller.signal,
      });
      // The channel field stays editable during an upload, so a response can
      // arrive after the view moved on. Its stats and warnings describe the
      // channel that was uploaded to, not the one now on screen.
      if (activeChannelRef.current === requestedChannel) {
        setLastUploadResult(content);
        setLayoutWarnings(warnings);
      }
      setZipFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setUploadPhase('success');
      await loadChannels();
      if (inspectorOpen) await loadFiles(0);
    } catch (err) {
      if (err.name === 'AbortError') {
        setUploadPhase('canceled');
      } else {
        setUploadError(uploadErrorText(td, err));
        setUploadPhase('failure');
      }
    } finally {
      if (uploadControllerRef.current === controller) uploadControllerRef.current = null;
      setUploading(false);
    }
  }

  function toggleInspector() {
    const next = !inspectorOpen;
    setInspectorOpen(next);
    if (next && files.length === 0) loadFiles(0);
  }

  async function handleDeleteChannel() {
    if (!isOwner) return;
    if (!window.confirm(td.gcDeleteChannelConfirm)) return;
    setDeleting(true);
    try {
      await deleteGameContent(gameId, activeChannel);
      setLastUploadResult(null);
      setLayoutWarnings([]);
      setFiles([]);
      setFilesOffset(0);
      setFilesHasMore(false);
      setInspectorOpen(false);
      await loadChannels();
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  const progressPct = uploadProgress.total
    ? Math.min(100, Math.round((uploadProgress.loaded / uploadProgress.total) * 100))
    : 0;
  const unhashedCount = lastUploadResult?.unhashedBundleCount || 0;

  return (
    <div className="gd-section gc-section">
      <h2 className="gd-section-title">{td.gcPageTitle}</h2>
      <p className="gd-section-desc">{td.gcIntro}</p>

      {/* ── URL card — the single most important element; renders before any upload ── */}
      <div className="gd-subsection si-data-subsection">
        <h3 className="gd-section-title" style={{ marginBottom: 4 }}>{td.gcUrlTitle}</h3>

        <label className="form-label" htmlFor={`gc-channel-${gameId}`}>{td.gcChannelLabel}</label>
        <div className="gd-upload-row" style={{ marginTop: 4 }}>
          <input
            id={`gc-channel-${gameId}`}
            type="text"
            className="form-input gd-version-input"
            value={channelInput}
            maxLength={32}
            onChange={(e) => setChannelInput(e.target.value)}
          />
          {channelsData.channels.length > 1 && (
            <div className="gd-filter-chips">
              {channelsData.channels.map((c) => (
                <button
                  key={c.channel}
                  type="button"
                  className={`gd-filter-chip${c.channel === activeChannel ? ' active' : ''}`}
                  onClick={() => setChannelInput(c.channel)}
                >
                  {c.channel} ({c.fileCount})
                </button>
              ))}
            </div>
          )}
        </div>
        {!channelValid && <div className="gd-error">{td.gcChannelInvalid}</div>}
        <p className="gd-upload-hint">{td.gcChannelHint}</p>

        <div className="gd-upload-row" style={{ marginTop: 8 }}>
          <input
            type="text"
            className="form-input"
            readOnly
            value={remoteLoadPath || '—'}
            style={{ flex: 1, fontFamily: 'var(--font-mono)' }}
            aria-label={td.gcUrlTitle}
          />
          <button type="button" className="btn btn-ghost" onClick={handleCopyUrl} disabled={!remoteLoadPath}>
            {copied ? td.copied : td.copy}
          </button>
        </div>
        <p className="gi-step-hint">{td.gcUrlHint}</p>
      </div>

      {/* ── Allowed external origins (CORS) ── */}
      <div className="gd-subsection si-data-subsection" style={{ marginTop: 20 }}>
        <h3 className="gd-section-title">{td.gcOriginsTitle}</h3>
        <p className="gd-upload-hint">{td.gcOriginsDesc}</p>

        {allowedOrigins.length === 0 ? (
          <p className="gd-empty-text">{td.gcOriginsEmpty}</p>
        ) : (
          <div className="gd-collab-list">
            {allowedOrigins.map((origin) => (
              <div key={origin} className="gd-collab-row">
                <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13, wordBreak: 'break-all' }}>
                  {origin}
                </span>
                {isOwner && (
                  <button
                    type="button"
                    className="btn btn-ghost gd-collab-remove"
                    disabled={removingOrigin === origin}
                    onClick={() => handleRemoveOrigin(origin)}
                  >
                    {removingOrigin === origin ? td.gcOriginsRemoving : td.gcOriginsRemove}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {isOwner && (
          <form className="gd-collab-invite-form" onSubmit={handleAddOrigin}>
            <input
              type="url"
              className="form-input"
              placeholder="https://username.github.io"
              value={originInput}
              onChange={(e) => setOriginInput(e.target.value)}
              disabled={savingOrigin}
              style={{ maxWidth: 320 }}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={savingOrigin || !originInput.trim()}>
              {savingOrigin ? td.gcOriginsAdding : td.gcOriginsAdd}
            </button>
            {originsError && <span className="gd-error gd-collab-err">{originsError}</span>}
          </form>
        )}
      </div>

      {/* ── Upload ── */}
      {isOwner && (
        <div className="gd-subsection si-data-subsection" style={{ marginTop: 20 }}>
          <h3 className="gd-section-title">{td.gcUploadTitle}</h3>
          <form onSubmit={handleUpload}>
          <div className="gd-upload-row">
            <label className="btn btn-ghost gd-file-label">
              {td.gcChooseZip}
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                disabled={uploading}
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </label>
            <select
              className="form-input gd-version-input"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              disabled={uploading}
              aria-label={td.gcModeLabel}
            >
              <option value="merge">{td.gcModeMerge}</option>
              <option value="replace">{td.gcModeReplace}</option>
            </select>
            <button type="submit" className="btn btn-primary btn-sm" disabled={uploading || !zipFile || !channelValid}>
              {uploadPhase === 'processing' ? td.gcUploadProcessing : uploading ? td.gcUploadTransferring : td.gcUploadButton}
            </button>
            {uploading && uploadPhase === 'transferring' && (
              <button type="button" className="btn btn-ghost btn-sm gd-upload-cancel" onClick={handleCancelUpload}>
                {td.gcUploadCancel}
              </button>
            )}
          </div>
          <p className="gd-upload-hint">{mode === 'replace' ? td.gcModeReplaceDesc : td.gcModeMergeDesc}</p>

          {zipFile && (
            <div className="gd-upload-manifest" aria-live="polite">
              <div className="gd-upload-manifest-title">{td.gcSelectedFile}</div>
              <div className="gd-upload-file">
                <span>{zipFile.name}</span>
                <span>{formatBytes(zipFile.size)}</span>
              </div>
            </div>
          )}

          {uploadPhase !== 'idle' && (
            <div className={`gd-upload-status is-${uploadPhase}`} aria-live="polite">
              <div className="gd-upload-status-head">
                <span>
                  {uploadPhase === 'transferring' && td.gcUploadTransferring}
                  {uploadPhase === 'processing' && td.gcUploadProcessing}
                  {uploadPhase === 'success' && td.gcUploadSuccess}
                  {uploadPhase === 'failure' && td.gcUploadFailure}
                  {uploadPhase === 'canceled' && td.gcUploadCanceled}
                </span>
                {(uploadPhase === 'transferring' || uploadPhase === 'processing') && (
                  <strong>{uploadProgress.total ? `${progressPct}%` : '—'}</strong>
                )}
              </div>
              {(uploadPhase === 'transferring' || uploadPhase === 'processing') && (
                <>
                  <div
                    className="gd-upload-progress-track"
                    role="progressbar"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow={progressPct}
                  >
                    <span style={{ width: `${progressPct}%` }} />
                  </div>
                  <div className="gd-upload-stats">
                    <span>{td.gcUploadTransferred}: {formatBytes(uploadProgress.loaded)} / {uploadProgress.total ? formatBytes(uploadProgress.total) : '—'}</span>
                    <span>{td.gcUploadRate}: {uploadProgress.rate ? `${formatBytes(uploadProgress.rate)}/s` : '—'}</span>
                    <span>{td.gcUploadEta}: {uploadPhase === 'processing' ? '—' : formatDuration(uploadProgress.eta)}</span>
                  </div>
                </>
              )}
              {uploadError && <div className="gd-error">{uploadError}</div>}
            </div>
          )}
          </form>

          {unhashedCount > 0 && (
            <div className="gi-step-warn">
              <strong>{td.gcUnhashedTitle}</strong> — {td.gcUnhashedWarning(unhashedCount)}
            </div>
          )}

          {layoutWarnings.length > 0 && (
            <div className="gi-step-warn" role="status">
              <strong>{td.gcLayoutWarningTitle}</strong>
              <ul>
                {layoutWarnings.map((warning, index) => (
                  <li key={`${warning.code}-${index}`}>{layoutWarningText(td, warning)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Stats ── */}
      <div className="gd-subsection si-data-subsection" style={{ marginTop: 20 }}>
        <h3 className="gd-section-title">{td.gcStatsTitle}</h3>
        {loadingChannels ? (
          <p className="gd-empty-text">{t.loading}</p>
        ) : loadError ? (
          <div className="gd-error">{loadError}</div>
        ) : currentStats ? (
          <>
            <div className="gd-build-meta">
              <span className="gd-file-chip">{td.gcStatsFiles}: {currentStats.fileCount}</span>
              <span className="gd-file-chip">{td.gcStatsSize}: {formatBytes(currentStats.storageBytes)}</span>
              <span className="gd-build-date">{td.gcStatsLastUpload}: {formatDate(currentStats.lastUploadAt, lang)}</span>
            </div>
            {isOwner && (
              <button
                type="button"
                className="btn btn-ghost gd-delete-btn"
                onClick={handleDeleteChannel}
                disabled={deleting}
                style={{ marginTop: 12 }}
              >
                {deleting ? td.gcDeleting : td.gcDeleteChannel}
              </button>
            )}
          </>
        ) : (
          <p className="gd-empty-text">{td.gcStatsEmpty}</p>
        )}
      </div>

      {/* ── File inspector ── */}
      <div className="gd-subsection si-data-subsection" style={{ marginTop: 20 }}>
        <div className="si-subsection-heading">
          <h3 className="gd-section-title" style={{ marginBottom: 0 }}>{td.gcInspectorTitle}</h3>
          <button
            type="button"
            className="btn btn-ghost gd-streaming-inspect"
            aria-expanded={inspectorOpen}
            onClick={toggleInspector}
            disabled={!channelValid}
          >
            {inspectorOpen ? td.gcInspectorHide : td.gcInspectorShow}
          </button>
        </div>
        {inspectorOpen && (
          <div style={{ marginTop: 12 }}>
            {filesError && <div className="gd-error">{filesError}</div>}
            {files.length === 0 && !filesLoading ? (
              <p className="gd-empty-text">{td.gcInspectorEmpty}</p>
            ) : (
              <div className="si-table-wrap">
                <table className="si-table">
                  <thead>
                    <tr>
                      <th>{td.gcInspectorColPath}</th>
                      <th>{td.gcInspectorColSize}</th>
                      <th>{td.gcInspectorColModified}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file) => (
                      <tr key={file.path}>
                        <td className="gc-table-path">{file.path}</td>
                        <td>{formatBytes(file.size)}</td>
                        <td>{formatDate(file.modifiedAt, lang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {filesHasMore && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 10 }}
                onClick={() => loadFiles(filesOffset)}
                disabled={filesLoading}
              >
                {filesLoading ? td.gcInspectorLoading : td.gcInspectorLoadMore}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
