import React, { useEffect, useMemo, useState } from 'react';
import { listBlogPosts } from '../api.js';
import { useI18n } from '../i18n.jsx';
import Footer from '../components/Footer.jsx';
import PublicNav from '../components/PublicNav.jsx';
import ArticleCardGrid from '../components/ArticleCardGrid.jsx';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import './BlogListPage.css';

export default function BlogListPage() {
  const { lang, t } = useI18n();
  const [posts, setPosts] = useState([]);
  const [tagOptions, setTagOptions] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);

  const LIMIT = 9;

  useDocumentMeta({
    title: `${t.blog.listTitle} — BCSDLab. Arcade`,
    description: t.blog.listSub,
    url: `${window.location.origin}/blog`,
    type: 'website',
  });

  useEffect(() => {
    let cancelled = false;
    listBlogPosts({ page: 1, limit: 50 })
      .then(({ posts: loadedPosts }) => {
        if (cancelled) return;
        const tags = [...new Set((loadedPosts ?? []).flatMap((post) => post.tags ?? []))];
        setTagOptions(tags);
      })
      .catch(() => {
        if (!cancelled) setTagOptions([]);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const nextSearch = searchInput.trim();
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearch((current) => (current === nextSearch ? current : nextSearch));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listBlogPosts({ page, limit: LIMIT, tag, q: search })
      .then(({ posts: loadedPosts, total: loadedTotal, pages: loadedPages }) => {
        if (cancelled) return;
        setPosts(loadedPosts ?? []);
        setTotal(loadedTotal ?? 0);
        setPages(loadedPages ?? 1);
      })
      .catch(() => {
        if (cancelled) return;
        setPosts([]);
        setTotal(0);
        setPages(1);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [page, tag, search]);

  const sortedTags = useMemo(
    () => [...tagOptions].sort((a, b) => a.localeCompare(b, lang === 'ko' ? 'ko' : 'en')),
    [tagOptions, lang],
  );

  function handleTagClick(nextTag) {
    setTag((current) => (current === nextTag ? '' : nextTag));
    setPage(1);
  }

  function resetFilters() {
    setSearchInput('');
    setSearch('');
    setTag('');
    setPage(1);
  }

  return (
    <div className="blog-page">
      <PublicNav active="articles" />

      <main className="blog-main">
        <div className="blog-layout">
          <aside className="blog-sidebar">
            <div className="blog-filter-group">
              <label className="blog-filter-label" htmlFor="blog-search">{t.blog.searchLabel}</label>
              <input
                id="blog-search"
                className="blog-filter-input"
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={t.blog.searchPlaceholder}
                aria-label={t.blog.searchPlaceholder}
              />
            </div>

            <div className="blog-filter-group">
              <div className="blog-filter-label">{t.blog.tags}</div>
              <div className="blog-tag-cloud">
                {sortedTags.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`blog-filter-tag${tag === option ? ' is-active' : ''}`}
                    onClick={() => handleTagClick(option)}
                    aria-pressed={tag === option}
                  >
                    #{option}
                  </button>
                ))}
              </div>
            </div>

            <button type="button" className="blog-reset-btn" onClick={resetFilters}>
              {t.blog.resetFilters}
            </button>
          </aside>

          <section className="blog-results" aria-labelledby="blog-page-title">
            <header className="blog-results-header">
              <h1 id="blog-page-title">{t.blog.listTitle}</h1>
              <p>{t.blog.listSub}</p>
              <div className="blog-results-meta">
                <span>{t.blog.resultCount(total)}</span>
                {search && (
                  <button
                    type="button"
                    className="blog-active-filter"
                    onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}
                    aria-label={t.blog.clearSearch}
                  >
                    {search} <span aria-hidden="true">×</span>
                  </button>
                )}
                {tag && (
                  <button
                    type="button"
                    className="blog-active-filter"
                    onClick={() => { setTag(''); setPage(1); }}
                    aria-label={t.blog.clearTag}
                  >
                    #{tag} <span aria-hidden="true">×</span>
                  </button>
                )}
              </div>
            </header>

            {loading ? (
              <p className="blog-loading">{t.blog.loading}</p>
            ) : posts.length === 0 ? (
              <div className="blog-empty"><p>{t.blog.filteredEmpty}</p></div>
            ) : (
              <>
                <ArticleCardGrid
                  posts={posts}
                  lang={lang}
                  labels={t.blog}
                  linkForPost={(post) => `/blog/${post.slug}`}
                />

                {pages > 1 && (
                  <nav className="blog-pagination" aria-label={t.blog.paginationLabel}>
                    <button
                      type="button"
                      className="blog-page-btn"
                      disabled={page <= 1}
                      onClick={() => setPage((current) => current - 1)}
                      aria-label={t.blog.previousPage}
                    >
                      ←
                    </button>
                    {Array.from({ length: pages }, (_, index) => index + 1).map((pageNumber) => (
                      <button
                        key={pageNumber}
                        type="button"
                        className={`blog-page-btn${pageNumber === page ? ' active' : ''}`}
                        onClick={() => setPage(pageNumber)}
                        aria-current={pageNumber === page ? 'page' : undefined}
                      >
                        {pageNumber}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="blog-page-btn"
                      disabled={page >= pages}
                      onClick={() => setPage((current) => current + 1)}
                      aria-label={t.blog.nextPage}
                    >
                      →
                    </button>
                  </nav>
                )}
              </>
            )}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
