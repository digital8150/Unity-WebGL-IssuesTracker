import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createJSONEditor, Mode } from 'vanilla-jsoneditor';
import Guifier from 'guifier';
import Modal from '../components/Modal.jsx';

// Lazy-loaded on demand: pulls in guifier + vanilla-jsoneditor (~2 MB), so those
// only download when a developer actually opens the config editor.

export default function ConfigEditModal({ cfg, td, onClose, onSave }) {
  const initialText = useMemo(() => {
    try { return JSON.stringify(JSON.parse(cfg.value), null, 2); } catch { return cfg.value; }
  }, [cfg]);

  const [text, setText] = useState(initialText);
  const [jsonError, setJsonError] = useState('');

  // `text` is the single source of truth; the visual (GUI) editor and the text
  // editor are two views over it and stay synced through this one string.
  function handleTextChange(value) {
    setText(value);
    if (jsonError) {
      try { JSON.parse(value); setJsonError(''); } catch { /* still invalid while typing */ }
    }
  }

  function handleSave() {
    try {
      JSON.parse(text);
    } catch (err) {
      setJsonError(err.message);
      return;
    }
    onSave(cfg._id, { value: text });
    onClose();
  }

  return (
    <Modal title={`${cfg.key} · ${td.siEdit}`} onClose={onClose} wide>
      <div className="si-config-visual">
        <h4 className="si-config-subtitle">{td.siConfigVisualTitle}</h4>
        <GuifierEditor value={text} onChange={handleTextChange} />
      </div>

      <div className="si-config-text">
        <h4 className="si-config-subtitle">{td.siConfigTextTitle}</h4>
        <JsonTextEditor value={text} onChange={handleTextChange} />
        {jsonError && <div className="gd-error">{jsonError}</div>}
      </div>

      <div className="si-modal-footer">
        <button type="button" className="btn btn-ghost si-modal-btn" onClick={onClose}>{td.cancel}</button>
        <button type="button" className="btn btn-primary si-modal-btn" onClick={handleSave}>{td.siSave}</button>
      </div>
    </Modal>
  );
}

// ── Guifier wrapper: GUI form editor bound to a JSON text string ───────────────

function GuifierEditor({ value, onChange }) {
  const idRef = useRef(`si-guifier-${Math.random().toString(36).slice(2)}`);
  const guifierRef = useRef(null);
  // Set right before we push a change out, so the `value` update it triggers
  // isn't fed straight back into the editor (avoids a sync loop).
  const skipNextSync = useRef(false);

  useEffect(() => {
    const el = document.getElementById(idRef.current);
    let initial = value;
    try { JSON.parse(initial); } catch { initial = '{}'; }
    const guifier = new Guifier({
      elementSelector: `#${idRef.current}`,
      data: initial,
      dataType: 'json',
      onChange: () => {
        try {
          const next = guifierRef.current.getData('json');
          skipNextSync.current = true;
          onChange(typeof next === 'string' ? next : JSON.stringify(next, null, 2));
        } catch { /* mid-edit invalid state; ignore */ }
      },
    });
    guifierRef.current = guifier;
    return () => { if (el) el.innerHTML = ''; guifierRef.current = null; };
    // Created once; external updates flow through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push external text edits into the GUI, but only for valid JSON so the form
  // keeps its last good state while the user mid-types in the text editor.
  useEffect(() => {
    if (skipNextSync.current) { skipNextSync.current = false; return; }
    const guifier = guifierRef.current;
    if (!guifier) return;
    try {
      JSON.parse(value);
      guifier.setData(value, 'json');
    } catch { /* leave the form on its last valid content */ }
  }, [value]);

  return <div id={idRef.current} className="si-guifier" />;
}

// ── vanilla-jsoneditor wrapper (text mode): the pretty JSON text editor ────────

function JsonTextEditor({ value, onChange }) {
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const skipNextSync = useRef(false);

  function toContent(text) {
    try { return { json: JSON.parse(text) }; }
    catch { return { text }; }
  }

  useEffect(() => {
    const editor = createJSONEditor({
      target: containerRef.current,
      props: {
        mode: Mode.text,
        content: toContent(value),
        onChange: (updatedContent) => {
          skipNextSync.current = true;
          const next = updatedContent.text !== undefined
            ? updatedContent.text
            : JSON.stringify(updatedContent.json, null, 2);
          onChange(next);
        },
      },
    });
    editorRef.current = editor;
    return () => { editor.destroy(); editorRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect external edits (from the GUI editor) into the text view.
  useEffect(() => {
    if (skipNextSync.current) { skipNextSync.current = false; return; }
    const editor = editorRef.current;
    if (!editor) return;
    editor.update(toContent(value));
  }, [value]);

  return <div ref={containerRef} className="si-json-editor" />;
}
