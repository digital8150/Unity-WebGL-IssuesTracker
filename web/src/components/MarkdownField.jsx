import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n.jsx';
import { uploadBlogImage } from '../api.js';
import { renderMarkdown } from '../utils/renderMarkdown.js';
import { TOOLBAR_ACTIONS, applyToolbarAction } from '../utils/markdownToolbar.js';
import '../styles/markdown-body.css';
import './MarkdownField.css';

const MAX_LENGTH = 20000;

export default function MarkdownField({
  id,
  label,
  hint = '',
  placeholder = '',
  value = '',
  onChange,
  disabled = false,
  sourceOnly = false,
  maxLength = MAX_LENGTH,
}) {
  const { t } = useI18n();
  const [viewMode, setViewMode] = useState('write');
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef(null);
  const uploadInputRef = useRef(null);
  const valueRef = useRef(String(value ?? ''));

  const text = String(value ?? '');
  useEffect(() => {
    valueRef.current = text;
  }, [text]);

  function updateValue(nextValue) {
    const nextText = String(nextValue ?? '');
    valueRef.current = nextText;
    onChange?.(nextText);
  }

  async function uploadImageFile(file) {
    const textarea = textareaRef.current;
    if (!file || !textarea || disabled || sourceOnly) return;
    setError('');
    const { selectionStart, selectionEnd } = textarea;
    const placeholderText = '![' + t.blog.uploading + '...]()';
    const current = valueRef.current;
    updateValue(current.slice(0, selectionStart) + placeholderText + current.slice(selectionEnd));

    try {
      const { imageUrl } = await uploadBlogImage(file);
      const imageMarkdown = '![' + file.name.replace(/[\[\]]/g, '') + '](' + imageUrl + ')';
      updateValue(valueRef.current.replace(placeholderText, imageMarkdown));
      requestAnimationFrame(() => {
        textarea.focus();
        const nextPosition = selectionStart + imageMarkdown.length;
        textarea.setSelectionRange(nextPosition, nextPosition);
      });
    } catch (err) {
      setError(t.blog.uploadFailed + ' (' + err.message + ')');
      updateValue(valueRef.current.replace(placeholderText, ''));
    }
  }

  function handleToolbar(action) {
    const textarea = textareaRef.current;
    if (!textarea || disabled || sourceOnly) return;
    if (action.id === 'img') {
      uploadInputRef.current?.click();
      return;
    }
    const { newText, newCursorStart, newCursorEnd } = applyToolbarAction(textarea, action);
    updateValue(newText);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorStart, newCursorEnd);
    });
  }

  function handleKeyDown(event) {
    if (event.key !== 'Tab' || disabled || sourceOnly) return;
    event.preventDefault();
    const textarea = event.target;
    const { selectionStart, selectionEnd } = textarea;
    const current = valueRef.current;
    updateValue(current.slice(0, selectionStart) + '  ' + current.slice(selectionEnd));
    requestAnimationFrame(() => textarea.setSelectionRange(selectionStart + 2, selectionStart + 2));
  }

  function handlePaste(event) {
    if (disabled || sourceOnly) return;
    const items = event.clipboardData?.items;
    const imageItem = Array.from(items || []).find((item) => item.type.startsWith('image/'));
    const file = imageItem?.getAsFile?.();
    if (!file) return;
    event.preventDefault();
    uploadImageFile(file);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragOver(false);
    if (disabled || sourceOnly) return;
    const file = Array.from(event.dataTransfer?.files || []).find((item) => item.type.startsWith('image/'));
    if (file) uploadImageFile(file);
  }

  return (
    <div className={'markdown-field' + (disabled ? ' is-disabled' : '')}>
      {label && (
        <label className="form-label" htmlFor={id}>
          {label}
          {sourceOnly && <small> · {t.blog.editorLocale.source}</small>}
        </label>
      )}
      {hint && <p className="markdown-field-hint">{hint}</p>}

      <div className="markdown-field-tabs" role="tablist" aria-label={label}>
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'write'}
          className={'markdown-field-tab' + (viewMode === 'write' ? ' active' : '')}
          onClick={() => setViewMode('write')}
        >
          {t.blog.writeTab}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'preview'}
          className={'markdown-field-tab' + (viewMode === 'preview' ? ' active' : '')}
          onClick={() => setViewMode('preview')}
        >
          {t.blog.previewTab}
        </button>
      </div>

      {viewMode === 'write' ? (
        <>
          <div className="markdown-field-toolbar" role="toolbar" aria-label="Markdown toolbar">
            {TOOLBAR_ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                className="markdown-field-tool"
                title={action.id}
                onClick={() => handleToolbar(action)}
                disabled={disabled || sourceOnly}
              >
                {action.label}
              </button>
            ))}
            <input
              ref={uploadInputRef}
              className="markdown-field-file"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) uploadImageFile(file);
                event.target.value = '';
              }}
              disabled={disabled || sourceOnly}
            />
          </div>
          <div
            className={'markdown-field-editor' + (isDragOver ? ' dragover' : '')}
            onDragOver={(event) => {
              event.preventDefault();
              if (!disabled && !sourceOnly) setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
          >
            {isDragOver && (
              <div className="markdown-field-drag-overlay" aria-hidden="true">
                <span>🖼️</span>
                <strong>{t.blog.dragOverText}</strong>
              </div>
            )}
            <textarea
              ref={textareaRef}
              id={id}
              className="markdown-field-textarea"
              value={text}
              maxLength={maxLength}
              placeholder={placeholder}
              onChange={(event) => updateValue(event.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              spellCheck={false}
              disabled={disabled || sourceOnly}
            />
          </div>
        </>
      ) : (
        <div
          className="markdown-field-preview markdown-body"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
        />
      )}

      {error && <p className="markdown-field-error" role="alert">{error}</p>}
      <div className="markdown-field-counter">{text.length} / {maxLength}</div>
    </div>
  );
}
