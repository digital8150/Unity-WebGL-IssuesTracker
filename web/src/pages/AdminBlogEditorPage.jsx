import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import {
  createBlogPost,
  updateBlogPost,
  getAdminBlogPost,
  uploadBlogImage,
  getGame,
  getGameArticle,
  createGameArticle,
  updateGameArticle,
} from '../api.js';
import BrandLogo from '../components/BrandLogo.jsx';
import { BlogMedia } from '../components/BlogMedia.jsx';
import { createBlogMarkdownRenderer, isVideoMediaUrl } from '../utils/blogMedia.js';
import DarkModeToggle from '../components/DarkModeToggle.jsx';
import PageLink from '../components/PageLink.jsx';
import { usePageNavigate } from '../hooks/usePageTransition.js';
import './DashboardPage.css';
import './BlogPostPage.css';
import './AdminBlogEditorPage.css';

// ── Markdown renderer ─────────────────────────────────────────────────────────
marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(raw) {
  const html = marked.parse(raw || '', { renderer: createBlogMarkdownRenderer(marked.Renderer) });
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['source', 'video'],
    ADD_ATTR: ['aria-label', 'autoplay', 'height', 'loop', 'muted', 'playsinline', 'preload', 'src', 'type', 'width'],
  });
}

// ── Unsplash Presets ──────────────────────────────────────────────────────────
const UNSPLASH_PRESETS = [
  {
    id: 'preset-1',
    urls: {
      regular: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80',
      thumb: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=300&q=80'
    },
    user: {
      name: 'Ella Don',
      link: 'https://unsplash.com/@elladon'
    }
  },
  {
    id: 'preset-2',
    urls: {
      regular: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1200&q=80',
      thumb: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=300&q=80'
    },
    user: {
      name: 'Lorenzo Herrera',
      link: 'https://unsplash.com/@lorenzoherrera'
    }
  },
  {
    id: 'preset-3',
    urls: {
      regular: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=1200&q=80',
      thumb: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=300&q=80'
    },
    user: {
      name: 'Soumil Kumar',
      link: 'https://unsplash.com/@soumilkumar'
    }
  },
  {
    id: 'preset-4',
    urls: {
      regular: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80',
      thumb: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=300&q=80'
    },
    user: {
      name: 'Sean Do',
      link: 'https://unsplash.com/@seando'
    }
  },
  {
    id: 'preset-5',
    urls: {
      regular: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=1200&q=80',
      thumb: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=300&q=80'
    },
    user: {
      name: 'Jesper Brouwers',
      link: 'https://unsplash.com/@jesperbrouwers'
    }
  },
  {
    id: 'preset-6',
    urls: {
      regular: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
      thumb: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=300&q=80'
    },
    user: {
      name: 'Alexandre Debiève',
      link: 'https://unsplash.com/@alexandre_debieve'
    }
  },
  {
    id: 'preset-7',
    urls: {
      regular: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80',
      thumb: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=300&q=80'
    },
    user: {
      name: 'Markus Spiske',
      link: 'https://unsplash.com/@markusspiske'
    }
  },
  {
    id: 'preset-8',
    urls: {
      regular: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1200&q=80',
      thumb: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=300&q=80'
    },
    user: {
      name: 'Artem Sapegin',
      link: 'https://unsplash.com/@sapegin'
    }
  },
  {
    id: 'preset-9',
    urls: {
      regular: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80',
      thumb: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=300&q=80'
    },
    user: {
      name: 'Milad Fakurian',
      link: 'https://unsplash.com/@fakurian'
    }
  },
  {
    id: 'preset-10',
    urls: {
      regular: 'https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?auto=format&fit=crop&w=1200&q=80',
      thumb: 'https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?auto=format&fit=crop&w=300&q=80'
    },
    user: {
      name: 'Daniel Olah',
      link: 'https://unsplash.com/@daniolah'
    }
  },
  {
    id: 'preset-11',
    urls: {
      regular: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
      thumb: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=300&q=80'
    },
    user: {
      name: 'R-Architecture',
      link: 'https://unsplash.com/@rarchitecture'
    }
  },
  {
    id: 'preset-12',
    urls: {
      regular: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
      thumb: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=300&q=80'
    },
    user: {
      name: 'Bailey Zindel',
      link: 'https://unsplash.com/@baileyzindel'
    }
  }
];

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

export default function AdminBlogEditorPage({ embedded = false, gameId: embeddedGameId, articleId: embeddedArticleId, game: embeddedGame }) {
  const { id: routeId, gameId: routeGameId } = useParams(); // undefined if new post
  const id = embeddedArticleId ?? routeId;
  const gameId = embeddedGameId ?? routeGameId;
  const isGameScope = Boolean(gameId);
  const isEdit = Boolean(id);
  const navigate = usePageNavigate();
  const { user: me, logout } = useAuth();
  const { lang, toggleLang, t: baseT } = useI18n();
  // The same markdown editor powers the global blog and each game's article CMS.
  const t = isGameScope
    ? { ...baseT, blog: { ...baseT.blog, ...baseT.gameArticles } }
    : baseT;

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
  const [game, setGame] = useState(embeddedGame ?? null);

  // Image Upload UI states
  const [coverUploading, setCoverUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [coverDragOver, setCoverDragOver] = useState(false);
  
  // Image Insert Popover/Modal states
  const [showImgModal, setShowImgModal] = useState(false);
  const [manualImgUrl, setManualImgUrl] = useState('');
  const [manualImgAlt, setManualImgAlt] = useState('');
  const [modalUploading, setModalUploading] = useState(false);

  // Unsplash Photo Selector states
  const [showUnsplashModal, setShowUnsplashModal] = useState(false);
  const [unsplashQuery, setUnsplashQuery] = useState('');
  const [unsplashImages, setUnsplashImages] = useState([]);
  const [unsplashSearching, setUnsplashSearching] = useState(false);

  const textareaRef = useRef(null);
  const previewRef = useRef(null);
  const coverInputRef = useRef(null);
  const imageModalInputRef = useRef(null);

  // Load existing post
  useEffect(() => {
    if (isGameScope && !embeddedGame) {
      getGame(gameId).then(({ game: loadedGame }) => setGame(loadedGame)).catch(err => setError(err.message));
    }
    if (!isEdit) return;
    const loadArticle = isGameScope ? getGameArticle(gameId, id) : getAdminBlogPost(id);
    loadArticle
      .then(({ post, article }) => {
        const entry = post ?? article;
        setTitle(entry.title || '');
        setSlug(entry.slug || '');
        setSlugManual(true);
        setSummary(entry.summary || '');
        setContent(entry.content || '');
        setCoverImageUrl(entry.coverImageUrl || '');
        setTags((entry.tags || []).join(', '));
        setPublished(entry.published || false);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoadingPost(false));
  }, [id, isEdit, gameId, isGameScope, embeddedGame]);

  useEffect(() => {
    if (embeddedGame) setGame(embeddedGame);
  }, [embeddedGame]);

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

  // ── Cover Upload Logics ───────────────────────────────────────────────────────
  const uploadCoverImage = async (file) => {
    if (!file) return;
    setError('');
    setCoverUploading(true);
    try {
      const { imageUrl } = await uploadBlogImage(file);
      setCoverImageUrl(imageUrl);
    } catch (err) {
      setError(`${t.blog.uploadFailed} (${err.message})`);
    } finally {
      setCoverUploading(false);
    }
  };

  const handleCoverSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) uploadCoverImage(file);
  };

  const handleCoverRemove = () => {
    setCoverImageUrl('');
  };

  // ── Content Image Upload Logics (D&D / Paste) ──────────────────────────────────
  const uploadContentImageFile = async (file) => {
    const ta = textareaRef.current;
    if (!ta || !file) return;

    setError('');
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const placeholder = `![${t.blog.uploading}...]()`;
    
    // Insert placeholder at cursor
    const textWithPlaceholder = value.slice(0, s) + placeholder + value.slice(e);
    setContent(textWithPlaceholder);

    const placeholderPos = s;

    try {
      const { imageUrl } = await uploadBlogImage(file);
      
      // Replace placeholder with final markdown
      const finalImgMd = `![${file.name.replace(/[\[\]]/g, '')}](${imageUrl})`;
      
      // Read fresh value in case content changed while uploading
      setContent((prevContent) => {
        return prevContent.replace(placeholder, finalImgMd);
      });
      
      // Restore cursor position after the image
      requestAnimationFrame(() => {
        ta.focus();
        const nextPos = placeholderPos + finalImgMd.length;
        ta.setSelectionRange(nextPos, nextPos);
      });
    } catch (err) {
      setError(`${t.blog.uploadFailed} (${err.message})`);
      // Rollback placeholder
      setContent((prevContent) => {
        return prevContent.replace(placeholder, '');
      });
    }
  };

  // Drag and Drop for Content Textarea
  const handleContentDragOver = (e) => {
    e.preventDefault();
    if (viewMode === 'preview') return;
    setIsDragOver(true);
  };

  const handleContentDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleContentDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (viewMode === 'preview') return;

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      uploadContentImageFile(file);
    }
  };

  // Clipboard Paste for Content Textarea
  const handleContentPaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault(); // Stop default pasting behavior
          uploadContentImageFile(file);
          break;
        }
      }
    }
  };

  // ── Popover/Modal Image Insert Logics ──────────────────────────────────────────
  const handleInsertManualImage = () => {
    if (!manualImgUrl.trim()) return;
    const ta = textareaRef.current;
    if (!ta) return;

    const alt = manualImgAlt.trim() || 'image';
    const imgMd = `![${alt}](${manualImgUrl.trim()})`;
    
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const newText = value.slice(0, s) + imgMd + value.slice(e);
    setContent(newText);
    
    setShowImgModal(false);
    setManualImgUrl('');
    setManualImgAlt('');

    requestAnimationFrame(() => {
      ta.focus();
      const nextPos = s + imgMd.length;
      ta.setSelectionRange(nextPos, nextPos);
    });
  };

  const handleInsertUploadedImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setModalUploading(true);
    try {
      const { imageUrl } = await uploadBlogImage(file);
      const ta = textareaRef.current;
      if (ta) {
        const imgMd = `![${file.name.replace(/[\[\]]/g, '')}](${imageUrl})`;
        const { selectionStart: s, selectionEnd: e, value } = ta;
        const newText = value.slice(0, s) + imgMd + value.slice(e);
        setContent(newText);
        
        requestAnimationFrame(() => {
          ta.focus();
          const nextPos = s + imgMd.length;
          ta.setSelectionRange(nextPos, nextPos);
        });
      }
      setShowImgModal(false);
    } catch (err) {
      setError(`${t.blog.uploadFailed} (${err.message})`);
    } finally {
      setModalUploading(false);
    }
  };

  // ── Unsplash Search Logics ───────────────────────────────────────────────────
  const searchUnsplashPhotos = async (q) => {
    const accessKey = import.meta.env.VITE_UNSPLASH_ACCESS_KEY;
    if (!accessKey) {
      setError('Unsplash Access Key is missing. Live search is disabled, but you can choose from presets.');
      return;
    }

    setUnsplashSearching(true);
    setError('');
    try {
      const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&client_id=${accessKey}&per_page=20`);
      if (!res.ok) throw new Error(`Unsplash API error: ${res.status}`);
      const data = await res.json();
      const formatted = (data.results || []).map(img => ({
        id: img.id,
        urls: {
          regular: img.urls.regular,
          thumb: img.urls.thumb
        },
        user: {
          name: img.user.name,
          link: img.user.links.html
        }
      }));
      setUnsplashImages(formatted);
    } catch (err) {
      setError(`Unsplash search failed: ${err.message}`);
    } finally {
      setUnsplashSearching(false);
    }
  };

  const handleUnsplashSearchSubmit = (e) => {
    e.preventDefault();
    if (unsplashQuery.trim()) {
      searchUnsplashPhotos(unsplashQuery.trim());
    } else {
      setUnsplashImages([]);
    }
  };

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
        if (isGameScope) await updateGameArticle(gameId, id, data);
        else await updateBlogPost(id, data);
      } else {
        if (isGameScope) await createGameArticle(gameId, data);
        else await createBlogPost(data);
      }
      navigate(isGameScope ? `/dashboard/games/${gameId}/articles` : '/admin/blog');
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
    <div className={embedded ? 'abe-embedded' : 'dash-layout abe-layout'}>
      {/* Sidebar */}
      {!embedded && (
        <aside className="dash-sidebar">
        <PageLink to="/" className="dash-logo"><BrandLogo /></PageLink>
        <nav className="dash-nav">
          <PageLink className="dash-nav-item" to="/dashboard">{t.nav.dashboard}</PageLink>
          <PageLink className="dash-nav-item" to="/arcade">{t.nav.arcade}</PageLink>
          <PageLink className={`dash-nav-item${!isGameScope ? ' active' : ''}`} to="/admin/blog">{t.nav.blogAdmin} CMS</PageLink>
          {isGameScope && <span className="dash-nav-item active">{t.gameArticles.adminTitle}</span>}
          {me?.role === 'admin' && (
            <PageLink className="dash-nav-item" to="/admin/users">{t.nav.admin}</PageLink>
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
          <div className="dash-footer-row">
            <button className="dash-footer-btn" onClick={toggleLang}>
              {lang === 'en' ? '한국어' : 'English'}
            </button>
            <DarkModeToggle />
          </div>
          <button className="dash-footer-btn" onClick={handleLogout}>{t.nav.signOut}</button>
        </div>
        </aside>
      )}

      {/* Editor main */}
      <div className={`abe-main${embedded ? ' abe-main-embedded' : ''}`}>
        {/* Top bar */}
        <div className="abe-topbar">
          <div className="abe-topbar-left">
          <PageLink to={isGameScope ? `/dashboard/games/${gameId}/articles` : '/admin/blog'} className="abe-back">
              {isGameScope ? t.gameArticles.blogBack : `← ${t.blog.adminTitle}`}
          </PageLink>
            <h1 className="abe-page-title">
              {isGameScope && game ? `${game.name} · ` : ''}{isEdit ? t.blog.editorTitleEdit : t.blog.editorTitleNew}
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
                  <div className="abe-meta-group abe-cover-group">
                    <label className="abe-label">{t.blog.fieldCover}</label>
                    <input
                      type="file"
                      ref={coverInputRef}
                      onChange={handleCoverSelect}
                      accept="image/png, image/jpeg, image/jpg, image/webp, image/gif"
                      style={{ display: 'none' }}
                    />
                    
                    {coverImageUrl ? (
                      <div className="abe-cover-preview-container">
                        <div 
                          className="abe-cover-blur-bg" 
                          style={!isVideoMediaUrl(coverImageUrl) ? { backgroundImage: `url(${coverImageUrl})` } : undefined}
                        />
                        <BlogMedia
                          src={coverImageUrl} 
                          alt="Cover Preview" 
                          className="abe-cover-preview-img" 
                        />
                        <div className="abe-cover-actions">
                          <button 
                            type="button" 
                            className="btn btn-sm btn-ghost abe-cover-action-btn"
                            onClick={() => coverInputRef.current?.click()}
                            disabled={coverUploading}
                          >
                            {coverUploading ? t.blog.uploading : t.gameDetail.replaceThumbnail}
                          </button>
                          <button 
                            type="button" 
                            className="btn btn-sm btn-ghost abe-cover-action-btn"
                            onClick={() => setShowUnsplashModal(true)}
                            disabled={coverUploading}
                          >
                            🌌 Unsplash
                          </button>
                          <button 
                            type="button" 
                            className="btn btn-sm btn-danger-soft abe-cover-action-btn"
                            onClick={handleCoverRemove}
                            disabled={coverUploading}
                          >
                            {t.blog.removeCover}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div 
                        className={`abe-cover-dropzone${coverDragOver ? ' dragover' : ''}${coverUploading ? ' uploading' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setCoverDragOver(true); }}
                        onDragLeave={() => setCoverDragOver(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setCoverDragOver(false);
                          const file = e.dataTransfer.files?.[0];
                          if (file && file.type.startsWith('image/')) {
                            uploadCoverImage(file);
                          }
                        }}
                      >
                        <div className="abe-cover-dropzone-inner">
                          <span className="abe-cover-dropzone-icon">🖼️</span>
                          <span className="abe-cover-dropzone-text">
                            {coverUploading ? t.blog.uploading : t.blog.fieldCoverDragDrop}
                          </span>
                          <span className="abe-cover-dropzone-help">{t.blog.fieldCoverHelp}</span>
                          
                          <div className="abe-cover-dropzone-actions" style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost"
                              onClick={() => coverInputRef.current?.click()}
                              disabled={coverUploading}
                              style={{ border: '1px solid var(--color-hairline)', background: 'var(--color-canvas)' }}
                            >
                              {t.gameDetail.chooseFiles}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost"
                              onClick={() => setShowUnsplashModal(true)}
                              disabled={coverUploading}
                              style={{ border: '1px solid var(--color-hairline)', background: 'var(--color-canvas)' }}
                            >
                              🌌 {t.blog.selectUnsplash}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
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
                    onClick={() => {
                      if (action.id === 'img') {
                        setShowImgModal(true);
                      } else {
                        handleToolbar(action);
                      }
                    }}
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
                <div 
                  className={`abe-write-pane${isDragOver ? ' dragover' : ''}`}
                  onDragOver={handleContentDragOver}
                  onDragLeave={handleContentDragLeave}
                  onDrop={handleContentDrop}
                >
                  {isDragOver && (
                    <div className="abe-dragover-overlay">
                      <div className="abe-dragover-overlay-box">
                        <span className="abe-dragover-icon">🖼️</span>
                        <span className="abe-dragover-text">{t.blog.dragOverText}</span>
                      </div>
                    </div>
                  )}
                  <textarea
                    ref={textareaRef}
                    id="abe-content"
                    className="abe-textarea"
                    placeholder={t.blog.editorPlaceholder}
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handleContentPaste}
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

            {/* Image Insertion Modal */}
            {showImgModal && (
              <div className="abe-image-modal-overlay" onClick={() => setShowImgModal(false)}>
                <div className="abe-image-modal" onClick={e => e.stopPropagation()}>
                  <div className="abe-image-modal-header">
                    <h3>{t.blog.insertImage}</h3>
                    <button className="abe-image-modal-close" onClick={() => setShowImgModal(false)}>×</button>
                  </div>
                  
                  <div className="abe-image-modal-body">
                    {/* Local File Upload */}
                    <div className="abe-modal-upload-section">
                      <input 
                        type="file" 
                        ref={imageModalInputRef}
                        onChange={handleInsertUploadedImage}
                        accept="image/png, image/jpeg, image/jpg, image/webp, image/gif"
                        style={{ display: 'none' }}
                      />
                      <button 
                        type="button" 
                        className="btn btn-primary btn-sm w-full"
                        onClick={() => imageModalInputRef.current?.click()}
                        disabled={modalUploading}
                      >
                        {modalUploading ? t.blog.uploading : t.blog.selectFile}
                      </button>
                    </div>
                    
                    <div className="abe-modal-divider">
                      <span>OR</span>
                    </div>

                    {/* Manual URL Input */}
                    <div className="abe-modal-url-section">
                      <div className="form-group">
                        <input 
                          type="text" 
                          className="form-input abe-input"
                          placeholder={t.blog.imageUrlPlaceholder}
                          value={manualImgUrl}
                          onChange={e => setManualImgUrl(e.target.value)}
                        />
                      </div>
                      <div className="form-group" style={{ marginTop: '8px' }}>
                        <input 
                          type="text" 
                          className="form-input abe-input"
                          placeholder="Alt text (optional)"
                          value={manualImgAlt}
                          onChange={e => setManualImgAlt(e.target.value)}
                        />
                      </div>
                      <button 
                        type="button" 
                        className="btn btn-ghost btn-sm w-full"
                        style={{ marginTop: '12px' }}
                        onClick={handleInsertManualImage}
                        disabled={!manualImgUrl.trim()}
                      >
                        {t.blog.insertImage}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Unsplash Gallery Modal */}
            {showUnsplashModal && (
              <div className="abe-image-modal-overlay" onClick={() => setShowUnsplashModal(false)}>
                <div className="abe-image-modal unsplash-modal" onClick={e => e.stopPropagation()}>
                  <div className="abe-image-modal-header">
                    <h3>🌌 {t.blog.unsplashTitle}</h3>
                    <button className="abe-image-modal-close" onClick={() => setShowUnsplashModal(false)}>×</button>
                  </div>
                  
                  <div className="abe-image-modal-body unsplash-modal-body">
                    {/* Unsplash Search Form */}
                    <form onSubmit={handleUnsplashSearchSubmit} className="unsplash-search-form">
                      <input 
                        type="text" 
                        className="form-input abe-input unsplash-search-input"
                        placeholder={t.blog.unsplashSearchPlaceholder}
                        value={unsplashQuery}
                        onChange={e => setUnsplashQuery(e.target.value)}
                      />
                      <button type="submit" className="btn btn-primary btn-sm unsplash-search-btn">
                        {unsplashSearching ? t.blog.uploading : '🔍'}
                      </button>
                    </form>

                    {/* Unsplash Results / Presets Grid */}
                    <div className="unsplash-grid-title">
                      {unsplashImages.length > 0 ? t.board.title : t.blog.presetTitle}
                    </div>

                    <div className="unsplash-grid-container">
                      {unsplashSearching ? (
                        <div className="unsplash-loading">{t.blog.uploading}</div>
                      ) : (
                        <div className="unsplash-grid">
                          {(unsplashImages.length > 0 ? unsplashImages : UNSPLASH_PRESETS).map(img => (
                            <div 
                              key={img.id} 
                              className="unsplash-card"
                              onClick={() => {
                                setCoverImageUrl(img.urls.regular);
                                setShowUnsplashModal(false);
                                setUnsplashQuery('');
                                setUnsplashImages([]);
                              }}
                            >
                              <img src={img.urls.thumb} alt="Unsplash" className="unsplash-thumb" />
                              <div className="unsplash-author">
                                by <a href={img.user.link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{img.user.name}</a>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {!unsplashSearching && unsplashQuery && unsplashImages.length === 0 && (
                        <div className="unsplash-empty">{t.blog.noUnsplashResults}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
