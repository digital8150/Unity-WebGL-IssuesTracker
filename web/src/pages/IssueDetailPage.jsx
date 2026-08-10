import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { getIssue, updateIssue, addComment, deleteComment, voteIssue } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import PageLink from '../components/PageLink.jsx';
import { usePageNavigate } from '../hooks/usePageTransition.js';
import DarkModeToggle from '../components/DarkModeToggle.jsx';
import './DashboardPage.css';
import './IssueDetailPage.css';

function fmtDate(iso, lang) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const LOG_TYPE_CLASS = {
  Log: 'log-info',
  Warning: 'log-warn',
  Error: 'log-error',
  Exception: 'log-error',
  Assert: 'log-warn',
};

const STATUS_LIST   = ['open', 'in-progress', 'resolved', 'closed'];
const PRIORITY_LIST = ['none', 'low', 'medium', 'high'];

export default function IssueDetailPage() {
  const { gameId, issueId } = useParams();
  const navigate = usePageNavigate();
  const { lang, toggleLang, t } = useI18n();
  const { user } = useAuth();
  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [voting, setVoting] = useState(false);

  // Triage state — mirrors issue fields, updated optimistically
  const [status,   setStatusLocal]   = useState('open');
  const [priority, setPriorityLocal] = useState('none');
  const [tags,     setTagsLocal]     = useState([]);
  const [tagInput, setTagInput]      = useState('');

  // Comments state
  const [commentBody,  setCommentBody]  = useState('');
  const [posting,      setPosting]      = useState(false);
  const [deletingCid,  setDeletingCid]  = useState(null);

  useEffect(() => {
    getIssue(issueId)
      .then((data) => {
        setIssue(data);
        setStatusLocal(data.status   || 'open');
        setPriorityLocal(data.priority || 'none');
        setTagsLocal(data.tags       || []);
      })
      .catch(() => navigate(`/dashboard/games/${gameId}`, { replace: true }))
      .finally(() => setLoading(false));
  }, [issueId]);

  async function handleStatusChange(newStatus) {
    setStatusLocal(newStatus);
    try {
      const updated = await updateIssue(issueId, { status: newStatus });
      setIssue((prev) => ({ ...prev, status: updated.status }));
    } catch { setStatusLocal(issue?.status || 'open'); }
  }

  async function handlePriorityChange(newPriority) {
    setPriorityLocal(newPriority);
    try {
      const updated = await updateIssue(issueId, { priority: newPriority });
      setIssue((prev) => ({ ...prev, priority: updated.priority }));
    } catch { setPriorityLocal(issue?.priority || 'none'); }
  }

  function handleTagKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
  }

  function addTag() {
    const newTag = tagInput.trim().replace(/,+$/, '');
    if (!newTag || tags.includes(newTag)) { setTagInput(''); return; }
    const next = [...tags, newTag];
    setTagsLocal(next);
    setTagInput('');
    updateIssue(issueId, { tags: next }).then((updated) => {
      setIssue((prev) => ({ ...prev, tags: updated.tags }));
      setTagsLocal(updated.tags);
    }).catch(() => setTagsLocal(tags));
  }

  function removeTag(tag) {
    const next = tags.filter((t) => t !== tag);
    setTagsLocal(next);
    updateIssue(issueId, { tags: next }).then((updated) => {
      setIssue((prev) => ({ ...prev, tags: updated.tags }));
      setTagsLocal(updated.tags);
    }).catch(() => setTagsLocal(tags));
  }

  async function handleVote() {
    if (!user || voting) return;
    setVoting(true);
    try {
      const { voteCount, hasVoted } = await voteIssue(issueId);
      setIssue((prev) => {
        if (!prev) return prev;
        const votes = hasVoted
          ? [...(prev.votes ?? []), user.id]
          : (prev.votes ?? []).filter((v) => v !== user.id);
        return { ...prev, votes };
      });
    } finally { setVoting(false); }
  }

  async function handleAddComment(e) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setPosting(true);
    try {
      const { comment } = await addComment(issueId, commentBody.trim());
      setIssue((prev) => ({ ...prev, comments: [...(prev.comments ?? []), comment] }));
      setCommentBody('');
    } catch { /* show nothing — could add an error state */ }
    finally { setPosting(false); }
  }

  async function handleDeleteComment(commentId) {
    setDeletingCid(commentId);
    try {
      await deleteComment(issueId, commentId);
      setIssue((prev) => ({
        ...prev,
        comments: (prev.comments ?? []).filter((c) => c._id !== commentId),
      }));
    } finally { setDeletingCid(null); }
  }

  if (loading) {
    return (
      <div className="dash-layout">
        <aside className="dash-sidebar"><PageLink to="/" className="dash-logo"><BrandLogo /></PageLink></aside>
        <main className="dash-main"><p className="dash-loading">{t.loading}</p></main>
      </div>
    );
  }

  const ti = t.issue;
  const tt = t.triage;
  const tb = t.board;
  const voteCount = issue.votes?.length ?? 0;
  const hasVoted  = user ? (issue.votes ?? []).some((v) => v.toString() === user.id) : false;
  const b = issue.browser ?? {};
  const screen = b.screen ?? {};
  const viewport = b.viewport ?? {};
  const webgl = b.webgl ?? {};
  const logs = issue.logs ?? [];
  const visibleLogs = logsExpanded ? logs : logs.slice(0, 20);
  const hasCustomState = issue.customState && Object.keys(issue.customState).length > 0;
  const comments = issue.comments ?? [];

  return (
    <div className="dash-layout">
      <aside className="dash-sidebar">
        <PageLink to="/" className="dash-logo"><BrandLogo /></PageLink>
        <nav className="dash-nav">
          <PageLink className="dash-nav-item" to={`/dashboard/games/${gameId}`}>{t.gameDetail.backReports}</PageLink>
        </nav>
        <div className="dash-sidebar-footer">
          <div className="dash-footer-row">
            <button className="dash-footer-btn" onClick={toggleLang}>
              {lang === 'en' ? '한국어' : 'English'}
            </button>
            <DarkModeToggle />
          </div>
        </div>
      </aside>

      <main className="dash-main">
        <header className="dash-header">
          <div style={{ flex: 1 }}>
            <p className="id-breadcrumb">{ti.breadcrumb} #{issueId.slice(-8)}</p>
            <h1 className="dash-page-title">{issue.title}</h1>
            <p className="id-date">{fmtDate(issue.createdAt, lang)}</p>
          </div>
          {/* Vote button */}
          <button
            className={`id-vote-btn${hasVoted ? ' voted' : ''}${!user ? ' disabled' : ''}`}
            disabled={voting || !user}
            title={!user ? tb.loginToVote : undefined}
            onClick={handleVote}
          >
            <span className="id-vote-arrow">{hasVoted ? '▲' : '△'}</span>
            <span className="id-vote-count">{voteCount}</span>
            <span className="id-vote-label">{hasVoted ? tb.voted : tb.voteBtn}</span>
          </button>
        </header>

        {/* ── Triage panel ─────────────────────────────────────────────── */}
        <section className="id-section id-triage-panel">
          {/* Status */}
          <div className="id-triage-row">
            <span className="id-triage-label">{tt.status}</span>
            <div className="id-status-group">
              {STATUS_LIST.map((s) => (
                <button
                  key={s}
                  className={`id-status-btn status-${s}${status === s ? ' active' : ''}`}
                  onClick={() => handleStatusChange(s)}
                >
                  {tt.statuses[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div className="id-triage-row">
            <span className="id-triage-label">{tt.priority}</span>
            <div className="id-priority-group">
              {PRIORITY_LIST.map((p) => (
                <button
                  key={p}
                  className={`id-priority-btn priority-${p}${priority === p ? ' active' : ''}`}
                  onClick={() => handlePriorityChange(p)}
                >
                  {tt.priorities[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="id-triage-row">
            <span className="id-triage-label">{tt.tags}</span>
            <div className="id-tags-area">
              {tags.map((tag) => (
                <span key={tag} className="id-tag-chip">
                  {tag}
                  <button className="id-tag-remove" onClick={() => removeTag(tag)}>×</button>
                </span>
              ))}
              <input
                className="id-tag-input"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={addTag}
                placeholder={tags.length === 0 ? tt.tagsPlaceholder : ''}
              />
            </div>
          </div>
        </section>

        {issue.description && (
          <section className="id-section">
            <h2 className="id-section-title">{ti.description}</h2>
            <p className="id-description">{issue.description}</p>
          </section>
        )}

        <section className="id-section">
          <h2 className="id-section-title">{ti.buildInfo}</h2>
          <div className="id-grid">
            <InfoRow label={ti.product} value={issue.productName} />
            <InfoRow label={ti.version} value={issue.version} />
            <InfoRow label={ti.unity} value={issue.unityVersion} />
            <InfoRow label={ti.platform} value={issue.platform} />
            <InfoRow label={ti.gameId} value={issue.gameId} />
            <InfoRow label={ti.buildId} value={issue.buildId} />
            <InfoRow label={ti.reportedAt} value={issue.timestampUtc} />
          </div>
        </section>

        {Object.keys(b).length > 0 && (
          <section className="id-section">
            <h2 className="id-section-title">{ti.browser}</h2>
            <div className="id-grid">
              <InfoRow label={ti.userAgent} value={b.userAgent} />
              <InfoRow label={ti.platform} value={b.platform} />
              <InfoRow label={ti.language} value={b.language} />
              <InfoRow label={ti.url} value={b.url} />
              <InfoRow label={ti.screen} value={screen.width && `${screen.width}×${screen.height} @ ${screen.devicePixelRatio}x`} />
              <InfoRow label={ti.viewport} value={viewport.width && `${viewport.width}×${viewport.height}`} />
              {webgl.renderer && <InfoRow label={ti.renderer} value={webgl.renderer} />}
              {webgl.vendor && <InfoRow label={ti.vendor} value={webgl.vendor} />}
            </div>
          </section>
        )}

        {hasCustomState && (
          <section className="id-section">
            <h2 className="id-section-title">{ti.customState}</h2>
            <pre className="id-json">{JSON.stringify(issue.customState, null, 2)}</pre>
          </section>
        )}

        {logs.length > 0 && (
          <section className="id-section">
            <h2 className="id-section-title">{ti.logs} ({logs.length})</h2>
            <div className="id-log-list">
              {visibleLogs.map((entry, i) => (
                <LogEntry key={i} entry={entry} />
              ))}
            </div>
            {logs.length > 20 && (
              <button className="btn btn-ghost id-logs-toggle" onClick={() => setLogsExpanded((e) => !e)}>
                {logsExpanded ? ti.showFewer : ti.showAll(logs.length)}
              </button>
            )}
          </section>
        )}

        {/* ── Comments ─────────────────────────────────────────────────── */}
        <section className="id-section">
          <h2 className="id-section-title">{tt.comments}</h2>
          {comments.length === 0 && (
            <p className="id-no-comments">{tt.noComments}</p>
          )}
          <div className="id-comment-list">
            {comments.map((c) => (
              <div key={c._id} className="id-comment">
                <div className="id-comment-header">
                  <span className="id-comment-author">{c.authorName || 'Developer'}</span>
                  <span className="id-comment-date">{fmtDate(c.createdAt, lang)}</span>
                  <button
                    className="id-comment-delete"
                    disabled={deletingCid === c._id}
                    onClick={() => handleDeleteComment(c._id)}
                  >
                    {tt.deleteComment}
                  </button>
                </div>
                <p className="id-comment-body">{c.body}</p>
              </div>
            ))}
          </div>
          <form className="id-comment-form" onSubmit={handleAddComment}>
            <textarea
              className="id-comment-textarea"
              rows={3}
              placeholder={tt.commentPlaceholder}
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={posting || !commentBody.trim()}>
              {posting ? tt.posting : tt.addComment}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="id-info-row">
      <span className="id-info-label">{label}</span>
      <span className="id-info-value">{value}</span>
    </div>
  );
}

function LogEntry({ entry }) {
  const [open, setOpen] = useState(false);
  const typeClass = LOG_TYPE_CLASS[entry.type] ?? 'log-info';
  return (
    <div
      className={`id-log-entry ${typeClass}`}
      onClick={() => entry.stackTrace && setOpen((o) => !o)}
      style={{ cursor: entry.stackTrace ? 'pointer' : 'default' }}
    >
      <div className="id-log-header">
        <span className="id-log-type">{entry.type ?? 'Log'}</span>
        <span className="id-log-message">{entry.message}</span>
        <span className="id-log-time">{entry.timestampUtc ?? ''}</span>
      </div>
      {open && entry.stackTrace && (
        <pre className="id-log-stack">{entry.stackTrace}</pre>
      )}
    </div>
  );
}
