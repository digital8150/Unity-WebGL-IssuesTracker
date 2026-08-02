import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import GrowlViewport from '../components/Growl.jsx';

const GrowlContext = createContext(null);
const MAX_GROWLS = 3;
const DEFAULT_DURATION = 7000;

export function GrowlProvider({ children }) {
  const [items, setItems] = useState([]);
  const timersRef = useRef(new Map());
  const nextIdRef = useRef(0);

  const dismiss = useCallback((id) => {
    setItems((current) => current.filter((item) => item.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const notify = useCallback((message, options = {}) => {
    const text = String(message ?? '').trim();
    if (!text) return null;

    const type = ['error', 'warning', 'success', 'info'].includes(options.type)
      ? options.type
      : 'info';
    const duration = Number.isFinite(options.duration)
      ? Math.max(0, options.duration)
      : DEFAULT_DURATION;
    const id = 'growl-' + Date.now() + '-' + nextIdRef.current++;
    const item = {
      id,
      type,
      title: options.title ? String(options.title) : '',
      message: text,
    };

    setItems((current) => [...current, item].slice(-MAX_GROWLS));
    if (duration > 0) {
      const timer = window.setTimeout(() => dismiss(id), duration);
      timersRef.current.set(id, timer);
    }
    return id;
  }, [dismiss]);

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current.clear();
  }, []);

  return (
    <GrowlContext.Provider value={{ notify, dismiss }}>
      {children}
      <GrowlViewport items={items} onDismiss={dismiss} />
    </GrowlContext.Provider>
  );
}

export function useGrowl() {
  const context = useContext(GrowlContext);
  if (!context) throw new Error('useGrowl must be used inside GrowlProvider');
  return context;
}
