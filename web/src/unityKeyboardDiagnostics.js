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

export function useUnityKeyboardDiagnostics(canvasRef, isLoaded) {
  const diagnosticsRef = useRef(null);

  // Layout effect runs before react-unity-webgl's passive effects initialize the
  // Unity runtime, so debug mode can inventory the listeners Unity registers.
  useLayoutEffect(() => {
    if (!debugEnabled() || !canvasRef.current) return undefined;
    diagnosticsRef.current = installKeyboardDiagnostics(canvasRef.current);
    return () => {
      diagnosticsRef.current?.dispose();
      diagnosticsRef.current = null;
    };
  }, [canvasRef]);

  useEffect(() => {
    diagnosticsRef.current?.markUnityLoaded(isLoaded);
  }, [isLoaded]);
}
