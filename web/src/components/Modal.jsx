import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Portal to <body> so the fixed overlay is anchored to the viewport rather than
  // a transformed/animated ancestor (which would break position:fixed and make
  // backdrop-filter sample an inconsistent backdrop).
  return createPortal(
    <div className="si-modal-overlay" onClick={onClose}>
      <div className={`si-modal${wide ? ' si-modal-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="si-modal-header">
          <h3>{title}</h3>
          <button type="button" className="si-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="si-modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
