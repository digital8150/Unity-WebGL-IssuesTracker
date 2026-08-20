import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n.jsx';
import Modal from './Modal.jsx';

export default function ConfirmDialog({ message, title, confirmLabel, danger = false, onCancel, onConfirm }) {
  const { t } = useI18n();

  return (
    <Modal title={title || (danger ? t.dialog.deleteTitle : t.dialog.confirmTitle)} onClose={onCancel}>
      <p className="si-confirm-message">{message}</p>
      <div className="si-modal-footer">
        <button type="button" className="btn btn-ghost si-modal-btn" onClick={onCancel} autoFocus>
          {t.dialog.cancel}
        </button>
        <button
          type="button"
          className={`btn ${danger ? 'btn-ghost si-modal-danger-btn' : 'btn-primary'} si-modal-btn`}
          onClick={onConfirm}
        >
          {confirmLabel || (danger ? t.dialog.delete : t.dialog.confirm)}
        </button>
      </div>
    </Modal>
  );
}

export function useConfirmDialog() {
  const [options, setOptions] = useState(null);
  const resolveRef = useRef(null);

  const close = useCallback((result) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setOptions(null);
    resolve?.(result);
  }, []);

  const confirm = useCallback((nextOptions) => new Promise((resolve) => {
    resolveRef.current?.(false);
    resolveRef.current = resolve;
    setOptions(nextOptions);
  }), []);

  useEffect(() => () => resolveRef.current?.(false), []);

  return {
    confirm,
    confirmationDialog: options ? (
      <ConfirmDialog
        {...options}
        onCancel={() => close(false)}
        onConfirm={() => close(true)}
      />
    ) : null,
  };
}
