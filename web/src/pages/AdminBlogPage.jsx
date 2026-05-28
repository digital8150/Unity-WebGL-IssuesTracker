import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import { listAdminBlogPosts, deleteBlogPost } from '../api.js';
import BrandLogo from '../components/BrandLogo.jsx';
import DarkModeToggle from '../components/DarkModeToggle.jsx';
import './DashboardPage.css';
import './AdminBlogPage.css';

export default function AdminBlogPage() {
  const { user: me, logout } = useAuth();
  const { lang, toggleLang, t } = useI18n();
  const navigate = useNavigate();

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    setLoading(true);
    try {
      const { posts } = await listAdminBlogPosts();
      setPosts(posts);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm(t.blog.deleteConfirm)) return;
    setBusyId(id);
    try {
      await deleteBlogPost(id);
      setPosts(prev => prev.filter(p => p._id !== id));
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  }

  return (
    <div className="dash-layout">
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
          <div className="dash-footer-row">
            <button className="dash-footer-btn" onClick={toggleLang}>
              {lang === 'en' ? '한국어' : 'English'}
            </button>
            <DarkModeToggle />
          </div>
          <button className="dash-footer-btn" onClick={handleLogout}>{t.nav.signOut}</button>
        </div>
      </aside>

      <main className="dash-main">
        <header className="dash-header">
          <div>
            <h1 className="dash-page-title">{t.blog.adminTitle}</h1>
            <p className="dash-page-sub">{t.blog.adminSub}</p>
          </div>
          <Link to="/admin/blog/new" className="btn btn-primary btn-sm">
            {t.blog.newPost}
          </Link>
        </header>

        {loading ? (
          <p className="dash-loading">{t.blog.loading}</p>
        ) : posts.length === 0 ? (
          <div className="dash-empty">
            <p className="dash-empty-desc">{t.blog.noPostsAdmin}</p>
            <Link to="/admin/blog/new" className="btn btn-primary btn-sm">{t.blog.newPost}</Link>
          </div>
        ) : (
          <div className="ablog-table-wrap">
            <table className="ablog-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Tags</th>
                  <th>Date</th>
                  <th className="ablog-action-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {posts.map(post => {
                  const busy = busyId === post._id;
                  return (
                    <tr key={post._id}>
                      <td>
                        <div className="ablog-title-cell">
                          <span className="ablog-title">{post.title}</span>
                          <span className="ablog-slug">/{post.slug}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`ablog-status${post.published ? ' published' : ' draft'}`}>
                          {post.published ? t.blog.published : t.blog.draft}
                        </span>
                      </td>
                      <td>
                        <div className="ablog-tags-cell">
                          {post.tags?.slice(0, 3).map(tag => (
                            <span key={tag} className="blog-tag">{tag}</span>
                          ))}
                        </div>
                      </td>
                      <td className="ablog-date">
                        {formatDate(post.publishedAt || post.createdAt)}
                      </td>
                      <td className="ablog-actions">
                        {(me?.role === 'admin' || String(post.author?._id ?? post.author) === me?.id) && (
                          <Link
                            className="btn-ghost ablog-btn"
                            to={`/admin/blog/${post._id}/edit`}
                          >
                            {t.blog.editPost}
                          </Link>
                        )}
                        {post.published && (
                          <a
                            className="btn-ghost ablog-btn view"
                            href={`/blog/${post.slug}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View ↗
                          </a>
                        )}
                        {(me?.role === 'admin' || String(post.author?._id ?? post.author) === me?.id) && (
                          <button
                            className="btn-ghost ablog-btn danger"
                            disabled={busy}
                            onClick={() => handleDelete(post._id)}
                          >
                            {t.blog.deletePost}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
