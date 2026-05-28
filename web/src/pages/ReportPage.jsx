import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { collectBrowserMetadata } from '../browserMetadata.js';
import { postIssue, getPlayInfo, getPublicIssues, voteIssue, addComment, getIssue } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import DarkModeToggle from '../components/DarkModeToggle.jsx';
import TurnstileWidget from '../components/TurnstileWidget.jsx';
import './LandingPage.css';

// ── UA helpers ────────────────────────────────────────────────────────────────

function parseBrowser(ua) {
  if (/Edg\//.test(ua))     { const m = ua.match(/Edg\/([\d]+)/);     return `Edge ${m?.[1] ?? ''}`; }
  if (/OPR\//.test(ua))     { const m = ua.match(/OPR\/([\d]+)/);     return `Opera ${m?.[1] ?? ''}`; }
  if (/Chrome\//.test(ua))  { const m = ua.match(/Chrome\/([\d]+)/);  return `Chrome ${m?.[1] ?? ''}`; }
  if (/Firefox\//.test(ua)) { const m = ua.match(/Firefox\/([\d]+)/); return `Firefox ${m?.[1] ?? ''}`; }
  if (/Safari\//.test(ua))  return 'Safari';
  return 'Unknown';
}

function parseOS(ua) {
  if (/Windows NT 10|Windows NT 11/.test(ua)) return 'Windows 10/11';
  if (/Windows NT/.test(ua))  return 'Windows';
  if (/Mac OS X/.test(ua))    return 'macOS';
  if (/Android/.test(ua))     return 'Android';
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  if (/Linux/.test(ua))       return 'Linux';
  return 'Unknown';
}

const STATUS_COLOR = {
  open:         { bg: '#e6f0ff', color: '#0055cc' },
  'in-progress':{ bg: '#fff3cd', color: '#8a4500' },
  resolved:     { bg: '#d4edda', color: '#155724' },
  closed:       { bg: '#e9ecef', color: '#495057' },
};

const PRIORITY_DOT = { high: '#dc3545', medium: '#fd7e14', low: '#6c757d' };

const PRESET_TAGS = ['bug', 'suggestion'];

// ── Page component ────────────────────────────────────────────────────────────

export default function ReportPage() {
  const { gameSlug, buildId } = useParams();
  const navigate = useNavigate();
  const { lang, toggleLang, t } = useI18n();
  const { user } = useAuth();

  const [buildInfo, setBuildInfo]   = useState(null);
  const [title, setTitle]           = useState('');
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [submitState, setSubmitState] = useState({ status: 'idle', message: '' });
  const [cfToken, setCfToken]         = useState('');
  const turnstileResetRef             = useRef(null);

  const [boardIssues, setBoardIssues] = useState([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [boardLoaded, setBoardLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedIssue, setExpandedIssue] = useState(null);
  const [loadingExpanded, setLoadingExpanded] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [guestName, setGuestName] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [votingId, setVotingId] = useState(null);

  const browserMeta = useRef(collectBrowserMetadata());
  const unityData = useRef(null);
  const navRef = useRef(null);

  const handleCfToken  = useCallback((t) => setCfToken(t),  []);
  const handleCfExpire = useCallback(() => setCfToken(''), []);

  useEffect(() => {
    if (gameSlug) {
      getPlayInfo(gameSlug, buildId || null)
        .then(setBuildInfo)
        .catch(console.error);
    }

    const stored = sessionStorage.getItem('pendingReport');
    if (stored) {
      try { unityData.current = JSON.parse(stored); } catch {}
    }
  }, [gameSlug, buildId]);

  useEffect(() => {
    function onScroll() {
      navRef.current?.classList.toggle('scrolled', window.scrollY > 8);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Load board once on mount when gameSlug is known
  useEffect(() => {
    if (!gameSlug) return;
    setBoardLoading(true);
    getPublicIssues(gameSlug)
      .then(({ issues }) => { setBoardIssues(issues); setBoardLoaded(true); })
      .catch(() => setBoardLoaded(true))
      .finally(() => setBoardLoading(false));
  }, [gameSlug]);

  // Load expanded issue detail
  useEffect(() => {
    if (!expandedId) { setExpandedIssue(null); return; }
    setLoadingExpanded(true);
    getIssue(expandedId)
      .then(setExpandedIssue)
      .catch(() => {})
      .finally(() => setLoadingExpanded(false));
  }, [expandedId]);

  function toggleTag(tag) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitState({ status: 'sending', message: t.report.sending });
    try {
      const payload = {
        ...(unityData.current || {}),
        title: title.trim(),
        description: description.trim(),
        tags: selectedTags,
        browser: browserMeta.current,
        gameId: buildInfo?.gameId,
        buildId: buildInfo?.buildId,
        turnstileToken: cfToken || undefined,
      };
      await postIssue(payload);
      setSubmitState({ status: 'success', message: t.report.success });
      setCfToken('');
      turnstileResetRef.current?.();
      sessionStorage.removeItem('pendingReport');
      setTimeout(() => {
        if (window.opener) window.close();
        else navigate(`/play/${gameSlug}${buildId ? `/${buildId}` : ''}`);
      }, 3000);
    } catch (err) {
      setSubmitState({ status: 'error', message: err.message || t.report.error });
      setCfToken('');
      turnstileResetRef.current?.();
    }
  };

  async function handleVote(issueId) {
    if (!user) return;
    setVotingId(issueId);
    try {
      const { voteCount, hasVoted } = await voteIssue(issueId);
      setBoardIssues((prev) =>
        prev.map((i) => i._id === issueId ? { ...i, voteCount, hasVoted } : i)
      );
      if (expandedIssue?._id === issueId) {
        setExpandedIssue((prev) => prev ? { ...prev, votes: hasVoted
          ? [...(prev.votes ?? []), user.id]
          : (prev.votes ?? []).filter((v) => v !== user.id) } : prev);
      }
    } catch {}
    finally { setVotingId(null); }
  }

  async function handleAddComment(e) {
    e.preventDefault();
    if (!commentBody.trim() || !expandedId) return;
    setPostingComment(true);
    try {
      const authorName = user ? undefined : (guestName.trim() || undefined);
      const { comment } = await addComment(expandedId, commentBody.trim(), authorName);
      setExpandedIssue((prev) => prev ? { ...prev, comments: [...(prev.comments ?? []), comment] } : prev);
      setCommentBody('');
    } catch {}
    finally { setPostingComment(false); }
  }

  if (!buildInfo && gameSlug) {
    return <div style={centeredPage}><p style={errSub}>{t.loading}</p></div>;
  }

  const gameName = buildInfo?.gameName ?? 'Untitled Game';
  const canvasW  = buildInfo?.canvasWidth  ?? 1920;
  const canvasH  = buildInfo?.canvasHeight ?? 1080;
  const tb = t.board;

  return (
    <div style={pageWrap}>
      {/* ── Global Nav ── */}
      <nav className="l-nav" ref={navRef}>
        <Link to="/" className="l-logo"><BrandLogo size="md" /></Link>
        <div className="l-nav-links">
          <Link to="/arcade" className="l-nav-link">{t.nav.arcade}</Link>
          <Link to="/blog" className="l-nav-link report-nav-blog">{t.nav.blog}</Link>
          <button className="l-lang-toggle" onClick={toggleLang} aria-label="Toggle language">
            {lang === 'en' ? '한국어' : 'English'}
          </button>
          <DarkModeToggle />
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
          <button onClick={() => window.close()} className="report-back-btn">{t.report.backToGame}</button>
        </div>
      </nav>

      {/* ── Report form section ── */}
      <section style={reportSection}>
        <div style={container}>
          <h1 style={reportTitle}>{t.report.title}</h1>
          <p style={reportSub}>{t.report.subtitle}</p>

          <form onSubmit={handleSubmit} className="report-form-grid">
            {/* Left: form fields */}
            <div style={formFields}>
              <label style={fieldGroup}>
                <span style={fieldLabel}>{t.report.fieldTitle} <span style={{ color: '#d33' }}>*</span></span>
                <input
                  required
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t.report.fieldTitlePlaceholder}
                  style={textInput}
                />
              </label>
              <label style={fieldGroup}>
                <span style={fieldLabel}>{t.report.fieldDescription}</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t.report.fieldDescriptionPlaceholder}
                  style={{ ...textInput, height: 160, resize: 'vertical' }}
                />
              </label>

              {/* Tag picker */}
              <div style={fieldGroup}>
                <span style={fieldLabel}>{t.report.tagLabel}</span>
                <div style={tagPickerRow}>
                  {PRESET_TAGS.map((tag) => {
                    const active = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        style={tagToggleBtn(active)}
                        onClick={() => toggleTag(tag)}
                      >
                        {tag === 'bug' ? t.report.tagBug : t.report.tagSuggestion}
                      </button>
                    );
                  })}
                </div>
              </div>

              <TurnstileWidget
                onToken={handleCfToken}
                onExpire={handleCfExpire}
                resetRef={turnstileResetRef}
              />

              <div style={formBottom}>
                {submitState.status !== 'idle' && (
                  <span style={statusMsg(submitState.status)}>{submitState.message}</span>
                )}
                <button
                  type="submit"
                  disabled={submitState.status === 'sending'}
                  style={submitBtn}
                >
                  {t.report.submit}
                </button>
              </div>
            </div>

            {/* Right: debug panel (always visible, no tabs) */}
            <aside>
              <DebugPanel
                meta={browserMeta.current}
                canvasW={canvasW}
                canvasH={canvasH}
                hasUnityData={!!unityData.current}
                t={t}
              />
            </aside>
          </form>
        </div>
      </section>

      {/* ── Browse Reports section (full width, below form) ── */}
      {gameSlug && (
        <section style={boardSection} id="board">
          <div style={container}>
            <h2 style={boardSectionTitle}>{tb.title}</h2>
            {boardLoading ? (
              <p style={boardEmpty}>{t.loading}</p>
            ) : boardLoaded && boardIssues.length === 0 ? (
              <p style={boardEmpty}>{tb.empty}</p>
            ) : (
              <div style={boardGrid}>
                {boardIssues.map((issue) => {
                  const sc = STATUS_COLOR[issue.status] ?? STATUS_COLOR.open;
                  const isExpanded = expandedId === issue._id;
                  return (
                    <div key={issue._id} style={boardCard}>
                      {/* Card header */}
                      <div style={boardCardHeader}>
                        {/* Vote button */}
                        <button
                          type="button"
                          title={!user ? tb.loginToVote : undefined}
                          style={voteButton(issue.hasVoted, !user)}
                          disabled={votingId === issue._id || !user}
                          onClick={() => handleVote(issue._id)}
                        >
                          <span style={voteArrow}>{issue.hasVoted ? '▲' : '△'}</span>
                          <span style={voteCount}>{issue.voteCount}</span>
                        </button>

                        {/* Title + meta */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={boardCardTitle}>{issue.title}</div>
                          <div style={boardCardMeta}>
                            <span style={{ ...statusBadge, background: sc.bg, color: sc.color }}>
                              {t.triage.statuses[issue.status] ?? t.triage.statuses.open}
                            </span>
                            {issue.priority && issue.priority !== 'none' && (
                              <span style={{ ...priorityDot, background: PRIORITY_DOT[issue.priority] }} />
                            )}
                            {issue.tags?.map((tag) => (
                              <span key={tag} style={tagChip}>{tag}</span>
                            ))}
                          </div>
                        </div>

                        {/* Comment count + expand */}
                        <div style={boardCardRight}>
                          {issue.commentCount > 0 && (
                            <span style={commentCountBadge}>💬 {issue.commentCount}</span>
                          )}
                          <button
                            type="button"
                            style={expandBtn}
                            onClick={() => {
                              setExpandedId(isExpanded ? null : issue._id);
                              setCommentBody('');
                            }}
                          >
                            {isExpanded ? tb.collapse : tb.expand}
                          </button>
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div style={expandedArea}>
                          {loadingExpanded ? (
                            <p style={boardEmpty}>{t.loading}</p>
                          ) : expandedIssue ? (
                            <>
                              {expandedIssue.description && (
                                <p style={expandedDesc}>{expandedIssue.description}</p>
                              )}
                              {/* Comments */}
                              <div style={commentsSection}>
                                <p style={commentsLabel}>
                                  {tb.comments(expandedIssue.comments?.length ?? 0)}
                                </p>
                                {(expandedIssue.comments ?? []).map((c) => (
                                  <div key={c._id} style={commentItem}>
                                    <div style={commentAuthorStyle}>{c.authorName}</div>
                                    <div style={commentBodyStyle}>{c.body}</div>
                                  </div>
                                ))}
                                {/* Comment form — available to everyone */}
                                <form style={commentForm} onSubmit={handleAddComment}>
                                  {!user && (
                                    <input
                                      style={{ ...commentTextarea, height: 34, resize: 'none' }}
                                      placeholder={tb.guestNamePlaceholder}
                                      value={guestName}
                                      onChange={(e) => setGuestName(e.target.value)}
                                    />
                                  )}
                                  <textarea
                                    style={commentTextarea}
                                    rows={2}
                                    placeholder={t.triage.commentPlaceholder}
                                    value={commentBody}
                                    onChange={(e) => setCommentBody(e.target.value)}
                                  />
                                  <button
                                    type="submit"
                                    style={commentSubmitBtn}
                                    disabled={postingComment || !commentBody.trim()}
                                  >
                                    {postingComment ? t.triage.posting : t.triage.addComment}
                                  </button>
                                </form>
                              </div>
                            </>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      <footer className="l-footer">
        <span className="l-footer-logo"><BrandLogo size="sm" /></span>
        <span className="l-footer-copy">{t.footer.tagline}</span>
      </footer>
    </div>
  );
}

// ── DebugPanel ────────────────────────────────────────────────────────────────

function DebugPanel({ meta, canvasW, canvasH, hasUnityData, t }) {
  const browser     = parseBrowser(meta.userAgent);
  const os          = parseOS(meta.userAgent);
  const screenStr   = `${meta.screen.width} × ${meta.screen.height}${meta.screen.dpr !== 1 ? ` @${meta.screen.dpr}x` : ''}`;
  const viewportStr = `${meta.viewport.width} × ${meta.viewport.height}`;

  return (
    <div style={debugAside}>
      <div style={debugCard}>
        <p style={debugCardTitle}>{t.report.envCollected}</p>
        <div style={tableBlock}>
          <InfoRow icon="🌐" k={t.report.browser}  v={browser} />
          <InfoRow icon="💻" k={t.report.os}       v={os} />
          <InfoRow icon="🗣" k={t.report.language} v={meta.language} />
        </div>
        <div style={{ ...tableBlock, marginTop: 6 }}>
          <InfoRow icon="🖥" k={t.report.screen}   v={screenStr} />
          <InfoRow icon="📐" k={t.report.viewport} v={viewportStr} />
          <InfoRow icon="🎮" k={t.report.canvas}   v={`${canvasW} × ${canvasH}`} />
        </div>
        {meta.webgl && (
          <div style={{ ...tableBlock, marginTop: 6 }}>
            <InfoRow icon="⚡" k={t.report.gpu}    v={meta.webgl.renderer} mono />
            <InfoRow icon="🏭" k={t.report.vendor} v={meta.webgl.vendor}   mono />
            <InfoRow icon="🔧" k={t.report.webgl}  v={meta.webgl.version?.replace('WebGL ', 'GL ')} mono />
          </div>
        )}
      </div>
      <div style={{ ...debugCard, marginTop: 10, opacity: hasUnityData ? 1 : 0.5 }}>
        <p style={debugCardTitle}>{t.report.unityRuntime} — {hasUnityData ? t.report.unityAttached : t.report.unityNotFound}</p>
        <div style={unityNoteList}>
          {[
            ['⚙️', 'Unity version',          'Application.unityVersion'],
            ['📱', 'Platform',                'Application.platform'],
            ['🏷',  'Product name & version', 'Application.productName / .version'],
            ['📋', 'Console logs (≤ 200)',    'Application.logMessageReceivedThreaded'],
            ['🎲', 'Custom game state',       'OnCollectCustomState (if registered)'],
          ].map(([icon, label, src]) => (
            <div key={label} style={unityNoteRow}>
              <span style={{ fontSize: 13, width: 22, flexShrink: 0 }}>{icon}</span>
              <div style={{ flex: 1 }}>
                <span style={unityNoteLabel}>{label}</span>
                <span style={unityNoteSource}>{src}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, k, v, mono }) {
  return (
    <div style={infoRow}>
      <span style={infoKey}>
        <span style={{ marginRight: 5, fontSize: 12 }}>{icon}</span>{k}
      </span>
      <span style={{
        ...infoVal,
        fontFamily: mono ? '"Consolas","Courier New",monospace' : 'inherit',
        fontSize:   mono ? 10 : 11,
      }}>{v}</span>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const FONT    = '"Pretendard", system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';
const INK     = '#171717';
const MUTED   = '#888888';
const PARCH   = '#fafafa';
const HAIRLINE= '#ebebeb';
const BLUE    = '#171717';

const centeredPage = {
  minHeight: '100vh', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', fontFamily: FONT, background: '#fff',
};
const errSub    = { fontSize: 14, color: MUTED, marginTop: 8 };
const pageWrap  = { fontFamily: FONT, background: '#fff', minHeight: '100vh', color: INK };
const container = { maxWidth: 1080, margin: '0 auto', padding: '0 24px' };


const reportSection = { background: PARCH, padding: '56px 0 64px' };
const reportTitle   = { fontSize: 28, fontWeight: 600, color: INK, letterSpacing: '-0.28px', margin: '0 0 10px' };
const reportSub     = { fontSize: 17, color: MUTED, margin: '0 0 36px', lineHeight: 1.5 };

const formFields = { display: 'flex', flexDirection: 'column', gap: 16 };
const fieldGroup = { display: 'flex', flexDirection: 'column', gap: 6 };
const fieldLabel = { fontSize: 13, fontWeight: 600, color: INK, letterSpacing: '0.02em' };
const textInput  = {
  padding: '0 12px', height: 40, background: '#fff', color: INK,
  border: `1px solid ${HAIRLINE}`, borderRadius: 6, fontFamily: FONT, fontSize: 14,
  outline: 'none', width: '100%', boxSizing: 'border-box',
};
const formBottom  = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 4 };
const submitBtn   = {
  padding: '0 24px', height: 40, background: BLUE, color: '#fff',
  border: 'none', borderRadius: 100, cursor: 'pointer', fontFamily: FONT, fontSize: 14, fontWeight: 500,
};
const statusMsg = (status) => ({
  fontSize: 14, color: status === 'error' ? '#c0392b' : status === 'success' ? '#1a7f4b' : MUTED,
});

// Tag picker
const tagPickerRow = { display: 'flex', gap: 8, flexWrap: 'wrap' };
const tagToggleBtn = (active) => ({
  padding: '6px 16px', borderRadius: 100,
  background: active ? '#171717' : '#f0f0f0',
  color: active ? '#fff' : INK,
  border: `1px solid ${active ? '#171717' : HAIRLINE}`,
  fontFamily: FONT, fontSize: 13, fontWeight: active ? 600 : 400,
  cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
});

// Debug panel
const debugAside = { display: 'flex', flexDirection: 'column' };
const debugCard  = { background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 18, padding: '16px 18px' };
const debugCardTitle = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: '#777', margin: '0 0 10px',
};
const tableBlock = { background: PARCH, borderRadius: 8, overflow: 'hidden', border: `1px solid ${HAIRLINE}` };
const infoRow    = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px', borderBottom: `1px solid ${HAIRLINE}` };
const infoKey    = { fontSize: 11, color: MUTED, display: 'flex', alignItems: 'center', minWidth: 72 };
const infoVal    = { fontSize: 11, color: INK, textAlign: 'right', wordBreak: 'break-all', maxWidth: 180 };
const unityNoteList   = { display: 'flex', flexDirection: 'column', gap: 8 };
const unityNoteRow    = { display: 'flex', alignItems: 'flex-start', gap: 8 };
const unityNoteLabel  = { display: 'block', fontSize: 12, color: INK, fontWeight: 500 };
const unityNoteSource = { display: 'block', fontSize: 10, color: MUTED, marginTop: 1, fontFamily: '"Consolas","Courier New",monospace' };

// Board section (below form)
const boardSection = {
  background: '#fff', borderTop: `1px solid ${HAIRLINE}`,
  padding: '48px 0 80px',
};
const boardSectionTitle = {
  fontSize: 22, fontWeight: 600, color: INK, letterSpacing: '-0.22px',
  margin: '0 0 24px',
};
const boardEmpty = { fontSize: 13, color: MUTED, padding: '12px 0' };

const boardGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))',
  gap: 12,
};

const boardCard = {
  background: PARCH, border: `1px solid ${HAIRLINE}`, borderRadius: 12,
  overflow: 'hidden', transition: 'box-shadow 0.15s',
};
const boardCardHeader = { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '14px 16px' };
const boardCardTitle  = { fontSize: 14, fontWeight: 600, color: INK, marginBottom: 5, lineHeight: 1.3 };
const boardCardMeta   = { display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' };
const boardCardRight  = { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 };

const voteButton = (hasVoted, disabled) => ({
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  gap: 2, background: hasVoted ? '#e6f0ff' : '#fff',
  border: `1px solid ${hasVoted ? '#0070f3' : HAIRLINE}`,
  borderRadius: 8, padding: '6px 8px', cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1, minWidth: 42, transition: 'background 0.15s, border-color 0.15s',
});
const voteArrow = { fontSize: 14, color: '#0070f3', lineHeight: 1 };
const voteCount = { fontSize: 11, fontWeight: 600, color: INK };

const statusBadge = {
  display: 'inline-flex', alignItems: 'center', height: 18, padding: '0 7px',
  borderRadius: 100, fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'capitalize',
};
const priorityDot = { width: 7, height: 7, borderRadius: '50%', display: 'inline-block', flexShrink: 0 };
const tagChip     = {
  fontSize: 10, padding: '2px 7px', borderRadius: 100,
  background: '#f0f0f0', color: MUTED, border: `1px solid ${HAIRLINE}`,
};
const commentCountBadge = { fontSize: 11, color: MUTED };
const expandBtn   = {
  fontSize: 11, color: '#0070f3', background: 'none', border: 'none',
  cursor: 'pointer', padding: 0, textDecoration: 'underline', whiteSpace: 'nowrap',
};

const expandedArea = {
  borderTop: `1px solid ${HAIRLINE}`, padding: '14px 16px',
  background: '#fff', display: 'flex', flexDirection: 'column', gap: 12,
};
const expandedDesc   = { fontSize: 13, color: '#444', lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0 };
const commentsSection = { display: 'flex', flexDirection: 'column', gap: 8 };
const commentsLabel  = { fontSize: 11, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 };
const commentItem    = { background: PARCH, border: `1px solid ${HAIRLINE}`, borderRadius: 8, padding: '8px 12px' };
const commentAuthorStyle = { fontSize: 11, fontWeight: 600, color: INK, marginBottom: 4 };
const commentBodyStyle   = { fontSize: 13, color: '#444', lineHeight: 1.5, whiteSpace: 'pre-wrap' };
const commentForm    = { display: 'flex', flexDirection: 'column', gap: 6 };
const commentTextarea = {
  border: `1px solid ${HAIRLINE}`, borderRadius: 8, padding: '8px 10px',
  fontFamily: FONT, fontSize: 13, resize: 'vertical', outline: 'none',
};
const commentSubmitBtn = {
  alignSelf: 'flex-end', padding: '6px 16px', background: BLUE, color: '#fff',
  border: 'none', borderRadius: 100, cursor: 'pointer', fontFamily: FONT, fontSize: 12, fontWeight: 500,
};
