import React, { forwardRef, useState, useEffect, useRef, useMemo, useCallback, useImperativeHandle } from 'react';
import { useParams, useLocation, useBlocker } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getGame, uploadBuild, activateBuild, deleteBuild, getGameReports, updateGame, updateIssue, deleteIssue, inviteCollaborator, removeCollaborator, uploadThumbnail, deleteThumbnail } from '../api.js';
import ServerIntegrationTab from './ServerIntegrationTab.jsx';
import AdminBlogPage from './AdminBlogPage.jsx';
import AdminBlogEditorPage from './AdminBlogEditorPage.jsx';
import Modal from '../components/Modal.jsx';
import TranslationEditorPanel, { useTranslationEditor } from '../components/TranslationEditorPanel.jsx';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';
import StorageBar from '../components/StorageBar.jsx';
import PageLink from '../components/PageLink.jsx';
import { useLocaleNavigate } from '../hooks/useLocaleNavigate.js';
import DashSidebar from '../components/DashSidebar.jsx';
import { GRAC_CONTENT_DESCRIPTOR_KEYS, GRAC_RATING_KEYS } from '../constants/gracAssets.js';
import hljs from 'highlight.js/lib/core';
import hljsCsharp from 'highlight.js/lib/languages/csharp';
import hljsJs from 'highlight.js/lib/languages/javascript';
import './DashboardPage.css';
import './GameDetailPage.css';

hljs.registerLanguage('csharp', hljsCsharp);
hljs.registerLanguage('javascript', hljsJs);

function formatBytes(bytes) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso, lang) {
  return new Date(iso).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDateForInput(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const INTEGRATION_CS = `using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using UnityEngine;

namespace IssueTracker
{
    /// <summary>
    /// Drop-in singleton that buffers Unity logs and forwards bug reports
    /// to the hosting browser via a WebGL .jslib bridge.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class IssueTrackerIntegration : MonoBehaviour
    {
        public delegate Dictionary<string, object> CollectCustomStateHandler();

        public static IssueTrackerIntegration Instance { get; private set; }

        /// <summary>
        /// Invoked when a report is being assembled. Return a dictionary of
        /// custom state (scene name, player coords, inventory, ...) that
        /// will be serialized into the payload.
        /// </summary>
        public event CollectCustomStateHandler OnCollectCustomState;

        [SerializeField] private int logBufferSize = 200;

        private readonly Queue<LogEntry> logBuffer = new Queue<LogEntry>();
        private readonly object bufferLock = new object();

        [Serializable]
        private struct LogEntry
        {
            public string Message;
            public string StackTrace;
            public string Type;
            public string TimestampUtc;
        }

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void IssueTracker_SubmitReport(string payloadJson);

        [DllImport("__Internal")]
        private static extern void IssueTracker_GameOver();
#else
        private static void IssueTracker_SubmitReport(string payloadJson)
        {
            Debug.Log($"[IssueTracker] (Editor stub) payload:\\n{payloadJson}");
        }

        private static void IssueTracker_GameOver() { }
#endif

        /// <summary>
        /// Call this when the game ends to show the reload overlay in the browser.
        /// </summary>
        public static void NotifyGameOver()
        {
            IssueTracker_GameOver();
        }

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);
            Application.logMessageReceivedThreaded += HandleLog;
        }

        private void OnDestroy()
        {
            if (Instance == this)
            {
                Application.logMessageReceivedThreaded -= HandleLog;
                Instance = null;
            }
        }

        private void HandleLog(string message, string stackTrace, LogType type)
        {
            var entry = new LogEntry
            {
                Message = message,
                StackTrace = stackTrace,
                Type = type.ToString(),
                TimestampUtc = DateTime.UtcNow.ToString("o"),
            };

            lock (bufferLock)
            {
                logBuffer.Enqueue(entry);
                while (logBuffer.Count > logBufferSize)
                {
                    logBuffer.Dequeue();
                }
            }
        }

        /// <summary>
        /// Called by the browser (via SendMessage) to trigger a report
        /// submission. Title and description originate from the web overlay.
        /// </summary>
        public void SubmitReport(string titleAndDescriptionJson)
        {
            try
            {
                var input = JsonUtility.FromJson<ReportInput>(titleAndDescriptionJson);
                BuildAndSend(input.title, input.description);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[IssueTracker] Failed to parse report input: {ex}");
            }
        }

        [Serializable]
        private struct ReportInput
        {
            public string title;
            public string description;
        }

        private void BuildAndSend(string title, string description)
        {
            var customState = new Dictionary<string, object>();
            if (OnCollectCustomState != null)
            {
                foreach (Delegate d in OnCollectCustomState.GetInvocationList())
                {
                    try
                    {
                        var handler = (CollectCustomStateHandler)d;
                        var state = handler.Invoke();
                        if (state != null)
                        {
                            foreach (var kvp in state)
                            {
                                customState[kvp.Key] = kvp.Value;
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        Debug.LogWarning($"[IssueTracker] Custom state handler threw: {ex}");
                    }
                }
            }

            LogEntry[] logs;
            lock (bufferLock)
            {
                logs = logBuffer.ToArray();
            }

            var sb = new StringBuilder(4096);
            sb.Append('{');
            AppendJsonField(sb, "title", title); sb.Append(',');
            AppendJsonField(sb, "description", description); sb.Append(',');
            AppendJsonField(sb, "unityVersion", Application.unityVersion); sb.Append(',');
            AppendJsonField(sb, "platform", Application.platform.ToString()); sb.Append(',');
            AppendJsonField(sb, "productName", Application.productName); sb.Append(',');
            AppendJsonField(sb, "version", Application.version); sb.Append(',');
            AppendJsonField(sb, "timestampUtc", DateTime.UtcNow.ToString("o")); sb.Append(',');

            sb.Append("\\"logs\\":[");
            for (int i = 0; i < logs.Length; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append('{');
                AppendJsonField(sb, "type", logs[i].Type); sb.Append(',');
                AppendJsonField(sb, "timestampUtc", logs[i].TimestampUtc); sb.Append(',');
                AppendJsonField(sb, "message", logs[i].Message); sb.Append(',');
                AppendJsonField(sb, "stackTrace", logs[i].StackTrace);
                sb.Append('}');
            }
            sb.Append("],");

            sb.Append("\\"customState\\":");
            AppendDictionary(sb, customState);

            sb.Append('}');

            IssueTracker_SubmitReport(sb.ToString());
        }

        private static void AppendJsonField(StringBuilder sb, string key, string value)
        {
            sb.Append('"').Append(key).Append("\\":");
            AppendJsonString(sb, value);
        }

        private static void AppendJsonString(StringBuilder sb, string value)
        {
            if (value == null)
            {
                sb.Append("null");
                return;
            }

            sb.Append('"');
            foreach (var c in value)
            {
                switch (c)
                {
                    case '\\\\': sb.Append("\\\\\\\\"); break;
                    case '"': sb.Append("\\\\\\""); break;
                    case '\\b': sb.Append("\\\\b"); break;
                    case '\\f': sb.Append("\\\\f"); break;
                    case '\\n': sb.Append("\\\\n"); break;
                    case '\\r': sb.Append("\\\\r"); break;
                    case '\\t': sb.Append("\\\\t"); break;
                    default:
                        if (c < 0x20)
                        {
                            sb.Append("\\\\u").Append(((int)c).ToString("x4"));
                        }
                        else
                        {
                            sb.Append(c);
                        }
                        break;
                }
            }
            sb.Append('"');
        }

        private static void AppendDictionary(StringBuilder sb, Dictionary<string, object> dict)
        {
            if (dict == null)
            {
                sb.Append("null");
                return;
            }

            sb.Append('{');
            bool first = true;
            foreach (var kvp in dict)
            {
                if (!first) sb.Append(',');
                first = false;
                AppendJsonString(sb, kvp.Key);
                sb.Append(':');
                AppendJsonValue(sb, kvp.Value);
            }
            sb.Append('}');
        }

        private static void AppendJsonValue(StringBuilder sb, object value)
        {
            switch (value)
            {
                case null:
                    sb.Append("null");
                    break;
                case string s:
                    AppendJsonString(sb, s);
                    break;
                case bool b:
                    sb.Append(b ? "true" : "false");
                    break;
                case float f:
                    sb.Append(f.ToString(System.Globalization.CultureInfo.InvariantCulture));
                    break;
                case double d:
                    sb.Append(d.ToString(System.Globalization.CultureInfo.InvariantCulture));
                    break;
                case int or long or short or byte:
                    sb.Append(value.ToString());
                    break;
                case Vector3 v3:
                    sb.AppendFormat(System.Globalization.CultureInfo.InvariantCulture,
                        "{{\\"x\\":{0},\\"y\\":{1},\\"z\\":{2}}}", v3.x, v3.y, v3.z);
                    break;
                case Vector2 v2:
                    sb.AppendFormat(System.Globalization.CultureInfo.InvariantCulture,
                        "{{\\"x\\":{0},\\"y\\":{1}}}", v2.x, v2.y);
                    break;
                case Dictionary<string, object> nested:
                    AppendDictionary(sb, nested);
                    break;
                default:
                    AppendJsonString(sb, value.ToString());
                    break;
            }
        }
    }
}`;

const INTEGRATION_JSLIB = `mergeInto(LibraryManager.library, {
  IssueTracker_SubmitReport: function (payloadPtr) {
    try {
      var json = UTF8ToString(payloadPtr);
      if (typeof window.__issueTrackerReceive === 'function') {
        window.__issueTrackerReceive(json);
      } else {
        console.warn('[IssueTracker] window.__issueTrackerReceive is not defined');
      }
    } catch (e) {
      console.error('[IssueTracker] submit failed', e);
    }
  },
  IssueTracker_GameOver: function () {
    if (typeof window.__unityGameOver === 'function') {
      window.__unityGameOver();
    }
  },
});`;

const CUSTOM_STATE_CS = `// Multiple scripts can subscribe; their dictionaries will be merged.
void Start()
{
    IssueTracker.IssueTrackerIntegration.Instance.OnCollectCustomState += () =>
        new Dictionary<string, object>
        {
            { "hp", player.Health },
            { "pos", player.transform.position }
        };
}`;

const GAME_OVER_CS = `// Call this wherever your game ends (scene transition, death screen, credits, etc.)
void EndGame()
{
    IssueTracker.IssueTrackerIntegration.NotifyGameOver();
    Application.Quit(); // no-op in WebGL; keeps desktop builds clean
}`;

const ArcadeSection = forwardRef(function ArcadeSection({
  gameId,
  game,
  setGame,
  builds,
  t,
  lang,
  onDirtyChange,
}, ref) {
  const td = t.gameDetail;
  const isEnglish = lang === 'en';
  const translation = useTranslationEditor('Game', gameId);
  const translationReady = Boolean(
    translation.row && ['ready', 'stale'].includes(translation.row.status),
  );
  const hasActiveBuild = builds.some((b) => b.isActive);
  const initialSettings = useMemo(() => ({
    name: game.name || '',
    visibility: game.visibility || 'private',
    description: game.description || '',
    thumbnailUrl: game.thumbnailUrl || '',
  }), [game]);

  const [savedSettings, setSavedSettings] = useState(initialSettings);
  const [name, setName] = useState(initialSettings.name);
  const [visibility, setVisibility] = useState(initialSettings.visibility);
  const [description, setDescription] = useState(initialSettings.description);
  const [sourceDescription, setSourceDescription] = useState(initialSettings.description);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [thumbnailRemoved, setThumbnailRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const thumbInputRef = useRef(null);

  const thumbnailPreviewUrl = useMemo(
    () => thumbnailFile ? URL.createObjectURL(thumbnailFile) : '',
    [thumbnailFile],
  );

  useEffect(() => () => {
    if (thumbnailPreviewUrl) URL.revokeObjectURL(thumbnailPreviewUrl);
  }, [thumbnailPreviewUrl]);

  useEffect(() => {
    setSourceDescription(initialSettings.description);
    if (!isEnglish) setDescription(initialSettings.description);
  }, [initialSettings.description, isEnglish]);

  useEffect(() => {
    if (!isEnglish) {
      setDescription(sourceDescription);
      return;
    }
    if (translationReady) {
      setDescription(translation.row.fields?.description || '');
    }
  }, [isEnglish, sourceDescription, translationReady, translation.row]);

  function updateDescription(value) {
    setDescription(value);
    if (!isEnglish) setSourceDescription(value);
  }

  function validateName(value) {
    const trimmedName = value.trim();
    if (!trimmedName) return td.arcadeNameRequired;
    if (trimmedName.length > 100) return td.arcadeNameTooLong;
    return '';
  }

  function updateName(value) {
    setName(value);
    setError(validateName(value));
  }

  const draftThumbnailKey = thumbnailFile
    ? `file:${thumbnailFile.name}:${thumbnailFile.size}:${thumbnailFile.lastModified}`
    : thumbnailRemoved ? '' : savedSettings.thumbnailUrl;
  const savedDescription = isEnglish
    ? translation.row?.fields?.description || ''
    : savedSettings.description;
  const hasUnsavedChanges = (
    name !== savedSettings.name
    || (isEnglish
      ? translationReady && description !== savedDescription
      : (
        visibility !== savedSettings.visibility
        || description !== savedSettings.description
        || draftThumbnailKey !== savedSettings.thumbnailUrl
      ))
  );
  const thumbnailImageSrc = thumbnailFile
    ? thumbnailPreviewUrl
    : savedSettings.thumbnailUrl && !thumbnailRemoved
      ? `${API_BASE}${savedSettings.thumbnailUrl}`
      : '';

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
    return () => onDirtyChange?.(false);
  }, [hasUnsavedChanges, onDirtyChange]);

  async function handleSave(e) {
    e?.preventDefault?.();
    if (!hasUnsavedChanges) return true;
    if (name !== savedSettings.name) {
      const nameError = validateName(name);
      if (nameError) {
        setError(nameError);
        return false;
      }
    }
    setError('');
    setSaving(true);
    try {
      if (isEnglish) {
        if (name !== savedSettings.name) {
          const result = await updateGame(gameId, { name: name.trim() });
          const updated = result.game;
          const nextName = updated?.name ?? name.trim();
          setGame((prev) => ({ ...prev, ...(updated || {}), name: nextName }));
          setName(nextName);
          setSavedSettings((prev) => ({ ...prev, name: nextName }));
        }
        if (translationReady && description !== savedDescription) {
          await translation.save({ description });
        }
        return true;
      }

      const settingsChanged = (
        name !== savedSettings.name
        || visibility !== savedSettings.visibility
        || description !== savedSettings.description
      );
      if (settingsChanged) {
        const result = await updateGame(gameId, { name: name.trim(), visibility, description });
        const updated = result.game;
        const nextName = updated?.name ?? name.trim();
        const nextVisibility = updated?.visibility ?? visibility;
        const nextDescription = updated?.description ?? description;
        setGame((prev) => ({ ...prev, ...(updated || {}), name: nextName }));
        setName(nextName);
        setVisibility(nextVisibility);
        setDescription(nextDescription);
        setSourceDescription(nextDescription);
        setSavedSettings((prev) => ({
          ...prev,
          name: nextName,
          visibility: nextVisibility,
          description: nextDescription,
        }));
      }

      if (thumbnailFile) {
        const result = await uploadThumbnail(gameId, thumbnailFile);
        const nextThumbnailUrl = result.thumbnailUrl || '';
        setGame((prev) => ({ ...prev, thumbnailUrl: nextThumbnailUrl }));
        setSavedSettings((prev) => ({ ...prev, thumbnailUrl: nextThumbnailUrl }));
        setThumbnailFile(null);
      } else if (thumbnailRemoved && savedSettings.thumbnailUrl) {
        await deleteThumbnail(gameId);
        setGame((prev) => ({ ...prev, thumbnailUrl: '' }));
        setSavedSettings((prev) => ({ ...prev, thumbnailUrl: '' }));
        setThumbnailRemoved(false);
      }

      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  function handleThumbnailPick(e) {
    if (isEnglish) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setThumbnailFile(file);
    setThumbnailRemoved(false);
    if (thumbInputRef.current) thumbInputRef.current.value = '';
  }

  function handleRemoveThumbnail() {
    if (isEnglish) return;
    if (!thumbnailFile && !savedSettings.thumbnailUrl) return;
    setError('');
    setThumbnailFile(null);
    setThumbnailRemoved(true);
  }

  function handleRevert() {
    setError('');
    setName(savedSettings.name);
    setVisibility(savedSettings.visibility);
    setDescription(isEnglish ? savedDescription : savedSettings.description);
    setThumbnailFile(null);
    setThumbnailRemoved(false);
  }

  useImperativeHandle(ref, () => ({
    save: handleSave,
    revert: handleRevert,
  }), [handleSave, handleRevert]);

  return (
    <div className="gd-arcade-settings">
      <TranslationEditorPanel
        refType="Game"
        refId={gameId}
        lang={lang}
        sourceFields={{ description: sourceDescription }}
        translation={translation}
        onRetranslate={() => translation.retranslate().catch(() => {})}
      />
      <div className="gd-settings-section-heading">
        <div>
          <h2 className="gd-section-title">{td.arcadeTitle}</h2>
          <p className="gd-section-desc">{td.arcadeDesc}</p>
        </div>
        <div className={`gd-arcade-status${hasUnsavedChanges ? ' dirty' : ''}`} role="status" aria-live="polite">
          <span className="gd-arcade-status-dot" aria-hidden="true" />
          {hasUnsavedChanges ? td.settingsUnsavedStatus : td.settingsSaved}
        </div>
      </div>

      {!hasActiveBuild && (
        <div className="gd-arcade-warn">{td.requiresActiveBuild}</div>
      )}

      <div className="gd-arcade-block">
        <label className="form-label" htmlFor={`arcade-game-name-${gameId}`}>
          {td.arcadeName}
          {isEnglish && <small> · {t.blog.editorLocale.source}</small>}
        </label>
        <input
          id={`arcade-game-name-${gameId}`}
          className="form-input"
          type="text"
          maxLength={100}
          placeholder={td.arcadeNamePlaceholder}
          value={name}
          disabled={saving || isEnglish}
          onChange={(e) => updateName(e.target.value)}
        />
        <div className="gd-arcade-counter">{name.length} / 100</div>
      </div>

      <div className="gd-arcade-row">
        <label className={`gd-vis-card${visibility === 'private' ? ' active' : ''}`}>
          <input
            type="radio"
            name="visibility"
            value="private"
            checked={visibility === 'private'}
            disabled={isEnglish}
            onChange={() => setVisibility('private')}
          />
          <span className="gd-vis-card-h">
            <span aria-hidden="true">🔒</span> Private
            {isEnglish && <small> · {t.blog.editorLocale.source}</small>}
          </span>
          <span className="gd-vis-card-d">{td.visibilityPrivate}</span>
        </label>
        <label className={`gd-vis-card${visibility === 'public' ? ' active' : ''} ${!hasActiveBuild ? 'disabled' : ''}`}>
          <input
            type="radio"
            name="visibility"
            value="public"
            checked={visibility === 'public'}
            disabled={!hasActiveBuild || isEnglish}
            onChange={() => setVisibility('public')}
          />
          <span className="gd-vis-card-h">
            <span aria-hidden="true">🌐</span> Public
            {isEnglish && <small> · {t.blog.editorLocale.source}</small>}
          </span>
          <span className="gd-vis-card-d">{td.visibilityPublic}</span>
        </label>
      </div>

      {(!isEnglish || translationReady) && (
        <div className="gd-arcade-block">
          <label className="form-label">{td.arcadeDescription}</label>
          <textarea
            className="form-input gd-arcade-desc-input"
            rows={3}
            maxLength={500}
            placeholder={td.arcadeDescPlaceholder}
            value={description}
            onChange={(e) => updateDescription(e.target.value)}
          />
          <div className="gd-arcade-counter">{description.length} / 500</div>
        </div>
      )}

      <div className="gd-arcade-block">
        <label className="form-label">
          {td.arcadeThumbnail}
          {isEnglish && <small> · {t.blog.editorLocale.source}</small>}
        </label>
        <p className="gd-section-desc gd-arcade-hint">{td.arcadeThumbnailHint}</p>
        <div className="gd-thumb-row">
          {thumbnailImageSrc ? (
            <img
              src={thumbnailImageSrc}
              alt={td.arcadeThumbnail}
              className="gd-thumb-preview"
            />
          ) : (
            <div className="gd-thumb-preview empty">{td.noThumbnail}</div>
          )}
          <div className="gd-thumb-actions">
            <label className="btn btn-ghost">
              {savedSettings.thumbnailUrl && !thumbnailRemoved ? td.replaceThumbnail : td.uploadThumbnail}
              <input
                ref={thumbInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                style={{ display: 'none' }}
                onChange={handleThumbnailPick}
                disabled={saving || isEnglish}
              />
            </label>
            {(savedSettings.thumbnailUrl || thumbnailFile) && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleRemoveThumbnail}
                disabled={saving || isEnglish}
              >
                {td.removeThumbnail}
              </button>
            )}
            {thumbnailFile && (
              <span className="gd-thumb-selected" title={thumbnailFile.name}>
                {td.thumbnailSelected} {thumbnailFile.name}
              </span>
            )}
          </div>
        </div>
        <p className="gd-thumb-save-hint">{td.thumbnailSaveHint}</p>
      </div>

      {error && <div className="gd-error">{error}</div>}

    </div>
  );
});

const ReviewInfoSection = forwardRef(function ReviewInfoSection({ gameId, game, setGame, t, onDirtyChange }, ref) {
  const td = t.gameDetail;
  const current = game.reviewInfo ?? {};
  const initialValues = useMemo(() => ({
    enabled: Boolean(current.enabled),
    title: current.title || '',
    businessName: current.businessName || '',
    rating: current.rating || '',
    classificationNumber: current.classificationNumber || '',
    classificationDate: formatDateForInput(current.classificationDate),
    developerReportNumber: current.developerReportNumber || '',
    contentDescriptors: [...(current.contentDescriptors || [])],
  }), [current]);
  const [savedValues, setSavedValues] = useState(initialValues);
  const [enabled, setEnabled] = useState(initialValues.enabled);
  const [title, setTitle] = useState(initialValues.title);
  const [businessName, setBusinessName] = useState(initialValues.businessName);
  const [rating, setRating] = useState(initialValues.rating);
  const [classificationNumber, setClassificationNumber] = useState(initialValues.classificationNumber);
  const [classificationDate, setClassificationDate] = useState(initialValues.classificationDate);
  const [developerReportNumber, setDeveloperReportNumber] = useState(initialValues.developerReportNumber);
  const [contentDescriptors, setContentDescriptors] = useState(initialValues.contentDescriptors);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const descriptorsMatch = (
    contentDescriptors.length === savedValues.contentDescriptors.length
    && contentDescriptors.every((item) => savedValues.contentDescriptors.includes(item))
  );
  const hasUnsavedChanges = (
    enabled !== savedValues.enabled
    || title !== savedValues.title
    || businessName !== savedValues.businessName
    || rating !== savedValues.rating
    || classificationNumber !== savedValues.classificationNumber
    || classificationDate !== savedValues.classificationDate
    || developerReportNumber !== savedValues.developerReportNumber
    || !descriptorsMatch
  );

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
    return () => onDirtyChange?.(false);
  }, [hasUnsavedChanges, onDirtyChange]);

  async function handleSave(e) {
    e?.preventDefault?.();
    if (!hasUnsavedChanges) return true;
    if (enabled && !rating) {
      setError(td.reviewRatingRequired);
      return false;
    }
    setSaving(true);
    setError('');
    try {
      const reviewInfo = {
        enabled,
        title,
        businessName,
        rating,
        classificationNumber,
        classificationDate,
        developerReportNumber,
        contentDescriptors,
      };
      const { game: updated } = await updateGame(gameId, { reviewInfo });
      setGame((prev) => ({ ...prev, ...updated }));
      setSavedValues({
        ...reviewInfo,
        contentDescriptors: [...contentDescriptors],
      });
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  function handleRevert() {
    setError('');
    setEnabled(savedValues.enabled);
    setTitle(savedValues.title);
    setBusinessName(savedValues.businessName);
    setRating(savedValues.rating);
    setClassificationNumber(savedValues.classificationNumber);
    setClassificationDate(savedValues.classificationDate);
    setDeveloperReportNumber(savedValues.developerReportNumber);
    setContentDescriptors([...savedValues.contentDescriptors]);
  }

  useImperativeHandle(ref, () => ({
    save: handleSave,
    revert: handleRevert,
  }), [handleSave, handleRevert]);

  return (
    <div className="gd-review-settings">
      <div className="gd-settings-section-heading">
        <div>
          <h2 className="gd-section-title">{td.reviewTitle}</h2>
          <p className="gd-section-desc">{td.reviewDesc}</p>
        </div>
        <div className={`gd-arcade-status${hasUnsavedChanges ? ' dirty' : ''}`} role="status" aria-live="polite">
          <span className="gd-arcade-status-dot" aria-hidden="true" />
          {hasUnsavedChanges ? td.settingsUnsavedStatus : td.settingsSaved}
        </div>
      </div>
      <label className="gd-review-toggle">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>{td.reviewEnabled}</span>
      </label>
      <div className="gd-review-fields">
          <label className="gd-review-field">
            <span className="form-label">{td.reviewTitleField}</span>
            <input className="form-input" value={title} maxLength={200} placeholder={td.reviewTitlePlaceholder} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="gd-review-field">
            <span className="form-label">{td.reviewBusinessName}</span>
            <input className="form-input" value={businessName} maxLength={200} placeholder={td.reviewBusinessNamePlaceholder} onChange={(e) => setBusinessName(e.target.value)} />
          </label>
          <label className="gd-review-field">
            <span className="form-label">{td.reviewRating}</span>
            <select className="form-input" value={rating} aria-required={enabled} onChange={(e) => setRating(e.target.value)}>
              <option value="">{td.reviewRatingPlaceholder}</option>
              {GRAC_RATING_KEYS.map((key) => (
                <option key={key} value={key}>{td.reviewRatings[key]}</option>
              ))}
            </select>
          </label>
          <label className="gd-review-field">
            <span className="form-label">{td.reviewClassificationNumber}</span>
            <input className="form-input" value={classificationNumber} maxLength={100} placeholder={td.reviewClassificationNumberPlaceholder} onChange={(e) => setClassificationNumber(e.target.value)} />
          </label>
          <label className="gd-review-field">
            <span className="form-label">{td.reviewClassificationDate}</span>
            <input className="form-input" type="date" value={classificationDate} onChange={(e) => setClassificationDate(e.target.value)} />
          </label>
          <label className="gd-review-field">
            <span className="form-label">{td.reviewDeveloperReportNumber}</span>
            <input className="form-input" value={developerReportNumber} maxLength={100} placeholder={td.reviewDeveloperReportNumberPlaceholder} onChange={(e) => setDeveloperReportNumber(e.target.value)} />
          </label>
      </div>
      <fieldset className="gd-review-descriptors">
          <legend className="form-label">{td.reviewDescriptors}</legend>
          <p className="gd-review-descriptors-desc">{td.reviewDescriptorsDesc}</p>
          <div className="gd-review-descriptor-grid">
            {GRAC_CONTENT_DESCRIPTOR_KEYS.map((key) => (
              <label key={key} className="gd-review-descriptor-option">
                <input
                  type="checkbox"
                  checked={contentDescriptors.includes(key)}
                  onChange={() => setContentDescriptors((prev) => (
                    prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
                  ))}
                />
                <span>{td.reviewDescriptorLabels[key]}</span>
              </label>
            ))}
          </div>
      </fieldset>
      {error && <div className="gd-error">{error}</div>}
      <div className="gd-review-legal-hint">{td.reviewLegalHint}</div>
    </div>
  );
});

function CollaboratorSection({ gameId, game, setGame, isOwner, t }) {
  const tc = t.collab;
  const collaborators = game?.collaborators ?? [];

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [removingId, setRemovingId] = useState(null);

  async function handleInvite(e) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError('');
    try {
      const { collaborator } = await inviteCollaborator(gameId, inviteEmail.trim());
      setGame((prev) => ({
        ...prev,
        collaborators: [...(prev.collaborators ?? []), collaborator],
      }));
      setInviteEmail('');
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(userId) {
    setRemovingId(userId);
    try {
      await removeCollaborator(gameId, userId);
      setGame((prev) => ({
        ...prev,
        collaborators: (prev.collaborators ?? []).filter((c) =>
          (c._id ?? c.id ?? c) !== userId
        ),
      }));
    } catch (err) {
      alert(err.message);
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div>
      <h2 className="gd-section-title">{tc.title}</h2>
      <p className="gd-section-desc">{tc.desc}</p>

      {/* Collaborator list */}
      {collaborators.length === 0 ? (
        <p className="gd-empty-text">{tc.noCollaborators}</p>
      ) : (
        <div className="gd-collab-list">
          {collaborators.map((c) => {
            const cid = c._id ?? c.id ?? String(c);
            const name = c.name ?? '—';
            const email = c.email ?? '';
            return (
              <div key={cid} className="gd-collab-row">
                <div className="gd-collab-avatar">{name[0]?.toUpperCase()}</div>
                <div className="gd-collab-info">
                  <span className="gd-collab-name">{name}</span>
                  <span className="gd-collab-email">{email}</span>
                </div>
                {isOwner && (
                  <button
                    className="btn btn-ghost gd-collab-remove"
                    disabled={removingId === cid}
                    onClick={() => handleRemove(cid)}
                  >
                    {removingId === cid ? tc.removing : tc.remove}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Invite form — owner only */}
      {isOwner && (
        <form className="gd-collab-invite-form" onSubmit={handleInvite}>
          <input
            type="email"
            className="form-input"
            placeholder={tc.invitePlaceholder}
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            style={{ maxWidth: 320 }}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={inviting}>
            {inviting ? tc.inviting : tc.invite}
          </button>
          {inviteError && <span className="gd-error gd-collab-err">{inviteError}</span>}
        </form>
      )}
    </div>
  );
}

const STATUS_ORDER = ['open', 'in-progress', 'resolved', 'closed'];
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2, none: 3 };

function ReportsTab({
  reports, setReports, gameId, lang, t, td,
  reportSearch, setReportSearch,
  reportStatusFilter, setReportStatusFilter,
  reportPriorityFilter, setReportPriorityFilter,
  deletingReportId, setDeletingReportId,
  reportSort, setReportSort,
}) {
  const tt = t.triage;

  const filtered = reports
    .filter((r) => {
      if (reportStatusFilter && r.status !== reportStatusFilter) return false;
      if (reportPriorityFilter && r.priority !== reportPriorityFilter) return false;
      if (reportSearch) {
        const q = reportSearch.toLowerCase();
        const inTitle = r.title?.toLowerCase().includes(q);
        const inDesc  = r.description?.toLowerCase().includes(q);
        const inTag   = r.tags?.some((tag) => tag.toLowerCase().includes(q));
        if (!inTitle && !inDesc && !inTag) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (reportSort === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
      if (reportSort === 'priority') return (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  async function handleStatusChange(issueId, newStatus) {
    try {
      const updated = await updateIssue(issueId, { status: newStatus });
      setReports((prev) => prev.map((r) => (r._id === issueId ? { ...r, status: updated.status } : r)));
    } catch {
      // ignore
    }
  }

  async function handleDeleteReport(issueId) {
    if (!window.confirm(t.gameDetail.deleteReportConfirm)) return;
    setDeletingReportId(issueId);
    try {
      await deleteIssue(issueId);
      setReports((prev) => prev.filter((r) => r._id !== issueId));
    } catch {
      // ignore
    } finally {
      setDeletingReportId(null);
    }
  }

  if (reports.length === 0) return <p className="gd-empty-text">{td.noReports}</p>;

  return (
    <>
      {/* Filter bar */}
      <div className="gd-filter-bar">
        <input
          className="gd-filter-search"
          type="search"
          placeholder={tt.search}
          value={reportSearch}
          onChange={(e) => setReportSearch(e.target.value)}
        />
        <div className="gd-filter-chips">
          {['', ...STATUS_ORDER].map((s) => (
            <button
              key={s || 'all'}
              className={`gd-filter-chip${reportStatusFilter === s ? ' active' : ''}`}
              onClick={() => setReportStatusFilter(s)}
            >
              {s ? tt.statuses[s] : tt.filterAll}
            </button>
          ))}
        </div>
        <select
          className="gd-filter-select"
          value={reportPriorityFilter}
          onChange={(e) => setReportPriorityFilter(e.target.value)}
        >
          <option value="">{tt.filterPriority}</option>
          {['high', 'medium', 'low', 'none'].map((p) => (
            <option key={p} value={p}>{tt.priorities[p]}</option>
          ))}
        </select>
        <select
          className="gd-filter-select"
          value={reportSort}
          onChange={(e) => setReportSort(e.target.value)}
        >
          <option value="newest">{tt.sortNewest}</option>
          <option value="oldest">{tt.sortOldest}</option>
          <option value="priority">{tt.sortPriority}</option>
        </select>
        <span className="gd-filter-count">{filtered.length} / {reports.length}</span>
      </div>

      {filtered.length === 0 ? (
        <p className="gd-empty-text" style={{ marginTop: 16 }}>No reports match the current filter.</p>
      ) : (
        <div className="gd-report-list">
          {filtered.map((r) => (
            <div key={r._id} className="gd-report-row-wrap">
              <PageLink className="gd-report-row" to={`/dashboard/games/${gameId}/issues/${r._id}`}>
                <div className="gd-report-row-top">
                  <StatusBadge status={r.status} />
                  <PriorityDot priority={r.priority} />
                  <span className="gd-report-title">{r.title}</span>
                  {r.tags?.length > 0 && (
                    <span className="gd-report-tags">
                      {r.tags.map((tag) => <span key={tag} className="gd-tag-chip">{tag}</span>)}
                    </span>
                  )}
                </div>
                <div className="gd-report-meta">
                  {r.description && (
                    <span className="gd-report-desc">
                      {r.description.slice(0, 80)}{r.description.length > 80 ? '…' : ''}
                    </span>
                  )}
                  <span className="gd-report-date">{fmtDate(r.createdAt, lang)}</span>
                </div>
              </PageLink>
              {/* Quick status selector */}
              <select
                className="gd-report-status-select"
                value={r.status || 'open'}
                onChange={(e) => { e.stopPropagation(); handleStatusChange(r._id, e.target.value); }}
                onClick={(e) => e.preventDefault()}
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>{tt.statuses[s]}</option>
                ))}
              </select>
              <button
                className="gd-delete-btn"
                style={{ alignSelf: 'center', margin: '0 8px 0 0' }}
                disabled={deletingReportId === r._id}
                onClick={(e) => { e.preventDefault(); handleDeleteReport(r._id); }}
              >
                {t.gameDetail.deleteReport}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function StatusBadge({ status }) {
  if (!status || status === 'open') return <span className="gd-status-badge open">Open</span>;
  if (status === 'in-progress') return <span className="gd-status-badge in-progress">In Progress</span>;
  if (status === 'resolved') return <span className="gd-status-badge resolved">Resolved</span>;
  if (status === 'closed') return <span className="gd-status-badge closed">Closed</span>;
  return null;
}

function PriorityDot({ priority }) {
  if (!priority || priority === 'none') return null;
  return <span className={`gd-priority-dot ${priority}`} title={priority} />;
}

export function CodeBlock({ filename, code }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const lang = filename.endsWith('.cs') ? 'csharp' : 'javascript';
  const highlighted = hljs.highlight(code, { language: lang }).value;

  function handleCopy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="gi-code-wrapper">
      <div className="gi-code-header">
        <span className="gi-code-filename">{filename}</span>
        <div className="gi-code-actions">
          <button className={`gi-code-btn${copied ? ' copied' : ''}`} onClick={handleCopy}>
            {copied ? t.gameDetail.copied : t.gameDetail.copy}
          </button>
          <button className="gi-code-btn" onClick={handleDownload}>
            {t.gameDetail.download}
          </button>
        </div>
      </div>
      <pre className="gi-code-block">
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </div>
  );
}

export default function GameDetailPage() {
  const { gameId, id: articleId } = useParams();
  const navigate = useLocaleNavigate();
  const location = useLocation();
  const { lang, t } = useI18n();
  const { user } = useAuth();

  const [game, setGame] = useState(null);
  const [builds, setBuilds] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const isArticleRoute = location.pathname.includes(`/dashboard/games/${gameId}/articles`);
  const isArticleEditorRoute = isArticleRoute && (location.pathname.endsWith('/new') || location.pathname.endsWith('/edit'));
  const [tab, setTab] = useState(isArticleRoute ? 'articles' : 'builds');
  const [isOwner, setIsOwner] = useState(false);
  const [arcadeDirty, setArcadeDirty] = useState(false);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [pendingSettingsNavigation, setPendingSettingsNavigation] = useState(null);
  const handleArcadeDirtyChange = useCallback((dirty) => setArcadeDirty(dirty), []);
  const handleReviewDirtyChange = useCallback((dirty) => setReviewDirty(dirty), []);
  const arcadeSettingsRef = useRef(null);
  const reviewSettingsRef = useRef(null);

  const [uploading,     setUploading]     = useState(false);
  const [uploadError,   setUploadError]   = useState('');
  const [uploadVersion, setUploadVersion] = useState('');
  const [canvasWidth,   setCanvasWidth]   = useState('1920');
  const [canvasHeight,  setCanvasHeight]  = useState('1080');
  const fileInputRef = useRef(null);
  const streamingAssetsRef = useRef(null);

  const [deletingBuildId, setDeletingBuildId] = useState(null);

  const [editingWebhook, setEditingWebhook] = useState(false);
  const [webhookVal, setWebhookVal] = useState('');
  const [savingWebhook, setSavingWebhook] = useState(false);
  const webhookDirty = editingWebhook && webhookVal !== (game?.discordWebhookUrl || '');
  const settingsDirty = tab === 'settings' && (arcadeDirty || reviewDirty || webhookDirty);
  const settingsBlocker = useBlocker(settingsDirty);

  // Reports filter/sort state (client-side)
  const [reportSearch, setReportSearch] = useState('');
  const [reportStatusFilter, setReportStatusFilter] = useState('');
  const [reportPriorityFilter, setReportPriorityFilter] = useState('');
  const [reportSort, setReportSort] = useState('newest');
  const [deletingReportId, setDeletingReportId] = useState(null);

  useEffect(() => {
    setTab((current) => isArticleRoute
      ? 'articles'
      : current === 'articles' ? 'builds' : current);
  }, [isArticleRoute]);

  useEffect(() => {
    if (settingsBlocker.state !== 'blocked') return;
    setPendingSettingsNavigation(() => () => settingsBlocker.proceed());
  }, [settingsBlocker.state, settingsBlocker.location]);

  useEffect(() => {
    if (!settingsDirty) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [settingsDirty]);

  useEffect(() => {
    Promise.all([getGame(gameId), getGameReports(gameId)])
      .then(([{ game, builds }, { issues }]) => {
        setGame(game);
        setBuilds(builds);
        setReports(issues);
        setIsOwner(game.isOwner ?? true);
        setWebhookVal(game.discordWebhookUrl || '');
      })
      .catch((err) => { console.error('[GameDetail] load failed:', err); navigate('/dashboard', { replace: true }); })
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
      const { build } = await uploadBuild(gameId, Array.from(files), {
        version:      uploadVersion,
        canvasWidth:  parseInt(canvasWidth,  10) || 1920,
        canvasHeight: parseInt(canvasHeight, 10) || 1080,
        streamingAssetsZip: streamingAssetsRef.current?.files?.[0] || null,
      });
      setBuilds((prev) => [build, ...prev]);
      setUploadVersion('');
      setCanvasWidth('1920');
      setCanvasHeight('1080');
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (streamingAssetsRef.current) streamingAssetsRef.current.value = '';
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

  async function handleDeleteBuild(buildId) {
    if (!window.confirm(td.deleteConfirm)) return;
    setDeletingBuildId(buildId);
    try {
      await deleteBuild(gameId, buildId);
      setBuilds((prev) => prev.filter((b) => b._id !== buildId));
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingBuildId(null);
    }
  }

  async function saveWebhook() {
    if (!webhookDirty) return true;
    setSavingWebhook(true);
    try {
      const { game: updated } = await updateGame(gameId, { discordWebhookUrl: webhookVal });
      setGame((prev) => ({ ...prev, ...updated }));
      setEditingWebhook(false);
      return true;
    } catch (err) {
      alert(err.message);
      return false;
    } finally {
      setSavingWebhook(false);
    }
  }

  async function handleSaveSettings() {
    if (!settingsDirty || savingSettings) return;
    const shouldSaveWebhook = webhookDirty;
    setSavingSettings(true);
    try {
      if (await arcadeSettingsRef.current?.save() === false) return;
      if (await reviewSettingsRef.current?.save() === false) return;
      if (shouldSaveWebhook && await saveWebhook() === false) return;
    } finally {
      setSavingSettings(false);
    }
  }

  function handleRevertSettings() {
    arcadeSettingsRef.current?.revert();
    reviewSettingsRef.current?.revert();
    setWebhookVal(game?.discordWebhookUrl || '');
    setEditingWebhook(false);
  }

  function handleEditWebhook() {
    setWebhookVal(game?.discordWebhookUrl || '');
    setEditingWebhook(true);
  }

  function handleCancelWebhook() {
    setWebhookVal(game?.discordWebhookUrl || '');
    setEditingWebhook(false);
  }

  function performTabChange(nextTab) {
    if (nextTab === 'articles') {
      navigate(`/dashboard/games/${gameId}/articles`);
      return;
    }
    setTab(nextTab);
    if (isArticleRoute) {
      navigate(`/dashboard/games/${gameId}`);
    }
  }

  function confirmSettingsNavigation() {
    const action = pendingSettingsNavigation;
    setPendingSettingsNavigation(null);
    action?.();
  }

  function cancelSettingsNavigation() {
    if (settingsBlocker.state === 'blocked') settingsBlocker.reset();
    setPendingSettingsNavigation(null);
  }

  function handleDashboardNavigate(event) {
    if (tab !== 'settings' || !settingsDirty) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const href = event.currentTarget.getAttribute('href');
    navigate(href);
  }

  function selectTab(nextTab) {
    if (nextTab !== 'settings' && nextTab !== 'articles' && tab === 'settings' && settingsDirty) {
      setPendingSettingsNavigation(() => () => performTabChange(nextTab));
      return;
    }
    performTabChange(nextTab);
  }

  const td = t.gameDetail;

  if (loading) {
    return (
      <div className="dash-layout">
        <DashSidebar user={user} active="dashboard" />
        <main className="dash-main">
          <p className="dash-loading">{t.loading}</p>
        </main>
      </div>
    );
  }

  const playUrl = `/play/${game.slug}`;

  return (
    <>
    <div className="dash-layout">
      <DashSidebar user={user} backLabel={td.back} storage={<StorageBar label={td.totalStorage} />} onNavigate={handleDashboardNavigate} />

      <main className={`dash-main${settingsDirty ? ' has-settings-bar' : ''}`}>
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
          <button className={`gd-tab${tab === 'builds' ? ' active' : ''}`} onClick={() => selectTab('builds')}>
            {td.builds} ({builds.length})
          </button>
          <button className={`gd-tab${tab === 'reports' ? ' active' : ''}`} onClick={() => selectTab('reports')}>
            {td.reports} ({reports.length})
          </button>
          <button className={`gd-tab${tab === 'settings' ? ' active' : ''}`} onClick={() => selectTab('settings')}>
            {td.settings}
          </button>
          <button className={`gd-tab${tab === 'articles' ? ' active' : ''}`} onClick={() => selectTab('articles')}>
            {td.articles}
          </button>
          <button className={`gd-tab${tab === 'integration' ? ' active' : ''}`} onClick={() => selectTab('integration')}>
            {td.integration}
          </button>
          <button className={`gd-tab${tab === 'serverIntegration' ? ' active' : ''}`} onClick={() => selectTab('serverIntegration')}>
            {td.serverIntegration}
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
              <div className="gd-upload-row" style={{ marginTop: 8 }}>
                <label className="btn btn-ghost gd-file-label">
                  {td.streamingAssetsLabel}
                  <input
                    ref={streamingAssetsRef}
                    type="file"
                    accept=".zip"
                    style={{ display: 'none' }}
                  />
                </label>
                <span style={{ fontSize: 12, color: '#86868b', alignSelf: 'center' }}>{td.streamingAssetsHint}</span>
              </div>
              <div className="gd-upload-row" style={{ marginTop: 8 }}>
                <span style={{ fontSize: 13, color: '#6e6e73', alignSelf: 'center' }}>Canvas</span>
                <input
                  type="number"
                  className="form-input gd-version-input"
                  placeholder="Width (px)"
                  value={canvasWidth}
                  min="1"
                  onChange={(e) => setCanvasWidth(e.target.value)}
                  style={{ width: 110 }}
                />
                <span style={{ fontSize: 13, color: '#6e6e73', alignSelf: 'center' }}>×</span>
                <input
                  type="number"
                  className="form-input gd-version-input"
                  placeholder="Height (px)"
                  value={canvasHeight}
                  min="1"
                  onChange={(e) => setCanvasHeight(e.target.value)}
                  style={{ width: 110 }}
                />
              </div>
              <p className="gd-upload-hint">{td.uploadHint}</p>
              {uploadError && <div className="gd-error">{uploadError}</div>}
            </form>

            {builds.length === 0 ? (
              <p className="gd-empty-text">{td.noBuilds}</p>
            ) : (
              <>
                {(() => {
                  const total = builds.reduce((sum, b) => sum + (b.storageBytes || 0), 0);
                  const label = formatBytes(total);
                  return label ? (
                    <p className="gd-storage-summary">{td.totalStorage}: <strong>{label}</strong></p>
                  ) : null;
                })()}
                <div className="gd-build-list">
                  {builds.map((b) => (
                    <div key={b._id} className={`gd-build-row${b.isActive ? ' active' : ''}`}>
                      <div className="gd-build-meta">
                        {b.isActive && <span className="gd-badge">{td.active}</span>}
                        <span className="gd-build-version">{b.version || '—'}</span>
                        {(b.canvasWidth || b.canvasHeight) && (
                          <span className="gd-build-canvas" style={{ fontSize: 12, color: '#86868b', fontVariantNumeric: 'tabular-nums' }}>
                            {b.canvasWidth ?? 1920}×{b.canvasHeight ?? 1080}
                          </span>
                        )}
                        {formatBytes(b.storageBytes) && (
                          <span className="gd-build-size" style={{ fontSize: 12, color: '#86868b' }}>
                            {formatBytes(b.storageBytes)}
                          </span>
                        )}
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
                        {b.files?.other?.some((f) => f.startsWith('StreamingAssets/')) && (
                          <span className="gd-file-chip">StreamingAssets</span>
                        )}
                      </div>
                      <div className="gd-build-actions">
                        {!b.isActive && (
                          <button className="btn btn-ghost gd-activate-btn" onClick={() => handleActivate(b._id)}>
                            {td.setActive}
                          </button>
                        )}
                        <button
                          className="btn btn-ghost gd-delete-btn"
                          onClick={() => handleDeleteBuild(b._id)}
                          disabled={deletingBuildId === b._id}
                        >
                          {deletingBuildId === b._id ? td.deleting : td.deleteBuild}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Reports ── */}
        {tab === 'reports' && (
          <div className="gd-section">
            <ReportsTab
              reports={reports}
              setReports={setReports}
              gameId={gameId}
              lang={lang}
              t={t}
              td={td}
              reportSearch={reportSearch}
              setReportSearch={setReportSearch}
              reportStatusFilter={reportStatusFilter}
              setReportStatusFilter={setReportStatusFilter}
              reportPriorityFilter={reportPriorityFilter}
              setReportPriorityFilter={setReportPriorityFilter}
              reportSort={reportSort}
              setReportSort={setReportSort}
              deletingReportId={deletingReportId}
              setDeletingReportId={setDeletingReportId}
            />
          </div>
        )}

        {/* ── Game articles ── */}
        {tab === 'articles' && (
          isArticleEditorRoute ? (
            <AdminBlogEditorPage
              embedded
              gameId={gameId}
              articleId={articleId}
              game={game}
            />
          ) : (
            <AdminBlogPage embedded gameId={gameId} game={game} />
          )
        )}

        {/* ── Integration ── */}
        {tab === 'integration' && (
          <div className="gi-container">
            <p className="gi-intro">{td.integrationIntro}</p>

            <div className="gi-step">
              <h2 className="gi-step-title">{td.installTitle}</h2>
              <p className="gi-step-desc">{td.installStep1}</p>
              <div className="gi-step-hint">{td.installStep1Hint}</div>
              <CodeBlock filename="IssueTrackerIntegration.cs" code={INTEGRATION_CS} />
              <CodeBlock filename="IssueTracker.jslib" code={INTEGRATION_JSLIB} />
              <p className="gi-step-desc" style={{ marginTop: 24 }}>{td.installStep2}</p>
              <div className="gi-step-warn">{td.installStep2Warn}</div>
            </div>

            <div className="gi-step">
              <h2 className="gi-step-title">{td.customStateTitle}</h2>
              <p className="gi-step-desc">{td.customStateDesc}</p>
              <CodeBlock filename="CustomStateExample.cs" code={CUSTOM_STATE_CS} />
            </div>

            <div className="gi-step">
              <h2 className="gi-step-title">{td.buildSettingsTitle}</h2>
              <p className="gi-step-desc">{td.buildSettingsDesc}</p>
              <div className="gi-step-hint">{td.buildSettingsHint}</div>
            </div>

            <div className="gi-step">
              <h2 className="gi-step-title">{td.gameOverTitle}</h2>
              <p className="gi-step-desc">{td.gameOverDesc}</p>
              <CodeBlock filename="GameOverExample.cs" code={GAME_OVER_CS} />
            </div>
          </div>
        )}

        {/* ── LiveOps settings ── */}
        {tab === 'serverIntegration' && (
          <ServerIntegrationTab gameId={gameId} />
        )}

        {/* ── Settings ── */}
        {tab === 'settings' && (
          <div className="gd-section">
            {/* Arcade visibility — owner only */}
            {isOwner && (
              <>
                <ArcadeSection
                  ref={arcadeSettingsRef}
                  gameId={gameId}
                  game={game}
                  setGame={setGame}
                  builds={builds}
                  t={t}
                  lang={lang}
                  onDirtyChange={handleArcadeDirtyChange}
                />
                <div style={{ marginTop: 40 }} />
                <ReviewInfoSection
                  ref={reviewSettingsRef}
                  gameId={gameId}
                  game={game}
                  setGame={setGame}
                  t={t}
                  onDirtyChange={handleReviewDirtyChange}
                />
                <div style={{ marginTop: 40 }} />
              </>
            )}

            {/* Discord webhook — owner only */}
            {isOwner && (
              <>
                <h2 className="gd-section-title">{td.discordTitle}</h2>
                <p className="gd-section-desc">{td.discordDesc}</p>
                {editingWebhook ? (
                  <div className="gd-webhook-form">
                    <input
                      type="url"
                      className="form-input"
                      placeholder="https://discord.com/api/webhooks/…"
                      value={webhookVal}
                      onChange={(e) => setWebhookVal(e.target.value)}
                      disabled={savingSettings || savingWebhook}
                      autoFocus
                    />
                    <div className="gd-webhook-actions">
                      <button type="button" className="btn btn-ghost" onClick={handleCancelWebhook} disabled={savingSettings || savingWebhook}>
                        {td.cancel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="gd-webhook-display">
                    <span className="gd-webhook-val">
                      {game.discordWebhookUrl || <em className="gd-not-set">{td.notSet}</em>}
                    </span>
                    <button className="btn btn-ghost" onClick={handleEditWebhook}>{td.edit}</button>
                  </div>
                )}
                <div style={{ marginTop: 32 }} />
              </>
            )}

            {/* Collaborators */}
            <CollaboratorSection
              gameId={gameId}
              game={game}
              setGame={setGame}
              isOwner={isOwner}
              t={t}
              td={td}
            />
          </div>
        )}
      </main>
    </div>
    {settingsDirty && (
      <div className="gd-unsaved-bar" role="status" aria-live="polite">
        <div className="gd-unsaved-copy">
          <span className="gd-unsaved-icon" aria-hidden="true">!</span>
          <div>
            <strong>{td.settingsUnsaved}</strong>
            <span>{td.settingsUnsavedDesc}</span>
          </div>
        </div>
        <div className="gd-unsaved-actions">
          <button type="button" className="btn btn-ghost" onClick={handleRevertSettings} disabled={savingSettings}>
            {td.settingsDiscard}
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSaveSettings} disabled={savingSettings}>
            {savingSettings ? td.settingsSaving : td.settingsSave}
          </button>
        </div>
      </div>
    )}
    {pendingSettingsNavigation && (
      <Modal title={td.settingsLeaveTitle} onClose={cancelSettingsNavigation}>
        <p className="gd-settings-leave-message">{td.settingsLeaveMessage}</p>
        <div className="si-modal-footer">
          <button type="button" className="btn btn-ghost si-modal-btn" onClick={cancelSettingsNavigation}>
            {td.settingsStay}
          </button>
          <button type="button" className="btn btn-primary si-modal-btn" onClick={confirmSettingsNavigation}>
            {td.settingsLeave}
          </button>
        </div>
      </Modal>
    )}
    </>
  );
}
