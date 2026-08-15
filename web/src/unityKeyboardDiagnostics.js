import { useEffect, useLayoutEffect, useRef } from 'react';

const DEBUG_QUERY_PARAM = 'unityKeyboardDebug';
const EVENT_TYPES = [
  'keydown',
  'keypress',
  'keyup',
  'beforeinput',
  'compositionstart',
  'compositionupdate',
  'compositionend',
];
const MAX_EVENTS = 200;
const MAX_REGISTRATIONS = 200;
const UNITY_KEYBOARD_EVENT_TYPES = new Set(['keydown', 'keypress', 'keyup']);
const BROWSER_SCROLL_KEYS = new Set([
  ' ', 'Spacebar', 'PageUp', 'PageDown', 'End', 'Home',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

function describeTarget(target) {
  if (target === window) return 'window';
  if (target === document) return 'document';
  if (!(target instanceof Element)) return target?.constructor?.name ?? String(target);

  const id = target.id ? `#${target.id}` : '';
  const classes = [...target.classList].slice(0, 3).map((name) => `.${name}`).join('');
  return `${target.tagName.toLowerCase()}${id}${classes}`;
}

function trimmedStack() {
  return new Error().stack
    ?.split('\n')
    .slice(2, 9)
    .join('\n');
}

function debugEnabled() {
  if (typeof window === 'undefined') return false;
  const value = new URLSearchParams(window.location.search).get(DEBUG_QUERY_PARAM);
  return value === '1' || value === 'true';
}

function installUnityKeyboardCapture(canvas) {
  const eventTargetPrototype = EventTarget.prototype;
  const originalAddEventListener = eventTargetPrototype.addEventListener;
  const originalRemoveEventListener = eventTargetPrototype.removeEventListener;
  const capturedRegistrations = [];

  function canvasHasFocus() {
    return document.activeElement === canvas;
  }

  function preventBrowserScroll(event, type) {
    if ((type === 'keydown' || type === 'keypress')
      && (BROWSER_SCROLL_KEYS.has(event.key) || event.code === 'Space')) {
      event.preventDefault();
    }
  }

  function isUnityKeyboardHandler(target, type, listener) {
    return UNITY_KEYBOARD_EVENT_TYPES.has(type)
      && (target === window || target === canvas)
      && listener?.name === 'jsEventHandler';
  }

  function forceCapture(options) {
    if (options && typeof options === 'object') {
      return { ...options, capture: true };
    }
    return true;
  }

  const patchedAddEventListener = function patchedUnityAddEventListener(type, listener, options) {
    if (!isUnityKeyboardHandler(this, type, listener)) {
      return originalAddEventListener.call(this, type, listener, options);
    }

    const existing = capturedRegistrations.find((registration) => (
      registration.target === this
      && registration.type === type
      && registration.listener === listener
    ));
    if (existing) {
      return originalAddEventListener.call(this, type, existing.wrappedListener, forceCapture(options));
    }

    // Unity registers some keyboard handlers on window. Keep the capture-phase
    // promotion from 2f72cac for extension-resistant input, but do not let a
    // window-level handler consume keys while a page control owns focus.
    const wrappedListener = function unityKeyboardHandlerWhenFocused(event) {
      if (!canvasHasFocus()) return undefined;
      preventBrowserScroll(event, type);
      return listener.call(this, event);
    };
    capturedRegistrations.push({ target: this, type, listener, wrappedListener });
    return originalAddEventListener.call(this, type, wrappedListener, forceCapture(options));
  };

  const patchedRemoveEventListener = function patchedUnityRemoveEventListener(type, listener, options) {
    if (!isUnityKeyboardHandler(this, type, listener)) {
      return originalRemoveEventListener.call(this, type, listener, options);
    }

    const index = capturedRegistrations.findIndex((registration) => (
      registration.target === this
      && registration.type === type
      && registration.listener === listener
    ));
    if (index === -1) {
      return originalRemoveEventListener.call(this, type, listener, forceCapture(options));
    }

    const [{ wrappedListener }] = capturedRegistrations.splice(index, 1);
    return originalRemoveEventListener.call(this, type, wrappedListener, forceCapture(options));
  };

  eventTargetPrototype.addEventListener = patchedAddEventListener;
  eventTargetPrototype.removeEventListener = patchedRemoveEventListener;

  return {
    dispose() {
      for (const { target, type, wrappedListener } of capturedRegistrations) {
        originalRemoveEventListener.call(target, type, wrappedListener, true);
      }
      capturedRegistrations.length = 0;

      if (eventTargetPrototype.addEventListener === patchedAddEventListener) {
        eventTargetPrototype.addEventListener = originalAddEventListener;
      }
      if (eventTargetPrototype.removeEventListener === patchedRemoveEventListener) {
        eventTargetPrototype.removeEventListener = originalRemoveEventListener;
      }
    },
  };
}

function installKeyboardDiagnostics(canvas) {
  const eventTargetPrototype = EventTarget.prototype;
  const eventPrototype = Event.prototype;
  const originalAddEventListener = eventTargetPrototype.addEventListener;
  const originalRemoveEventListener = eventTargetPrototype.removeEventListener;
  const originalPreventDefault = eventPrototype.preventDefault;
  const originalStopPropagation = eventPrototype.stopPropagation;
  const originalStopImmediatePropagation = eventPrototype.stopImmediatePropagation;

  const eventRecords = new WeakMap();
  const events = [];
  const registrations = [];
  const interactions = [];
  let nextEventId = 1;
  let unityLoaded = false;

  function isTrackedEvent(event) {
    return EVENT_TYPES.includes(event?.type);
  }

  function getEventRecord(event) {
    let record = eventRecords.get(event);
    if (record) return record;

    record = {
      id: nextEventId++,
      type: event.type,
      time: new Date().toISOString(),
      key: event.key,
      code: event.code,
      keyCode: event.keyCode,
      which: event.which,
      location: event.location,
      repeat: event.repeat,
      isComposing: event.isComposing,
      inputType: event.inputType,
      data: event.data,
      isTrusted: event.isTrusted,
      target: describeTarget(event.target),
      activeElementAtStart: describeTarget(document.activeElement),
      path: event.composedPath?.().map(describeTarget),
      phases: [],
      cancellationCalls: [],
      unityLoaded,
      finalized: false,
    };
    eventRecords.set(event, record);
    events.push(record);
    if (events.length > MAX_EVENTS) events.shift();

    queueMicrotask(() => {
      if (record.finalized) return;
      record.finalized = true;
      record.defaultPrevented = event.defaultPrevented;
      record.cancelBubble = event.cancelBubble;
      record.activeElementAtEnd = describeTarget(document.activeElement);

      const phaseSummary = record.phases.map((phase) => phase.checkpoint).join(' > ') || 'not observed';
      const cancellationSummary = record.cancellationCalls.length
        ? ` cancellation=${record.cancellationCalls.map((call) => call.method).join(',')}`
        : '';
      console.log(
        `[UnityKeyboardDebug] #${record.id} ${record.type}`
          + ` code=${record.code ?? '-'} key=${record.key ?? '-'} keyCode=${record.keyCode ?? '-'}`
          + ` composing=${Boolean(record.isComposing)} defaultPrevented=${record.defaultPrevented}`
          + ` phases=${phaseSummary}${cancellationSummary}`,
        record,
      );
    });

    return record;
  }

  function observe(checkpoint) {
    return function observeEvent(event) {
      const record = getEventRecord(event);
      record.phases.push({
        checkpoint,
        eventPhase: event.eventPhase,
        currentTarget: describeTarget(event.currentTarget),
        activeElement: describeTarget(document.activeElement),
        defaultPrevented: event.defaultPrevented,
        cancelBubble: event.cancelBubble,
      });
    };
  }

  function recordCancellation(event, method) {
    if (!isTrackedEvent(event)) return;
    const record = getEventRecord(event);
    record.cancellationCalls.push({
      method,
      currentTarget: describeTarget(event.currentTarget),
      defaultPreventedBeforeCall: event.defaultPrevented,
      stack: trimmedStack(),
    });
  }

  const patchedPreventDefault = function patchedPreventDefault() {
    recordCancellation(this, 'preventDefault');
    return originalPreventDefault.call(this);
  };
  const patchedStopPropagation = function patchedStopPropagation() {
    recordCancellation(this, 'stopPropagation');
    return originalStopPropagation.call(this);
  };
  const patchedStopImmediatePropagation = function patchedStopImmediatePropagation() {
    recordCancellation(this, 'stopImmediatePropagation');
    return originalStopImmediatePropagation.call(this);
  };

  const patchedAddEventListener = function patchedAddEventListener(type, listener, options) {
    if (EVENT_TYPES.includes(type)) {
      registrations.push({
        action: 'add',
        time: new Date().toISOString(),
        type,
        target: describeTarget(this),
        listenerName: listener?.name || listener?.handleEvent?.name || '(anonymous)',
        capture: typeof options === 'boolean' ? options : Boolean(options?.capture),
        passive: typeof options === 'object' ? Boolean(options?.passive) : false,
        stack: trimmedStack(),
      });
      if (registrations.length > MAX_REGISTRATIONS) registrations.shift();
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  const patchedRemoveEventListener = function patchedRemoveEventListener(type, listener, options) {
    if (EVENT_TYPES.includes(type)) {
      registrations.push({
        action: 'remove',
        time: new Date().toISOString(),
        type,
        target: describeTarget(this),
        listenerName: listener?.name || listener?.handleEvent?.name || '(anonymous)',
        capture: typeof options === 'boolean' ? options : Boolean(options?.capture),
        stack: trimmedStack(),
      });
      if (registrations.length > MAX_REGISTRATIONS) registrations.shift();
    }
    return originalRemoveEventListener.call(this, type, listener, options);
  };

  eventPrototype.preventDefault = patchedPreventDefault;
  eventPrototype.stopPropagation = patchedStopPropagation;
  eventPrototype.stopImmediatePropagation = patchedStopImmediatePropagation;
  eventTargetPrototype.addEventListener = patchedAddEventListener;
  eventTargetPrototype.removeEventListener = patchedRemoveEventListener;

  const observers = [];
  function addObserver(target, type, checkpoint, capture) {
    const listener = observe(checkpoint);
    originalAddEventListener.call(target, type, listener, capture);
    observers.push({ target, type, listener, capture });
  }

  for (const type of EVENT_TYPES) {
    addObserver(window, type, 'window:capture', true);
    addObserver(document, type, 'document:capture', true);
    addObserver(canvas, type, 'canvas:capture', true);
    addObserver(canvas, type, 'canvas:bubble', false);
    addObserver(document, type, 'document:bubble', false);
    addObserver(window, type, 'window:bubble', false);
  }

  function recordInteraction(event) {
    const entry = {
      time: new Date().toISOString(),
      type: event.type,
      target: describeTarget(event.target),
      activeElement: describeTarget(document.activeElement),
      relatedTarget: describeTarget(event.relatedTarget),
    };
    interactions.push(entry);
    if (interactions.length > MAX_EVENTS) interactions.shift();
    console.info('[UnityKeyboardDebug] focus/pointer', entry);
  }

  for (const type of ['pointerdown', 'focusin', 'focusout', 'blur', 'focus']) {
    originalAddEventListener.call(document, type, recordInteraction, true);
    observers.push({ target: document, type, listener: recordInteraction, capture: true });
  }

  function snapshot() {
    return {
      capturedAt: new Date().toISOString(),
      location: window.location.href,
      userAgent: navigator.userAgent,
      platform: navigator.userAgentData?.platform ?? navigator.platform,
      language: navigator.language,
      unityLoaded,
      activeElement: describeTarget(document.activeElement),
      canvas: {
        target: describeTarget(canvas),
        tabIndex: canvas.tabIndex,
        inputMode: canvas.inputMode,
        hasFocus: document.activeElement === canvas,
      },
      events,
      registrations,
      interactions,
    };
  }

  const api = {
    snapshot,
    export: () => JSON.stringify(snapshot(), null, 2),
    clear: () => {
      events.length = 0;
      registrations.length = 0;
      interactions.length = 0;
    },
  };
  window.__unityKeyboardDebug = api;

  console.info(
    '[UnityKeyboardDebug] enabled. Reproduce the issue, then run '
      + '`copy(window.__unityKeyboardDebug.export())` in DevTools.',
    snapshot(),
  );

  return {
    markUnityLoaded(value) {
      unityLoaded = value;
      console.info(`[UnityKeyboardDebug] Unity loaded=${value}`, {
        activeElement: describeTarget(document.activeElement),
        canvas: snapshot().canvas,
      });
    },
    dispose() {
      for (const { target, type, listener, capture } of observers) {
        originalRemoveEventListener.call(target, type, listener, capture);
      }
      if (eventPrototype.preventDefault === patchedPreventDefault) {
        eventPrototype.preventDefault = originalPreventDefault;
      }
      if (eventPrototype.stopPropagation === patchedStopPropagation) {
        eventPrototype.stopPropagation = originalStopPropagation;
      }
      if (eventPrototype.stopImmediatePropagation === patchedStopImmediatePropagation) {
        eventPrototype.stopImmediatePropagation = originalStopImmediatePropagation;
      }
      if (eventTargetPrototype.addEventListener === patchedAddEventListener) {
        eventTargetPrototype.addEventListener = originalAddEventListener;
      }
      if (eventTargetPrototype.removeEventListener === patchedRemoveEventListener) {
        eventTargetPrototype.removeEventListener = originalRemoveEventListener;
      }
      if (window.__unityKeyboardDebug === api) delete window.__unityKeyboardDebug;
    },
  };
}

export function useUnityKeyboardCapture(canvasRef, isLoaded) {
  const diagnosticsRef = useRef(null);

  // Layout effects run before react-unity-webgl initializes Unity. Diagnostics
  // are installed first so they record the effective capture:true option.
  useLayoutEffect(() => {
    if (!canvasRef.current) return undefined;

    const diagnostics = debugEnabled()
      ? installKeyboardDiagnostics(canvasRef.current)
      : null;
    const keyboardCapture = installUnityKeyboardCapture(canvasRef.current);
    diagnosticsRef.current = diagnostics;

    return () => {
      keyboardCapture.dispose();
      diagnostics?.dispose();
      diagnosticsRef.current = null;
    };
  }, [canvasRef]);

  useEffect(() => {
    diagnosticsRef.current?.markUnityLoaded(isLoaded);
  }, [isLoaded]);
}
