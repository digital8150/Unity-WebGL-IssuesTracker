import React, { useState, useEffect } from 'react';
import { collectBrowserMetadata } from '../browserMetadata.js';

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

export default function IssueReportOverlay({ onClose, onSubmit }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [meta, setMeta] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMeta(collectBrowserMetadata());
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const close = () => {
    setVisible(false);
    setTimeout(onClose, 280);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), description: description.trim() });
  };

  return (
    <div style={backdropStyle} onClick={close}>
      <aside
        style={{ ...sidebarStyle, transform: visible ? 'translateX(0)' : 'translateX(100%)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>
          <span style={{ fontWeight: 600, fontSize: 15, color: '#eee' }}>🐛 Report a Bug</span>
          <button onClick={close} style={closeBtnStyle} aria-label="Close">✕</button>
        </div>

        <form onSubmit={submit} style={formStyle}>
          <div style={formBodyStyle}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Title <span style={{ color: '#e55' }}>*</span></span>
              <input
                autoFocus
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={inputStyle}
                placeholder="Short summary of the issue"
              />
            </label>

            <label style={labelStyle}>
              <span style={labelTextStyle}>Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ ...inputStyle, height: 110, resize: 'vertical' }}
                placeholder="What happened? Steps to reproduce?"
              />
            </label>

            {meta && <DebugPanel meta={meta} />}
          </div>

          <div style={footerStyle}>
            <button type="button" onClick={close} style={btnSecondary}>Cancel</button>
            <button type="submit" style={btnPrimary}>Submit Report →</button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function DebugPanel({ meta }) {
  const [collapsed, setCollapsed] = useState(false);

  const browser    = parseBrowser(meta.userAgent);
  const os         = parseOS(meta.userAgent);
  const screenStr  = `${meta.screen.width} × ${meta.screen.height}${meta.screen.dpr !== 1 ? ` @${meta.screen.dpr}x` : ''}`;
  const viewportStr = `${meta.viewport.width} × ${meta.viewport.height}`;
  const timeStr    = new Date(meta.timestampUtc).toLocaleTimeString();

  return (
    <div style={debugWrapStyle}>
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        style={{ ...debugHeaderStyle, borderBottom: collapsed ? 'none' : '1px solid #252525' }}
      >
        <span style={debugTitleStyle}>Auto-detected debug info</span>
        <span style={{ color: '#555', fontSize: 10 }}>{collapsed ? '▶' : '▼'}</span>
      </button>

      {!collapsed && (
        <div style={debugBodyStyle}>
          <InfoSection label="System">
            <InfoRow icon="🌐" label="Browser"  value={browser} />
            <InfoRow icon="💻" label="OS"       value={os} />
            <InfoRow icon="🗣" label="Language" value={meta.language} />
          </InfoSection>

          <InfoSection label="Display">
            <InfoRow icon="🖥" label="Screen"   value={screenStr} />
            <InfoRow icon="📐" label="Viewport" value={viewportStr} />
          </InfoSection>

          {meta.webgl && (
            <InfoSection label="WebGL">
              <InfoRow icon="🎮" label="GPU"    value={meta.webgl.renderer} mono />
              <InfoRow icon="🏭" label="Vendor" value={meta.webgl.vendor} mono />
            </InfoSection>
          )}

          <div style={timestampRowStyle}>
            <span style={{ color: '#444', fontSize: 10 }}>🕐</span>
            <span style={{ color: '#444', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>{timeStr}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoSection({ label, children }) {
  return (
    <div style={sectionStyle}>
      <span style={sectionLabelStyle}>{label}</span>
      <div style={sectionRowsStyle}>{children}</div>
    </div>
  );
}

function InfoRow({ icon, label, value, mono }) {
  return (
    <div style={infoRowStyle}>
      <span style={infoKeyStyle}>
        <span style={{ marginRight: 5, fontSize: 12 }}>{icon}</span>
        {label}
      </span>
      <span style={{
        ...infoValueStyle,
        fontFamily: mono ? '"Consolas","Courier New",monospace' : 'inherit',
        fontSize: mono ? 10 : 11,
      }}>
        {value}
      </span>
    </div>
  );
}

// ── Layout ──────────────────────────────────────────────────
const backdropStyle = {
  position: 'absolute', inset: 0,
  background: 'rgba(0,0,0,0.5)',
  zIndex: 20,
  display: 'flex',
  justifyContent: 'flex-end',
};

const sidebarStyle = {
  width: 360,
  height: '100%',
  background: '#1c1c1c',
  boxShadow: '-12px 0 40px rgba(0,0,0,0.7)',
  display: 'flex',
  flexDirection: 'column',
  transition: 'transform 0.27s cubic-bezier(0.4, 0, 0.2, 1)',
  overflow: 'hidden',
  borderLeft: '1px solid #2a2a2a',
};

const headerStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '15px 18px',
  borderBottom: '1px solid #262626',
  flexShrink: 0,
};

const closeBtnStyle = {
  background: 'none', border: 'none', color: '#555',
  cursor: 'pointer', fontSize: 15, padding: '2px 6px',
  borderRadius: 4, lineHeight: 1,
};

const formStyle = {
  display: 'flex', flexDirection: 'column',
  flex: 1, overflow: 'hidden',
};

const formBodyStyle = {
  flex: 1, overflowY: 'auto',
  padding: '16px 18px',
  display: 'flex', flexDirection: 'column', gap: 14,
};

const footerStyle = {
  display: 'flex', gap: 8, justifyContent: 'flex-end',
  padding: '13px 18px',
  borderTop: '1px solid #262626',
  flexShrink: 0,
};

// ── Form controls ────────────────────────────────────────────
const labelStyle = { display: 'flex', flexDirection: 'column', gap: 5 };
const labelTextStyle = { fontSize: 12, color: '#999', fontWeight: 600, letterSpacing: '0.04em' };
const inputStyle = {
  padding: '9px 11px',
  background: '#141414', color: '#e0e0e0',
  border: '1px solid #303030', borderRadius: 6,
  fontFamily: 'inherit', fontSize: 13,
  outline: 'none',
  transition: 'border-color 0.15s',
};

const btnPrimary = {
  padding: '8px 16px', background: '#171717', color: '#fff',
  border: 'none', borderRadius: 6, cursor: 'pointer',
  fontWeight: 500, fontSize: 12, letterSpacing: '-0.01em',
  transition: 'opacity 0.15s',
};
const btnSecondary = {
  padding: '8px 14px', background: '#252525', color: '#999',
  border: '1px solid #333', borderRadius: 5, cursor: 'pointer', fontSize: 12,
};

// ── Debug panel ──────────────────────────────────────────────
const debugWrapStyle = {
  background: '#141414',
  border: '1px solid #262626',
  borderRadius: 8,
  overflow: 'hidden',
  marginTop: 2,
};

const debugHeaderStyle = {
  width: '100%',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '8px 12px',
  background: 'none', border: 'none', cursor: 'pointer',
};

const debugTitleStyle = {
  fontSize: 10, fontWeight: 700,
  letterSpacing: '0.1em', textTransform: 'uppercase',
  color: '#555',
};

const debugBodyStyle = {
  padding: '10px 12px',
  display: 'flex', flexDirection: 'column', gap: 10,
};

const sectionStyle = {
  display: 'flex', flexDirection: 'column', gap: 1,
};

const sectionLabelStyle = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: '#3a3a3a',
  marginBottom: 3,
};

const sectionRowsStyle = {
  background: '#181818',
  borderRadius: 5,
  overflow: 'hidden',
  border: '1px solid #242424',
};

const infoRowStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '5px 10px',
  borderBottom: '1px solid #1e1e1e',
};

const infoKeyStyle = {
  fontSize: 11, color: '#555',
  display: 'flex', alignItems: 'center',
  minWidth: 72, flexShrink: 0,
};

const infoValueStyle = {
  color: '#888',
  textAlign: 'right',
  wordBreak: 'break-all',
  maxWidth: 190,
  lineHeight: 1.4,
};

const timestampRowStyle = {
  display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
  gap: 5, paddingTop: 2,
};
