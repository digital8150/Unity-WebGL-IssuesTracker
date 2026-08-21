import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
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
import { renderMarkdown } from '../utils/renderMarkdown.js';
import { assetUrl } from '../utils/gameVisuals.js';
import { readSsrData } from '../utils/ssrData.js';
import Footer from '../components/Footer.jsx';
import PublicNav from '../components/PublicNav.jsx';
import PageLink from '../components/PageLink.jsx';
import CommentForm from '../components/CommentForm.jsx';
import MachineTranslationNotice from '../components/MachineTranslationNotice.jsx';
import ArticleCardGrid from '../components/ArticleCardGrid.jsx';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import { withLocale } from '../i18n/localePath.js';
import './BlogListPage.css';
import './BlogPostPage.css';
import '../styles/markdown-body.css';

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
  const initialRelatedPosts = bootstrap?.relatedPosts ?? bootstrap?.relatedArticles ?? [];
  const hasBootstrap = Boolean(initialPost && typeof initialPost === 'object' && initialPost.title);
  const { user } = useAuth();
  const { lang, t } = useI18n();
  const [post, setPost] = useState(initialPost);
  const [game, setGame] = useState(initialGame);
  const [relatedPosts, setRelatedPosts] = useState(initialRelatedPosts);
  const [translation, setTranslation] = useState(bootstrap?.translation ?? null);
  const [loading, setLoading] = useState(!hasBootstrap);
  const [notFound, setNotFound] = useState(false);
  const contentRef = useRef(null);
  const bootstrapPendingRef = useRef(hasBootstrap);

  async function handleAddComment({ body, authorName, turnstileToken }) {
    const response = isGameArticle
      ? await addGameArticleComment(gameSlug, contentSlug, body, authorName, turnstileToken)
      : await addBlogComment(contentSlug, body, authorName, turnstileToken);
    const { comment } = response;
    setPost((prev) => prev ? { ...prev, comments: [...(prev.comments ?? []), comment] } : prev);
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
  const sourcePath = isGameArticle ? `/play/${gameSlug}/articles/${contentSlug}` : `/blog/${contentSlug}`;
  const canonicalUrl = `${window.location.origin}${withLocale(sourcePath, lang)}`;
  const metaCanonicalUrl = lang === 'en' && (!translation || translation.noindex)
    ? `${window.location.origin}${withLocale(sourcePath, 'ko')}`
    : canonicalUrl;
  const alternateLinks = translation && !translation.noindex ? [
    { hreflang: 'ko', href: `${window.location.origin}${withLocale(sourcePath, 'ko')}` },
    { hreflang: 'en', href: `${window.location.origin}${withLocale(sourcePath, 'en')}` },
    { hreflang: 'x-default', href: `${window.location.origin}${withLocale(sourcePath, 'ko')}` },
  ] : null;
  const articleImage = post?.coverImageUrl
    ? assetUrl(post.coverImageUrl)
    : game?.thumbnailUrl
      ? assetUrl(game.thumbnailUrl)
      : undefined;
  const isUnlistedGameArticle = isGameArticle && game?.visibility !== 'public';
  useDocumentMeta(post ? {
    title: `${post.title} — ${game?.name ? `${game.name} · ` : ''}${SITE}`,
    description: post.summary || undefined,
    image: articleImage,
      url: metaCanonicalUrl,
      robots: isUnlistedGameArticle || (lang === 'en' && (!translation || translation.noindex)) ? 'noindex,follow' : 'index,follow',
      alternates: isUnlistedGameArticle ? null : alternateLinks,
    type: 'article',
    jsonLd: isUnlistedGameArticle ? undefined : {
      '@context': 'https://schema.org',
      '@type': isGameArticle ? 'Article' : 'BlogPosting',
      headline: post.title,
      description: post.summary || undefined,
      image: articleImage,
      datePublished: post.publishedAt || post.createdAt,
      dateModified: post.updatedAt || post.publishedAt || post.createdAt,
      author: { '@type': 'Person', name: post.author?.name || 'BCSDLab.' },
      mainEntityOfPage: { '@type': 'WebPage', '@id': metaCanonicalUrl },
      ...(isGameArticle && game ? {
        isPartOf: { '@type': 'VideoGame', name: game.name, url: `${window.location.origin}${withLocale(`/play/${gameSlug}`, lang)}` },
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
    setRelatedPosts([]);
    const loadArticle = isGameArticle
      ? getPublicGameArticle(gameSlug, contentSlug, lang)
      : getBlogPost(contentSlug, lang);
    loadArticle
      .then(({ post: blogPost, article, game: gameInfo, relatedPosts: blogRelatedPosts, relatedArticles, translation: translationInfo }) => {
        if (!active) return;
        setPost(blogPost ?? article);
        setGame(gameInfo ?? null);
        setRelatedPosts(blogRelatedPosts ?? relatedArticles ?? []);
        setTranslation(translationInfo ?? null);
      })
      .catch(() => {
        if (active) setNotFound(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [contentSlug, gameSlug, isGameArticle, lang]);

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

            <MachineTranslationNotice
              translation={translation}
              path={isGameArticle ? `/play/${gameSlug}/articles/${contentSlug}` : `/blog/${contentSlug}`}
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
                      {user && (user.role === 'admin' || String(c.authorId) === String(user.id)) && (
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

              <CommentForm onSubmit={handleAddComment} />
            </section>

            {relatedPosts.length > 0 && (
              <section className="bpost-related" aria-labelledby="bpost-related-title">
                <header className="bpost-related-header">
                  <h2 id="bpost-related-title">{t.blog.keepReading}</h2>
                </header>
                <ArticleCardGrid
                  posts={relatedPosts}
                  lang={lang}
                  labels={t.blog}
                  linkForPost={(relatedPost) => isGameArticle
                    ? `/play/${gameSlug}/articles/${relatedPost.slug}`
                    : `/blog/${relatedPost.slug}`}
                  className="bpost-related-grid"
                  titleLevel={3}
                />
              </section>
            )}
          </article>
        )}
      </main>

      <Footer />
    </div>
  );
}
