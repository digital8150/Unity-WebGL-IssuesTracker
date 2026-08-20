import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import {
  listAdminBlogPosts,
  deleteBlogPost,
  getGame,
  listGameArticles,
  deleteGameArticle,
} from '../api.js';
import DashSidebar from '../components/DashSidebar.jsx';
import PageLink from '../components/PageLink.jsx';
import { useConfirmDialog } from '../components/ConfirmDialog.jsx';
import { useGrowl } from '../context/GrowlContext.jsx';
import { usePageNavigate } from '../hooks/usePageTransition.js';
import { withLocale } from '../i18n/localePath.js';
import './DashboardPage.css';
import './AdminBlogPage.css';

export default function AdminBlogPage({ embedded = false, gameId: embeddedGameId, game: embeddedGame }) {
  const { user: me, logout } = useAuth();
  const { lang, t } = useI18n();
  const { notify } = useGrowl();
  const { confirm, confirmationDialog } = useConfirmDialog();
  const navigate = usePageNavigate();
  const { gameId: routeGameId } = useParams();
  const gameId = embeddedGameId ?? routeGameId;
  const isGameScope = Boolean(gameId);
  const labels = isGameScope ? { ...t.blog, ...t.gameArticles } : t.blog;

  const [posts, setPosts] = useState([]);
  const [game, setGame] = useState(embeddedGame ?? null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    refresh();
    if (isGameScope && !embeddedGame) {
      getGame(gameId)
        .then(({ game: loadedGame }) => setGame(loadedGame))
        .catch((err) => notify(err.message, { type: 'error', title: t.dialog.errorTitle }));
    }
  }, [gameId, isGameScope, embeddedGame]);

  useEffect(() => {
    if (embeddedGame) setGame(embeddedGame);
  }, [embeddedGame]);

  async function refresh() {
    setLoading(true);
    try {
      const response = isGameScope
        ? await listGameArticles(gameId)
        : await listAdminBlogPosts();
      const posts = response.articles ?? response.posts ?? [];
      setPosts(posts);
    } catch (err) {
      notify(err.message, { type: 'error', title: t.dialog.errorTitle });
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!(await confirm({ message: labels.deleteConfirm, danger: true }))) return;
    setBusyId(id);
    try {
      if (isGameScope) await deleteGameArticle(gameId, id);
      else await deleteBlogPost(id);
      setPosts(prev => prev.filter(p => p._id !== id));
    } catch (err) {
      notify(err.message, { type: 'error', title: t.dialog.errorTitle });
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

  const Main = embedded ? 'div' : 'main';

  return (
    <div className={embedded ? 'gd-articles-view' : 'dash-layout'}>
      {!embedded && (
        <DashSidebar
          user={me}
          active={isGameScope ? "game-articles" : "blog"}
          backHref={isGameScope ? `/dashboard/games/${gameId}` : "/dashboard"}
          backLabel={isGameScope ? t.gameDetail.back : t.nav.dashboard}
          gameScope={isGameScope}
          gameArticleLabel={labels.adminTitle}
          onLogout={handleLogout}
        />
      )}

      <Main className={embedded ? 'gd-articles-main' : 'dash-main'}>
        <header className={`dash-header${embedded ? ' gd-articles-header' : ''}`}>
          <div>
            <h1 className="dash-page-title">{isGameScope && game ? `${game.name} · ` : ''}{labels.adminTitle}</h1>
            <p className="dash-page-sub">{labels.adminSub}</p>
          </div>
          <PageLink to={isGameScope ? `/dashboard/games/${gameId}/articles/new` : '/admin/blog/new'} className="btn btn-primary btn-sm">
            {labels.newPost}
          </PageLink>
        </header>

        {loading ? (
          <p className="dash-loading">{labels.loading}</p>
        ) : posts.length === 0 ? (
          <div className="dash-empty">
            <p className="dash-empty-desc">{labels.noPostsAdmin}</p>
            <PageLink to={isGameScope ? `/dashboard/games/${gameId}/articles/new` : '/admin/blog/new'} className="btn btn-primary btn-sm">{labels.newPost}</PageLink>
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
                  const canEdit = me?.role === 'admin'
                    || String(post.author?._id ?? post.author) === me?.id
                    || (isGameScope && String(game?.ownerId?._id ?? game?.ownerId) === me?.id);
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
                          {post.published ? labels.published : labels.draft}
                        </span>
                        <span className={`ablog-translation-status ${post.translationStatus?.status || 'missing'}`}>
                          EN: {post.translationStatus?.status || 'not queued'}
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
                        {canEdit && (
                          <PageLink
                            className="btn-ghost ablog-btn"
                            to={isGameScope ? `/dashboard/games/${gameId}/articles/${post._id}/edit` : `/admin/blog/${post._id}/edit`}
                          >
                            {labels.editPost}
                          </PageLink>
                        )}
                        {post.published && (
                          <>
                          <a
                            className="btn-ghost ablog-btn view"
                            href={isGameScope ? `/play/${game?.slug}/articles/${post.slug}` : `/blog/${post.slug}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View ↗
                          </a>
                          <a
                            className="btn-ghost ablog-btn view"
                            href={withLocale(isGameScope ? `/play/${game?.slug}/articles/${post.slug}` : `/blog/${post.slug}`, 'en')}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View EN
                          </a>
                          </>
                        )}
                        {canEdit && (
                          <button
                            className="btn-ghost ablog-btn danger"
                            disabled={busy}
                            onClick={() => handleDelete(post._id)}
                          >
                            {labels.deletePost}
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
      </Main>
      {confirmationDialog}
    </div>
  );
}
