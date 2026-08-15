import React, { useCallback, useEffect, useState } from 'react';
import {
  getTranslation,
  retranslate as requestRetranslate,
  saveTranslation,
} from '../api.js';
import { useI18n } from '../i18n.jsx';
import './TranslationEditorPanel.css';

const TRANSLATION_STATUSES = new Set(['pending', 'translating', 'ready', 'stale', 'failed']);

function isReady(row) {
  return Boolean(row && ['ready', 'stale'].includes(row.status));
}

export function useTranslationEditor(refType, refId) {
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(Boolean(refId));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!refId) {
      setRow(null);
      setLoading(false);
      return null;
    }

    setLoading(true);
    setError('');
    try {
      const result = await getTranslation(refType, refId, 'en');
      setRow(result.translation || null);
      return result.translation || null;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [refType, refId]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const save = useCallback(async (fields) => {
    setBusy('save');
    setError('');
    try {
      const result = await saveTranslation(refType, refId, fields, 'en');
      setRow(result.translation || null);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setBusy('');
    }
  }, [refType, refId]);

  const retranslate = useCallback(async () => {
    if (!refId) return null;
    setBusy('retranslate');
    setError('');
    try {
      const result = await requestRetranslate(refType, refId, 'en');
      setRow(result.translation || null);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setBusy('');
    }
  }, [refType, refId]);

  return { row, loading, busy, error, save, retranslate, refresh };
}

function SourceField({ label, value, multiline = false }) {
  return (
    <div className="translation-editor-source-field">
      <span className="translation-editor-source-label">{label}</span>
      <div className={`translation-editor-source-value${multiline ? ' multiline' : ''}`}>
        {value || ''}
      </div>
    </div>
  );
}

export default function TranslationEditorPanel({
  refType,
  refId,
  lang,
  sourceFields = {},
  translation,
  onRetranslate,
}) {
  const { t } = useI18n();
  const isEnglish = lang === 'en';
  const row = translation?.row;
  const statusKey = TRANSLATION_STATUSES.has(row?.status) ? row.status : 'pending';
  const statusLabel = t.blog.translationState[statusKey];
  const hasReadyTranslation = isReady(row);
  const waitingForQueue = ['pending', 'translating'].includes(statusKey);
  const isGame = refType === 'Game';
  const busy = Boolean(translation?.busy);
  const sourceTags = Array.isArray(sourceFields.tags)
    ? sourceFields.tags.join(', ')
    : sourceFields.tags || '';

  return (
    <section
      className={`translation-editor-panel${isEnglish ? ' translation' : ' source'}`}
      aria-busy={translation?.loading || busy}
    >
      <div className="translation-editor-strip">
        <div className="translation-editor-locale">
          <span className="translation-editor-kicker">{t.blog.editorLocale.label}</span>
          <strong>{isEnglish ? t.blog.editorLocale.translation : t.blog.editorLocale.source}</strong>
        </div>
        <span
          className={`translation-editor-status ${statusKey}`}
          aria-label={statusLabel}
        >
          {statusLabel}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm translation-editor-retranslate"
          onClick={() => onRetranslate?.()}
          disabled={!refId || translation?.loading || busy}
        >
          {t.blog.retranslate}
        </button>
      </div>

      {row?.status === 'stale' && (
        <p className="translation-editor-stale">
          {t.blog.translationStaleExplanation}
        </p>
      )}

      {translation?.error && (
        <p className="translation-editor-error" role="alert">{translation.error}</p>
      )}

      {isEnglish && !hasReadyTranslation && (
        <div className="translation-editor-empty">
          <div className="translation-editor-source">
            <span className="translation-editor-kicker">{t.blog.editorLocale.source}</span>
            <div className="translation-editor-source-grid">
              {isGame ? (
                <>
                  <SourceField
                    label={t.gameDetail.arcadeDescription}
                    value={sourceFields.description}
                    multiline
                  />
                  <SourceField
                    label={t.gameDetail.arcadeLongDescription}
                    value={sourceFields.longDescription}
                    multiline
                  />
                </>
              ) : (
                <>
                  <SourceField label={t.blog.fieldTitle} value={sourceFields.title} />
                  <SourceField label={t.blog.fieldSummary} value={sourceFields.summary} multiline />
                  <SourceField label={t.blog.fieldContent} value={sourceFields.content} multiline />
                  <SourceField label={t.blog.fieldTags} value={sourceTags} />
                </>
              )}
            </div>
          </div>
          {waitingForQueue && (
            <p className="translation-editor-queue-note">{t.blog.translationQueueEmpty}</p>
          )}
        </div>
      )}
    </section>
  );
}
