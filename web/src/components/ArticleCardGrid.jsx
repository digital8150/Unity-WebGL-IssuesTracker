import React from 'react';
import { Link } from 'react-router-dom';
import '../pages/BlogListPage.css';
import { BlogMedia } from './BlogMedia.jsx';
import { assetUrl } from '../utils/gameVisuals.js';

export function formatArticleDate(dateStr, lang) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function ArticleCardGrid({
  posts = [],
  lang,
  labels,
  linkForPost,
  className = '',
}) {
  return (
    <div className={`blog-grid${className ? ` ${className}` : ''}`}>
      {posts.map((post, index) => (
        <Link
          key={post._id}
          to={linkForPost(post)}
          className="blog-card"
          style={{ animationDelay: `${index * 0.06}s` }}
        >
          <div className={`blog-card-cover${post.coverImageUrl ? '' : ' blog-card-cover-fallback'}`}>
            {post.coverImageUrl && (
              <BlogMedia src={assetUrl(post.coverImageUrl)} alt={post.title} loading="lazy" />
            )}
          </div>
          <div className="blog-card-body">
            {post.tags?.length > 0 && (
              <div className="blog-card-tags">
                {post.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="blog-tag">{tag}</span>
                ))}
              </div>
            )}
            <h2 className="blog-card-title">{post.title}</h2>
            {post.summary && <p className="blog-card-summary">{post.summary}</p>}
            <div className="blog-card-meta">
              <span className="blog-card-date">
                {formatArticleDate(post.publishedAt || post.createdAt, lang)}
              </span>
              {post.author?.name && (
                <span className="blog-card-author">
                  {labels.byLine} {post.author.name}
                </span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
