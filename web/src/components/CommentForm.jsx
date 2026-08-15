import React, { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import TurnstileWidget from './TurnstileWidget.jsx';
import './CommentForm.css';

/**
 * Shared public comment form used by blog articles and game pages.
 *
 * The caller owns the API request and updates its comment list. This keeps the
 * guest/authenticated form behavior and its visual treatment in one place.
 */
export default function CommentForm({ onSubmit, error: externalError = '' }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [body, setBody] = useState('');
  const [guestName, setGuestName] = useState('');
  const [cfToken, setCfToken] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const turnstileResetRef = useRef(null);

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmedBody = body.trim();
    if (!trimmedBody || posting) return;

    setPosting(true);
    setError('');
    try {
      await onSubmit({
        body: trimmedBody,
        authorName: user ? undefined : (guestName.trim() || undefined),
        turnstileToken: user ? undefined : cfToken,
      });
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

  return (
    <form className="comment-form" onSubmit={handleSubmit}>
      <h3 className="comment-form-title">{t.blog.leaveComment}</h3>

      {!user && (
        <input
          className="comment-name"
          placeholder={t.blog.guestNamePlaceholder}
          value={guestName}
          onChange={(event) => setGuestName(event.target.value)}
          maxLength={100}
        />
      )}

      <textarea
        className="comment-textarea"
        rows={4}
        maxLength={2000}
        placeholder={t.blog.commentPlaceholder}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        required
      />

      {!user && (
        <TurnstileWidget
          onToken={setCfToken}
          onExpire={() => setCfToken('')}
          resetRef={turnstileResetRef}
        />
      )}

      {(externalError || error) && (
        <p className="comment-error">{externalError || error}</p>
      )}

      <button
        type="submit"
        className="comment-submit btn btn-primary"
        disabled={posting || !body.trim()}
      >
        {posting ? t.blog.posting : t.blog.submitComment}
      </button>
    </form>
  );
}
