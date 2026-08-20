import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import GrowlViewport from '../components/Growl.jsx';

const GrowlContext = createContext(null);
const MAX_GROWLS = 3;
const DEFAULT_DURATION = 7000;
export const NATIVE_ALERT_EVENT = 'arcade:native-alert';

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

  // Keep browser-native alert UI out of the application, including late
  // errors emitted by third-party runtimes after their React view unmounts.
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const nativeAlert = window.alert;
    const showCustomAlert = (message) => {
      notify(message, { type: 'error', duration: 8000 });
      window.dispatchEvent(new CustomEvent(NATIVE_ALERT_EVENT, { detail: message }));
    };
    window.alert = showCustomAlert;
    return () => {
      if (window.alert === showCustomAlert) window.alert = nativeAlert;
    };
  }, [notify]);

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
