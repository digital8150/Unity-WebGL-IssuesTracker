import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Unity, useUnityContext } from 'react-unity-webgl';
import { useBlocker } from 'react-router-dom';
import { NATIVE_ALERT_EVENT, useGrowl } from '../context/GrowlContext.jsx';
import { useUnityKeyboardCapture } from '../unityKeyboardDiagnostics.js';
import { disposeUnityRuntime, installUnityAudioContextTracker } from '../utils/unityLifecycle.js';

export default function UnityGame({
  loaderUrl, dataUrl, frameworkUrl, codeUrl, streamingAssetsUrl, onReady,
  gameOverTitle, gameOverReload, clickToActivate, unityErrorTitle,
  leavingLabel,
}) {
  const { notify } = useGrowl();
  const lastErrorRef = useRef({ message: '', at: 0 });
  const reportUnityError = useCallback((error) => {
    const message = error?.message || String(error ?? '').trim();
    if (!message) return;
    const now = Date.now();
    if (lastErrorRef.current.message === message && now - lastErrorRef.current.at < 1500) return;
    lastErrorRef.current = { message, at: now };
    notify(message, {
      type: 'error',
      title: unityErrorTitle ?? 'Unity runtime notice',
      duration: 8000,
    });
  }, [notify, unityErrorTitle]);

  const {
    unityProvider,
    sendMessage,
    addEventListener,
    removeEventListener,
    isLoaded,
    loadingProgression,
    initialisationError,
    UNSAFE__unityInstance,
    UNSAFE__detachAndUnloadImmediate,
  } = useUnityContext({
    loaderUrl,
    dataUrl,
    frameworkUrl,
    codeUrl,
    streamingAssetsUrl,
  });
  const [focused, setFocused] = useState(false);
  const [isGameQuit, setIsGameQuit] = useState(false);
  const [runtimeStopped, setRuntimeStopped] = useState(false);
  const [isUnloading, setIsUnloading] = useState(false);
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const audioContextsRef = useRef(new Set());
  const unityInstanceRef = useRef(UNSAFE__unityInstance);
  const detachAndUnloadRef = useRef(UNSAFE__detachAndUnloadImmediate);
  const disposePromiseRef = useRef(null);
  const navigationReleasedRef = useRef(false);
  const onReadyRef = useRef(onReady);

  unityInstanceRef.current = UNSAFE__unityInstance;
  detachAndUnloadRef.current = UNSAFE__detachAndUnloadImmediate;
  onReadyRef.current = onReady;

  useUnityKeyboardCapture(canvasRef, isLoaded);

  useLayoutEffect(() => (
    installUnityAudioContextTracker(window, audioContextsRef.current)
  ), []);

  useEffect(() => {
    if (isLoaded) onReady?.(sendMessage);
  }, [isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const dispose = useCallback((showLeavingState = false) => {
    if (showLeavingState) setIsUnloading(true);
    if (disposePromiseRef.current) return disposePromiseRef.current;

    onReadyRef.current?.(null);
    disposePromiseRef.current = disposeUnityRuntime({
      unityInstance: unityInstanceRef.current,
      detachAndUnload: detachAndUnloadRef.current,
      audioContexts: audioContextsRef.current,
      container: containerRef.current,
    });
    return disposePromiseRef.current;
  }, []);

  const navigationBlocker = useBlocker(useCallback(({ currentLocation, nextLocation }) => (
    !navigationReleasedRef.current && currentLocation.pathname !== nextLocation.pathname
  ), []));

  useEffect(() => {
    if (!initialisationError) return;
    setRuntimeStopped(true);
    reportUnityError(initialisationError);
    void dispose();
  }, [initialisationError, reportUnityError, dispose]);

  useEffect(() => {
    const handleNativeRuntimeAlert = () => {
      setRuntimeStopped(true);
      void dispose();
    };
    window.addEventListener(NATIVE_ALERT_EVENT, handleNativeRuntimeAlert);
    return () => window.removeEventListener(NATIVE_ALERT_EVENT, handleNativeRuntimeAlert);
  }, [dispose]);

  useEffect(() => {
    if (navigationBlocker.state !== 'blocked') return undefined;
    let active = true;
    const destination = navigationBlocker.location;

    dispose(true).then((result) => {
      if (!active) return;
      if (result.status === 'unloaded') {
        navigationReleasedRef.current = true;
        navigationBlocker.proceed();
        return;
      }

      // A failed or only partially-created Unity runtime cannot be trusted to
      // release Web Audio in an SPA transition. A document navigation is the
      // final containment boundary and guarantees the runtime is destroyed.
      navigationReleasedRef.current = true;
      window.location.assign(`${destination.pathname}${destination.search}${destination.hash}`);
    });

    return () => { active = false; };
  }, [navigationBlocker.state, navigationBlocker.location, navigationBlocker.proceed, dispose]);

  useEffect(() => () => { void dispose(); }, [dispose]);

  // Once the game is loaded, tell the browser not to activate IME on the canvas.
  // Without this, Korean IME intercepts A/S/D (ㅁ/ㄴ/ㅇ) as composition keys
  // and fires keydown with isComposing:true — which Unity's input system ignores.
  useEffect(() => {
    if (!isLoaded || !containerRef.current) return;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.setAttribute('inputmode', 'none');
    }
  }, [isLoaded]);

  // Listen for Unity Application.Quit() — shows the game-over overlay.
  // Also expose window.__unityGameOver() for jslib-based signalling.
  useEffect(() => {
    const handleQuit = () => setIsGameQuit(true);
    addEventListener('quitted', handleQuit);
    window.__unityGameOver = handleQuit;
    return () => {
      removeEventListener('quitted', handleQuit);
      delete window.__unityGameOver;
    };
  }, [addEventListener, removeEventListener]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%' }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {/*
        tabIndex={1}: Unity only captures keyboard events when this canvas is
        focused. Clicking a form field blurs the canvas → the keyboard bridge
        skips Unity's window-level handler, so game input stops.
      */}
      <Unity
        ref={canvasRef}
        unityProvider={unityProvider}
        style={{ width: '100%', height: '100%', display: 'block' }}
        tabIndex={1}
      />
      {!isLoaded && (
        <div style={loadingStyle}>
          <div style={loadingBarTrack}>
            <div style={{ ...loadingBarFill, width: `${Math.round(loadingProgression * 100)}%` }} />
          </div>
          <div style={loadingLabel}>{Math.round(loadingProgression * 100)}%</div>
        </div>
      )}
      {isLoaded && !focused && !isGameQuit && !runtimeStopped && (
        <div style={focusHintStyle}>
          {clickToActivate ?? 'Click to activate controls'}
        </div>
      )}
      {isGameQuit && !runtimeStopped && (
        <div style={gameOverStyle}>
          <p style={gameOverText}>{gameOverTitle ?? 'Game Over'}</p>
          <button style={reloadBtn} onClick={() => window.location.reload()}>
            {gameOverReload ?? 'Reload'}
          </button>
        </div>
      )}
      {runtimeStopped && !isUnloading && (
        <div style={gameOverStyle}>
          <p style={gameOverText}>{unityErrorTitle ?? 'Unity runtime notice'}</p>
          <button style={reloadBtn} onClick={() => window.location.reload()}>
            {gameOverReload ?? 'Reload'}
          </button>
        </div>
      )}
      {isUnloading && (
        <div style={unloadingStyle} role="status" aria-live="polite">
          <span className="play-login-gate-spinner" aria-hidden="true" />
          <span>{leavingLabel ?? 'Closing game session…'}</span>
        </div>
      )}
    </div>
  );
}

const loadingStyle = {
  position: 'absolute', inset: 0,
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  background: '#000', gap: 12,
};
const loadingBarTrack = {
  width: 200, height: 3, background: '#222', borderRadius: 2, overflow: 'hidden',
};
const loadingBarFill = {
  height: '100%', background: '#0066cc', borderRadius: 2,
  transition: 'width 0.15s ease',
};
const loadingLabel = {
  fontSize: 12, color: '#555', fontVariantNumeric: 'tabular-nums',
};
const focusHintStyle = {
  position: 'absolute', inset: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  pointerEvents: 'none',
  background: 'rgba(0,0,0,0.35)',
  color: 'rgba(255,255,255,0.7)',
  fontSize: 13,
  letterSpacing: '0.04em',
  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
};
const gameOverStyle = {
  position: 'absolute', inset: 0,
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 16,
  background: 'rgba(0,0,0,0.72)',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Pretendard", sans-serif',
};
const gameOverText = {
  margin: 0, fontSize: 20, fontWeight: 600,
  color: '#fff', letterSpacing: '-0.02em',
};
const reloadBtn = {
  padding: '0 22px', height: 38, background: '#fff', color: '#111',
  border: 'none', borderRadius: 100, cursor: 'pointer',
  fontSize: 14, fontWeight: 500,
  transition: 'opacity 0.15s',
};

const unloadingStyle = {
  position: 'absolute', inset: 0, zIndex: 4,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  background: 'rgba(0, 0, 0, 0.82)', color: 'rgba(255, 255, 255, 0.8)',
  fontSize: 13, letterSpacing: '0.02em',
};
