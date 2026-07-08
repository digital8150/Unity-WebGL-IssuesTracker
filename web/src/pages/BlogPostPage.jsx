import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import { getBlogPost, addBlogComment, deleteBlogComment } from '../api.js';
import BrandLogo from '../components/BrandLogo.jsx';
import Footer from '../components/Footer.jsx';
import DarkModeToggle from '../components/DarkModeToggle.jsx';
import TurnstileWidget from '../components/TurnstileWidget.jsx';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import './BlogListPage.css';
import './BlogPostPage.css';

// Configure marked with highlight.js
marked.setOptions({
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  },
  breaks: true,
  gfm: true,
});

function renderMarkdown(raw) {
  const html = marked.parse(raw || '');
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling'],
  });
}

function formatDate(dateStr, lang) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function BlogPostPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { lang, toggleLang, t } = useI18n();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const contentRef = useRef(null);

  // Comment form state
  const [commentBody, setCommentBody]     = useState('');
  const [guestName, setGuestName]         = useState('');
  const [cfToken, setCfToken]             = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [commentError, setCommentError]   = useState('');
  const turnstileResetRef                 = useRef(null);

  const handleCfToken  = useCallback((t) => setCfToken(t),  []);
  const handleCfExpire = useCallback(() => setCfToken(''), []);

  async function handleAddComment(e) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setPostingComment(true);
    setCommentError('');
    try {
      const authorName = user ? undefined : (guestName.trim() || undefined);
      const { comment } = await addBlogComment(slug, commentBody.trim(), authorName, !user ? cfToken : undefined);
      setPost((prev) => prev ? { ...prev, comments: [...(prev.comments ?? []), comment] } : prev);
      setCommentBody('');
      setCfToken('');
      turnstileResetRef.current?.();
    } catch (err) {
      setCommentError(err.message || t.blog.commentError);
      setCfToken('');
      turnstileResetRef.current?.();
    } finally {
      setPostingComment(false);
    }
  }

  async function handleDeleteComment(commentId) {
    try {
      await deleteBlogComment(slug, commentId);
      setPost((prev) => prev
        ? { ...prev, comments: (prev.comments ?? []).filter((c) => c._id !== commentId) }
        : prev,
      );
    } catch {}
  }

  const SITE = 'BCSDLab. Arcade';
  useDocumentMeta(post ? {
    title: `${post.title} — ${SITE}`,
    description: post.summary || undefined,
    image: post.coverImageUrl || undefined,
    url: window.location.href,
    type: 'article',
  } : {});

  useEffect(() => {
    setLoading(true);
    getBlogPost(slug)
      .then(({ post }) => setPost(post))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  // Apply highlight.js after render
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.querySelectorAll('pre code').forEach(el => {
        hljs.highlightElement(el);
      });
    }
  }, [post]);

  return (
    <div className="bpost-page">
      {/* Nav */}
      <nav className="blog-nav">
        <Link to="/" className="blog-logo"><BrandLogo size="md" /></Link>
        <div className="blog-nav-links">
          <Link to="/arcade" className="l-nav-link">{t.nav.arcade}</Link>
          <Link to="/blog" className="l-nav-link blog-nav-active">{t.nav.blog}</Link>
          <button className="l-lang-toggle" onClick={toggleLang}>
            {lang === 'en' ? '한국어' : 'English'}
          </button>
          <DarkModeToggle />
          {user ? (
            <Link
              to={user.status === 'approved' ? '/dashboard' : '/pending'}
              className="btn btn-primary btn-sm"
            >
              {t.nav.dashboard}
            </Link>
          ) : (
            <>
              <Link to="/login" className="l-nav-link nav-signin">{t.nav.signIn}</Link>
              <Link to="/register" className="btn btn-primary btn-sm">{t.nav.getStarted}</Link>
            </>
          )}
        </div>
      </nav>

      <main className="bpost-main">
        {loading ? (
          <p className="blog-loading">{t.blog.loading}</p>
        ) : notFound || !post ? (
          <div className="bpost-notfound">
            <h2>404 — Post not found</h2>
            <Link to="/blog" className="btn btn-ghost">{t.blog.back}</Link>
          </div>
        ) : (
          <article className="bpost-article">
            {/* Back link */}
            <Link to="/blog" className="bpost-back">{t.blog.back}</Link>

            {/* Cover image */}
            {post.coverImageUrl && (
              <div className="bpost-cover">
                <img src={post.coverImageUrl} alt="" />
              </div>
            )}

            {/* Header */}
            <header className="bpost-header">
              {post.tags?.length > 0 && (
                <div className="bpost-tags">
                  {post.tags.map(tag => (
                    <span key={tag} className="blog-tag">{tag}</span>
                  ))}
                </div>
              )}
              <h1 className="bpost-title">{post.title}</h1>
              <div className="bpost-meta">
                <time className="bpost-date">
                  {formatDate(post.publishedAt || post.createdAt, lang)}
                </time>
                {post.author?.name && (
                  <span className="bpost-author">
                    {t.blog.byLine} <strong>{post.author.name}</strong>
                  </span>
                )}
              </div>
              {post.summary && (
                <p className="bpost-summary">{post.summary}</p>
              )}
            </header>

            {/* Divider */}
            <hr className="bpost-divider" />

            {/* Markdown content */}
            <div
              ref={contentRef}
              className="bpost-content markdown-body"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }}
            />

            {/* ── Comments ── */}
            <section className="bpost-comments">
              <h2 className="bpost-comments-title">
                {t.blog.comments((post.comments ?? []).length)}
              </h2>

              {(post.comments ?? []).length === 0 && (
                <p className="bpost-comments-empty">{t.blog.noComments}</p>
              )}

              <div className="bpost-comment-list">
                {(post.comments ?? []).map((c) => (
                  <div key={c._id} className="bpost-comment-item">
                    <div className="bpost-comment-header">
                      <span className="bpost-comment-author">{c.authorName}</span>
                      <span className="bpost-comment-date">
                        {formatDate(c.createdAt, lang)}
                      </span>
                      {user && (user.role === 'admin') && (
                        <button
                          className="bpost-comment-delete"
                          onClick={() => handleDeleteComment(c._id)}
                        >
                          {t.blog.deleteComment}
                        </button>
                      )}
                    </div>
                    <p className="bpost-comment-body">{c.body}</p>
                  </div>
                ))}
              </div>

              <form className="bpost-comment-form" onSubmit={handleAddComment}>
                <h3 className="bpost-comment-form-title">{t.blog.leaveComment}</h3>

                {!user && (
                  <input
                    className="bpost-comment-name"
                    placeholder={t.blog.guestNamePlaceholder}
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    maxLength={100}
                  />
                )}

                <textarea
                  className="bpost-comment-textarea"
                  rows={4}
                  placeholder={t.blog.commentPlaceholder}
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  required
                />

                {/* Turnstile only for guests */}
                {!user && (
                  <TurnstileWidget
                    onToken={handleCfToken}
                    onExpire={handleCfExpire}
                    resetRef={turnstileResetRef}
                  />
                )}

                {commentError && (
                  <p className="bpost-comment-error">{commentError}</p>
                )}

                <button
                  type="submit"
                  className="bpost-comment-submit btn btn-primary"
                  disabled={postingComment || !commentBody.trim()}
                >
                  {postingComment ? t.blog.posting : t.blog.submitComment}
                </button>
              </form>
            </section>
          </article>
        )}
      </main>

      <Footer />
    </div>
  );
}
