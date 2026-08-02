import React from 'react';
import './Growl.css';

const ICONS = {
  error: '!',
  warning: '△',
  success: '✓',
  info: 'i',
};

export default function GrowlViewport({ items, onDismiss }) {
  return (
    <div className="growl-viewport" aria-live="polite" aria-atomic="false">
      {items.map((item) => (
        <div key={item.id} className={['growl', 'growl-' + item.type].join(' ')} role="status">
          <span className="growl-icon" aria-hidden="true">{ICONS[item.type]}</span>
          <div className="growl-copy">
            {item.title && <p className="growl-title">{item.title}</p>}
            <p className="growl-message">{item.message}</p>
          </div>
          <button
            type="button"
            className="growl-dismiss"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(item.id)}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ))}
    </div>
  );
}
