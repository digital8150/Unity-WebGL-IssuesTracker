import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { getIssue } from '../api.js';
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

export default function IssueDetailPage() {
  const { gameId, issueId } = useParams();
  const navigate = useNavigate();
  const { lang, toggleLang, t } = useI18n();
  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logsExpanded, setLogsExpanded] = useState(false);

  useEffect(() => {
    getIssue(issueId)
      .then(setIssue)
      .catch(() => navigate(`/dashboard/games/${gameId}`, { replace: true }))
      .finally(() => setLoading(false));
  }, [issueId]);

  if (loading) {
    return (
      <div className="dash-layout">
        <aside className="dash-sidebar"><div className="dash-logo">BugDrop</div></aside>
        <main className="dash-main"><p className="dash-loading">{t.loading}</p></main>
      </div>
    );
  }

  const ti = t.issue;
  const b = issue.browser ?? {};
  const screen = b.screen ?? {};
  const viewport = b.viewport ?? {};
  const webgl = b.webgl ?? {};
  const logs = issue.logs ?? [];
  const visibleLogs = logsExpanded ? logs : logs.slice(0, 20);
  const hasCustomState = issue.customState && Object.keys(issue.customState).length > 0;

  return (
    <div className="dash-layout">
      <aside className="dash-sidebar">
        <div className="dash-logo">BugDrop</div>
        <nav className="dash-nav">
          <Link className="dash-nav-item" to={`/dashboard/games/${gameId}`}>{t.gameDetail.backReports}</Link>
        </nav>
        <div className="dash-sidebar-footer">
          <button className="dash-footer-btn" onClick={toggleLang}>
            {lang === 'en' ? '한국어' : 'English'}
          </button>
        </div>
      </aside>

      <main className="dash-main">
        <header className="dash-header">
          <div>
            <p className="id-breadcrumb">{ti.breadcrumb} #{issueId.slice(-8)}</p>
            <h1 className="dash-page-title">{issue.title}</h1>
            <p className="id-date">{fmtDate(issue.createdAt, lang)}</p>
          </div>
        </header>

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
