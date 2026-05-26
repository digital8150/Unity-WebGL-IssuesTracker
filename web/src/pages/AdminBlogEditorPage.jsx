import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import { createBlogPost, updateBlogPost, getAdminBlogPost } from '../api.js';
import BrandLogo from '../components/BrandLogo.jsx';
import './DashboardPage.css';
import './BlogPostPage.css';
import './AdminBlogEditorPage.css';

// ── Markdown renderer ─────────────────────────────────────────────────────────
marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(raw) {
  const html = marked.parse(raw || '');
  return DOMPurify.sanitize(html);
}

// ── Slug helpers ──────────────────────────────────────────────────────────────
function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Toolbar button definitions ────────────────────────────────────────────────
const TOOLBAR_ACTIONS = [
  { id: 'h2',     label: 'H2',   wrap: ['## ', ''],           block: true  },
  { id: 'h3',     label: 'H3',   wrap: ['### ', ''],          block: true  },
  { id: 'bold',   label: 'B',    wrap: ['**', '**'],          block: false },
  { id: 'italic', label: 'I',    wrap: ['_', '_'],            block: false },
  { id: 'code',   label: '`',    wrap: ['`', '`'],            block: false },
  { id: 'codebl', label: '{}',   wrap: ['```\n', '\n```'],    block: true  },
  { id: 'link',   label: '🔗',   wrap: ['[', '](url)'],       block: false },
  { id: 'ul',     label: '• ',   wrap: ['- ', ''],            block: true  },
  { id: 'ol',     label: '1.',   wrap: ['1. ', ''],           block: true  },
  { id: 'quote',  label: '❝',    wrap: ['> ', ''],            block: true  },
  { id: 'hr',     label: '—',    insert: '\n\n---\n\n',       block: true  },
  { id: 'img',    label: '🖼',    wrap: ['![alt](', ')'],      block: false },
];

function applyToolbarAction(textarea, action) {
  const { selectionStart: s, selectionEnd: e, value } = textarea;
  const selected = value.slice(s, e);

  let newText, newCursorStart, newCursorEnd;

  if (action.insert) {
    newText = value.slice(0, s) + action.insert + value.slice(e);
    newCursorStart = newCursorEnd = s + action.insert.length;
  } else {
    const [before, after] = action.wrap;
    newText = value.slice(0, s) + before + selected + after + value.slice(e);
    newCursorStart = s + before.length;
    newCursorEnd = newCursorStart + selected.length;
  }

  return { newText, newCursorStart, newCursorEnd };
}

// ── Editor view modes ─────────────────────────────────────────────────────────
const VIEW_MODES = ['write', 'split', 'preview'];

export default function AdminBlogEditorPage() {
  const { id } = useParams(); // undefined if new post
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user: me, logout } = useAuth();
  const { lang, toggleLang, t } = useI18n();

  // Form state
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [tags, setTags] = useState('');
  const [published, setPublished] = useState(false);

  // UI state
  const [viewMode, setViewMode] = useState('split');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadingPost, setLoadingPost] = useState(isEdit);

  const textareaRef = useRef(null);
  const previewRef = useRef(null);

  // Load existing post
  useEffect(() => {
    if (!isEdit) return;
    getAdminBlogPost(id)
      .then(({ post }) => {
        setTitle(post.title || '');
        setSlug(post.slug || '');
        setSlugManual(true);
        setSummary(post.summary || '');
        setContent(post.content || '');
        setCoverImageUrl(post.coverImageUrl || '');
        setTags((post.tags || []).join(', '));
        setPublished(post.published || false);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoadingPost(false));
  }, [id, isEdit]);

  // Auto-slug from title
  useEffect(() => {
    if (!slugManual) setSlug(slugify(title));
  }, [title, slugManual]);

  // Apply highlight.js to preview
  useEffect(() => {
    if (previewRef.current) {
      previewRef.current.querySelectorAll('pre code').forEach(el => {
        hljs.highlightElement(el);
      });
    }
  }, [content, viewMode]);

  // Toolbar action handler
  const handleToolbar = useCallback((action) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { newText, newCursorStart, newCursorEnd } = applyToolbarAction(ta, action);
    setContent(newText);
    // Restore cursor after state update
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newCursorStart, newCursorEnd);
    });
  }, []);

  // Tab key in textarea → indent
  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.target;
      const { selectionStart: s, selectionEnd: end, value } = ta;
      const newVal = value.slice(0, s) + '  ' + value.slice(end);
      setContent(newVal);
      requestAnimationFrame(() => ta.setSelectionRange(s + 2, s + 2));
    }
  };

  async function handleSave(publishOverride) {
    const willPublish = publishOverride !== undefined ? publishOverride : published;
    setError('');
    setSaving(true);
    try {
      const data = {
        title: title.trim(),
        slug: slug.trim(),
        summary: summary.trim(),
        content,
        coverImageUrl: coverImageUrl.trim(),
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        published: willPublish,
      };
      if (isEdit) {
        await updateBlogPost(id, data);
      } else {
        await createBlogPost(data);
      }
      navigate('/admin/blog');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

  const previewHtml = renderMarkdown(content);

  return (
    <div className="dash-layout abe-layout">
      {/* Sidebar */}
      <aside className="dash-sidebar">
        <Link to="/" className="dash-logo"><BrandLogo /></Link>
        <nav className="dash-nav">
          <Link className="dash-nav-item" to="/dashboard">{t.nav.dashboard}</Link>
          <Link className="dash-nav-item" to="/arcade">{t.nav.arcade}</Link>
          <Link className="dash-nav-item active" to="/admin/blog">{t.nav.blogAdmin} CMS</Link>
          {me?.role === 'admin' && (
            <Link className="dash-nav-item" to="/admin/users">{t.nav.admin}</Link>
          )}
        </nav>
        <div className="dash-sidebar-footer">
          <div className="dash-user">
            <div className="dash-avatar">{me?.name?.[0]?.toUpperCase()}</div>
            <div className="dash-user-info">
              <div className="dash-user-name">{me?.name}</div>
              <div className="dash-user-email">{me?.email}</div>
            </div>
          </div>
          <button className="dash-footer-btn" onClick={toggleLang}>
            {lang === 'en' ? '한국어' : 'English'}
          </button>
          <button className="dash-footer-btn" onClick={handleLogout}>{t.nav.signOut}</button>
        </div>
      </aside>

      {/* Editor main */}
      <div className="abe-main">
        {/* Top bar */}
        <div className="abe-topbar">
          <div className="abe-topbar-left">
            <Link to="/admin/blog" className="abe-back">← {t.blog.adminTitle}</Link>
            <h1 className="abe-page-title">
              {isEdit ? t.blog.editorTitleEdit : t.blog.editorTitleNew}
            </h1>
          </div>

          <div className="abe-topbar-right">
            {/* View mode toggle */}
            <div className="abe-view-toggle">
              {VIEW_MODES.map(mode => (
                <button
                  key={mode}
                  className={`abe-view-btn${viewMode === mode ? ' active' : ''}`}
                  onClick={() => setViewMode(mode)}
                >
                  {mode === 'write' ? t.blog.writeTab
                    : mode === 'split' ? t.blog.splitTab
                    : t.blog.previewTab}
                </button>
              ))}
            </div>

            {/* Publish toggle */}
            <label className="abe-publish-toggle">
              <input
                type="checkbox"
                checked={published}
                onChange={e => setPublished(e.target.checked)}
              />
              <span className="abe-toggle-track">
                <span className="abe-toggle-thumb" />
              </span>
              <span className="abe-toggle-label">
                {published ? t.blog.published : t.blog.draft}
              </span>
            </label>

            {/* Save buttons */}
            <button
              className="btn btn-ghost abe-save-btn"
              disabled={saving}
              onClick={() => handleSave(false)}
            >
              {saving ? t.blog.saving : t.blog.saveDraft}
            </button>
            <button
              className="btn btn-primary btn-sm abe-publish-btn"
              disabled={saving}
              onClick={() => handleSave(true)}
            >
              {saving ? t.blog.saving : t.blog.publish}
            </button>
          </div>
        </div>

        {error && <div className="abe-error">{error}</div>}

        {loadingPost ? (
          <div className="abe-loading">{t.blog.loading}</div>
        ) : (
          <div className="abe-body">
            {/* Meta fields */}
            <div className="abe-meta-row">
              <div className="abe-meta-field abe-field-title">
                <input
                  id="abe-title"
                  className="abe-title-input"
                  placeholder={t.blog.fieldTitle + '…'}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>
              <div className="abe-meta-side">
                <div className="abe-meta-group">
                  <label className="abe-label">{t.blog.fieldSlug}</label>
                  <div className="abe-slug-row">
                    <input
                      id="abe-slug"
                      className="form-input abe-input"
                      value={slug}
                      onChange={e => { setSlug(e.target.value); setSlugManual(true); }}
                      onBlur={() => { if (!slug.trim()) setSlugManual(false); }}
                      placeholder="my-post-slug"
                    />
                    {!slugManual && (
                      <span className="abe-slug-hint">{t.blog.autoSlugHint}</span>
                    )}
                  </div>
                </div>
                <div className="abe-meta-group">
                  <label className="abe-label">{t.blog.fieldSummary}</label>
                  <textarea
                    id="abe-summary"
                    className="form-input abe-input abe-summary-input"
                    placeholder={t.blog.fieldSummary + '…'}
                    value={summary}
                    onChange={e => setSummary(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="abe-meta-row-2">
                  <div className="abe-meta-group">
                    <label className="abe-label">{t.blog.fieldTags}</label>
                    <input
                      id="abe-tags"
                      className="form-input abe-input"
                      placeholder="unity, devlog, update"
                      value={tags}
                      onChange={e => setTags(e.target.value)}
                    />
                  </div>
                  <div className="abe-meta-group">
                    <label className="abe-label">{t.blog.fieldCover}</label>
                    <input
                      id="abe-cover"
                      className="form-input abe-input"
                      placeholder="https://…"
                      value={coverImageUrl}
                      onChange={e => setCoverImageUrl(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Toolbar */}
            {viewMode !== 'preview' && (
              <div className="abe-toolbar" role="toolbar" aria-label="Markdown toolbar">
                {TOOLBAR_ACTIONS.map(action => (
                  <button
                    key={action.id}
                    className="abe-tool-btn"
                    title={action.id}
                    onClick={() => handleToolbar(action)}
                    type="button"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}

            {/* Editor pane */}
            <div className={`abe-editor-pane${viewMode === 'split' ? ' split' : ''}`}>
              {viewMode !== 'preview' && (
                <div className="abe-write-pane">
                  <textarea
                    ref={textareaRef}
                    id="abe-content"
                    className="abe-textarea"
                    placeholder={t.blog.editorPlaceholder}
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    spellCheck={false}
                  />
                </div>
              )}
              {viewMode !== 'write' && (
                <div className="abe-preview-pane">
                  <div
                    ref={previewRef}
                    className="abe-preview markdown-body"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
