import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import { addGameComment, deleteGameComment, listGameComments } from '../api.js';
import TurnstileWidget from './TurnstileWidget.jsx';
import './CommentSection.css';

function formatDate(dateStr, lang) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Play-page comments. Comments are paged from newest to oldest rather than
 * embedded in the page payload, because a game accumulates far more of them
 * than a single blog post does.
 */
export default function CommentSection({ gameSlug }) {
  const { user } = useAuth();
  const { t, lang } = useI18n();

  const [comments, setComments] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [body, setBody] = useState('');
  const [guestName, setGuestName] = useState('');
  const [cfToken, setCfToken] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const turnstileResetRef = useRef(null);

  useEffect(() => {
    if (!gameSlug) return undefined;
    let cancelled = false;
    setLoading(true);
    listGameComments(gameSlug)
      .then((data) => {
        if (cancelled) return;
        setComments(data.comments ?? []);
        setTotal(data.total ?? 0);
        setHasMore(Boolean(data.hasMore));
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [gameSlug]);

  const loadMore = useCallback(async () => {
    const oldest = comments[comments.length - 1];
    if (!oldest || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await listGameComments(gameSlug, { before: oldest.createdAt });
      setComments((prev) => [...prev, ...(data.comments ?? [])]);
      setHasMore(Boolean(data.hasMore));
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [comments, gameSlug, loadingMore]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!body.trim() || posting) return;
    setPosting(true);
    setError('');
    try {
      const { comment } = await addGameComment(
        gameSlug,
        body.trim(),
        guestName,
        !user ? cfToken : undefined,
      );
      setComments((prev) => [comment, ...prev]);
      setTotal((prev) => prev + 1);
      setBody('');
      setCfToken('');
      turnstileResetRef.current?.();
    } catch (err) {
      setError(err.message || t.blog.commentError);
      setCfToken('');
      turnstileResetRef.current?.();
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete(commentId) {
    try {
      await deleteGameComment(gameSlug, commentId);
      setComments((prev) => prev.filter((c) => c._id !== commentId));
      setTotal((prev) => Math.max(prev - 1, 0));
    } catch (err) {
      setError(err.message || t.blog.commentError);
    }
  }

  // The server also lets the game owner and collaborators moderate, but the
  // play page has no ownership signal, so the button only shows where the
  // client can be sure. A hidden button never blocks the API.
  const canDelete = (comment) => Boolean(
    user && (user.role === 'admin' || String(comment.authorId) === String(user.id)),
  );

  return (
    <section className="play-comments">
      <h2 className="play-comments-title">{t.blog.comments(total)}</h2>

      {loading && <p className="play-comments-empty">{t.loading}</p>}
      {!loading && comments.length === 0 && (
        <p className="play-comments-empty">{t.blog.noComments}</p>
      )}

      <div className="play-comment-list">
        {comments.map((c) => (
          <div key={c._id} className="play-comment-item">
            <div className="play-comment-header">
              <span className="play-comment-author">{c.authorName}</span>
              <span className="play-comment-date">{formatDate(c.createdAt, lang)}</span>
              {canDelete(c) && (
                <button
                  type="button"
                  className="play-comment-delete"
                  onClick={() => handleDelete(c._id)}
                >
                  {t.blog.deleteComment}
                </button>
              )}
            </div>
            <p className="play-comment-body">{c.body}</p>
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          type="button"
          className="play-comment-more btn btn-secondary btn-sm"
          onClick={loadMore}
          disabled={loadingMore}
        >
          {loadingMore ? t.loading : t.play.loadMoreComments}
        </button>
      )}

      <form className="play-comment-form" onSubmit={handleSubmit}>
        <h3 className="play-comment-form-title">{t.blog.leaveComment}</h3>

        {!user && (
          <input
            className="play-comment-name form-input"
            placeholder={t.blog.guestNamePlaceholder}
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            maxLength={100}
          />
        )}

        <textarea
          className="play-comment-textarea form-input"
          rows={4}
          maxLength={2000}
          placeholder={t.blog.commentPlaceholder}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
        />

        {!user && (
          <TurnstileWidget
            onToken={setCfToken}
            onExpire={() => setCfToken('')}
            resetRef={turnstileResetRef}
          />
        )}

        {error && <p className="play-comment-error">{error}</p>}

        <button
          type="submit"
          className="play-comment-submit btn btn-primary"
          disabled={posting || !body.trim()}
        >
          {posting ? t.blog.posting : t.blog.submitComment}
        </button>
      </form>
    </section>
  );
}
