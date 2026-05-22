import React, { useState } from 'react';

export default function IssueReportOverlay({ onClose, onSubmit }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), description: description.trim() });
  };

  return (
    <div style={backdrop} onClick={onClose}>
      <form style={modal} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 style={{ margin: '0 0 12px' }}>Report a Bug</h2>
        <label style={label}>
          Title
          <input
            autoFocus
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={input}
            placeholder="Short summary"
          />
        </label>
        <label style={label}>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ ...input, height: 140, resize: 'vertical' }}
            placeholder="What happened? Steps to reproduce?"
          />
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
          <button type="submit" style={btnPrimary}>Submit</button>
        </div>
      </form>
    </div>
  );
}

const backdrop = {
  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20,
};
const modal = {
  background: '#222', color: '#eee', padding: 20, borderRadius: 8,
  width: 'min(480px, 90vw)', boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
};
const label = { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, fontSize: 14 };
const input = {
  padding: 8, background: '#111', color: '#eee',
  border: '1px solid #444', borderRadius: 4, fontFamily: 'inherit', fontSize: 14,
};
const btnPrimary = { padding: '8px 14px', background: '#d33', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' };
const btnSecondary = { padding: '8px 14px', background: '#444', color: '#eee', border: 'none', borderRadius: 4, cursor: 'pointer' };
