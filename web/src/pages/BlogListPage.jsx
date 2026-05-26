import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import { listBlogPosts } from '../api.js';
import BrandLogo from '../components/BrandLogo.jsx';
import './BlogListPage.css';

function formatDate(dateStr, lang) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function BlogListPage() {
  const { user } = useAuth();
  const { lang, toggleLang, t } = useI18n();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);

  const LIMIT = 9;

  useEffect(() => {
    setLoading(true);
    listBlogPosts({ page, limit: LIMIT })
      .then(({ posts, total, pages }) => {
        setPosts(posts);
        setTotal(total);
        setPages(pages);
      })
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="blog-page">
      {/* Nav */}
      <nav className="blog-nav">
        <Link to="/" className="blog-logo"><BrandLogo size="md" /></Link>
        <div className="blog-nav-links">
          <Link to="/arcade" className="l-nav-link">{t.nav.arcade}</Link>
          <span className="l-nav-link blog-nav-active">{t.nav.blog}</span>
          <button className="l-lang-toggle" onClick={toggleLang}>
            {lang === 'en' ? '한국어' : 'English'}
          </button>
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

      {/* Hero */}
      <header className="blog-hero">
        <div className="blog-hero-glow" aria-hidden="true" />
        <div className="blog-hero-inner">
          <span className="blog-hero-label">BLOG</span>
          <h1 className="blog-hero-title">{t.blog.listTitle}</h1>
          <p className="blog-hero-sub">{t.blog.listSub}</p>
        </div>
      </header>

      {/* Posts grid */}
      <main className="blog-main">
        {loading ? (
          <p className="blog-loading">{t.blog.loading}</p>
        ) : posts.length === 0 ? (
          <div className="blog-empty">
            <p>{t.blog.empty}</p>
          </div>
        ) : (
          <>
            <div className="blog-grid">
              {posts.map((post, i) => (
                <Link
                  key={post._id}
                  to={`/blog/${post.slug}`}
                  className="blog-card"
                  style={{ animationDelay: `${i * 0.06}s` }}
                >
                  {post.coverImageUrl && (
                    <div className="blog-card-cover">
                      <img src={post.coverImageUrl} alt="" loading="lazy" />
                    </div>
                  )}
                  <div className="blog-card-body">
                    {post.tags?.length > 0 && (
                      <div className="blog-card-tags">
                        {post.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="blog-tag">{tag}</span>
                        ))}
                      </div>
                    )}
                    <h2 className="blog-card-title">{post.title}</h2>
                    {post.summary && (
                      <p className="blog-card-summary">{post.summary}</p>
                    )}
                    <div className="blog-card-meta">
                      <span className="blog-card-date">
                        {formatDate(post.publishedAt || post.createdAt, lang)}
                      </span>
                      {post.author?.name && (
                        <span className="blog-card-author">
                          {t.blog.byLine} {post.author.name}
                        </span>
                      )}
                    </div>
                    <span className="blog-card-readmore">{t.blog.readMore}</span>
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="blog-pagination">
                <button
                  className="blog-page-btn"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  ←
                </button>
                {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    className={`blog-page-btn${p === page ? ' active' : ''}`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ))}
                <button
                  className="blog-page-btn"
                  disabled={page >= pages}
                  onClick={() => setPage(p => p + 1)}
                >
                  →
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="l-footer">
        <span className="l-footer-logo"><BrandLogo size="sm" /></span>
        <span className="l-footer-copy">{t.footer.tagline}</span>
      </footer>
    </div>
  );
}
