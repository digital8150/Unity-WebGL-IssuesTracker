import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import {
  getBlogPost,
  addBlogComment,
  deleteBlogComment,
  getPublicGameArticle,
  addGameArticleComment,
  deleteGameArticleComment,
} from '../api.js';
import { BlogMedia } from '../components/BlogMedia.jsx';
import { createBlogMarkdownRenderer } from '../utils/blogMedia.js';
import { assetUrl } from '../utils/gameVisuals.js';
import { readSsrData } from '../utils/ssrData.js';
import Footer from '../components/Footer.jsx';
import PublicNav from '../components/PublicNav.jsx';
import PageLink from '../components/PageLink.jsx';
import TurnstileWidget from '../components/TurnstileWidget.jsx';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import { usePageNavigate } from '../hooks/usePageTransition.js';
import './BlogListPage.css';
import './BlogPostPage.css';

// Highlighting is applied post-render via hljs.highlightElement (see effect below).
marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(raw) {
  const html = marked.parse(raw || '', { renderer: createBlogMarkdownRenderer(marked.Renderer) });
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['iframe', 'source', 'video'],
    ADD_ATTR: [
      'allow', 'allowfullscreen', 'aria-hidden', 'aria-label', 'autoplay',
      'frameborder', 'height', 'loop', 'muted', 'playsinline', 'preload',
      'scrolling', 'src', 'type', 'width',
    ],
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
  const { slug, gameSlug, articleSlug } = useParams();
  const isGameArticle = Boolean(gameSlug && articleSlug);
  const contentSlug = isGameArticle ? articleSlug : slug;
  const bootstrap = readSsrData(isGameArticle ? '/play/:gameSlug/articles/:articleSlug' : '/blog/:slug');
  const initialPost = bootstrap?.post ?? bootstrap?.article ?? null;
  const initialGame = bootstrap?.game ?? null;
  const hasBootstrap = Boolean(initialPost && typeof initialPost === 'object' && initialPost.title);
  const navigate = usePageNavigate();
  const { user } = useAuth();
  const { lang, t } = useI18n();
  const [post, setPost] = useState(initialPost);
  const [game, setGame] = useState(initialGame);
  const [loading, setLoading] = useState(!hasBootstrap);
  const [notFound, setNotFound] = useState(false);
  const contentRef = useRef(null);
  const bootstrapPendingRef = useRef(hasBootstrap);

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
      const response = isGameArticle
        ? await addGameArticleComment(gameSlug, contentSlug, commentBody.trim(), authorName, !user ? cfToken : undefined)
        : await addBlogComment(contentSlug, commentBody.trim(), authorName, !user ? cfToken : undefined);
      const { comment } = response;
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
      if (isGameArticle) await deleteGameArticleComment(gameSlug, contentSlug, commentId);
      else await deleteBlogComment(contentSlug, commentId);
      setPost((prev) => prev
        ? { ...prev, comments: (prev.comments ?? []).filter((c) => c._id !== commentId) }
        : prev,
      );
    } catch {}
  }

  const SITE = 'BCSDLab. Arcade';
  const canonicalUrl = isGameArticle
    ? `${window.location.origin}/play/${gameSlug}/articles/${contentSlug}`
    : `${window.location.origin}/blog/${contentSlug}`;
  const articleImage = post?.coverImageUrl
    ? assetUrl(post.coverImageUrl)
    : game?.thumbnailUrl
      ? assetUrl(game.thumbnailUrl)
      : undefined;
  useDocumentMeta(post ? {
    title: `${post.title} — ${game?.name ? `${game.name} · ` : ''}${SITE}`,
    description: post.summary || undefined,
    image: articleImage,
    url: canonicalUrl,
    type: 'article',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': isGameArticle ? 'Article' : 'BlogPosting',
      headline: post.title,
      description: post.summary || undefined,
      image: articleImage,
      datePublished: post.publishedAt || post.createdAt,
      dateModified: post.updatedAt || post.publishedAt || post.createdAt,
      author: { '@type': 'Person', name: post.author?.name || 'BCSDLab.' },
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
      ...(isGameArticle && game ? {
        isPartOf: { '@type': 'VideoGame', name: game.name, url: `${window.location.origin}/play/${gameSlug}` },
      } : {}),
    },
  } : {});

  useEffect(() => {
    if (bootstrapPendingRef.current) {
      bootstrapPendingRef.current = false;
      return undefined;
    }

    let active = true;
    setLoading(true);
    setNotFound(false);
    setPost(null);
    setGame(null);
    const loadArticle = isGameArticle
      ? getPublicGameArticle(gameSlug, contentSlug)
      : getBlogPost(contentSlug);
    loadArticle
      .then(({ post: blogPost, article, game: gameInfo }) => {
        if (!active) return;
        setPost(blogPost ?? article);
        setGame(gameInfo ?? null);
      })
      .catch(() => {
        if (active) setNotFound(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [contentSlug, gameSlug, isGameArticle]);

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
      <PublicNav active="articles" />

      <main className="bpost-main">
        {loading ? (
          <p className="blog-loading">{t.blog.loading}</p>
        ) : notFound || !post ? (
          <div className="bpost-notfound">
            <h2>404 — Post not found</h2>
            <PageLink to={isGameArticle ? `/play/${gameSlug}` : '/blog'} className="btn btn-ghost">
              {isGameArticle ? t.gameArticles.articleBack : t.blog.back}
            </PageLink>
          </div>
        ) : (
          <article className="bpost-article">
            {/* Back link */}
            <PageLink to={isGameArticle ? `/play/${gameSlug}` : '/blog'} className="bpost-back">
              {isGameArticle ? t.gameArticles.articleBack : t.blog.back}
            </PageLink>

            {/* Cover image */}
            {post.coverImageUrl && (
              <div className="bpost-cover">
                <BlogMedia src={post.coverImageUrl} alt="" loading="eager" />
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
