import React, { useEffect, useRef, useState } from 'react';
import { Unity, useUnityContext } from 'react-unity-webgl';
import { useUnityKeyboardCapture } from '../unityKeyboardDiagnostics.js';

export default function UnityGame({
  loaderUrl, dataUrl, frameworkUrl, codeUrl, streamingAssetsUrl, onReady,
  gameOverTitle, gameOverReload, clickToActivate,
}) {
  const { unityProvider, sendMessage, unload, addEventListener, removeEventListener, isLoaded, loadingProgression } = useUnityContext({
    loaderUrl,
    dataUrl,
    frameworkUrl,
    codeUrl,
    streamingAssetsUrl,
  });
  const [focused, setFocused] = useState(false);
  const [isGameQuit, setIsGameQuit] = useState(false);
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const unloadRef = useRef(unload);

  useUnityKeyboardCapture(canvasRef, isLoaded);

  useEffect(() => { unloadRef.current = unload; }, [unload]);

  useEffect(() => {
    if (isLoaded) onReady?.(sendMessage);
  }, [isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Run only on unmount. Using a ref avoids re-running (and premature cleanup)
  // every time useUnityContext re-creates the unload reference during loading.
  useEffect(() => {
    return () => { unloadRef.current(); };
  }, []);

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
        focused. Clicking a form field blurs the canvas → game input stops.
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
      {isLoaded && !focused && !isGameQuit && (
        <div style={focusHintStyle}>
          {clickToActivate ?? 'Click to activate controls'}
        </div>
      )}
      {isGameQuit && (
        <div style={gameOverStyle}>
          <p style={gameOverText}>{gameOverTitle ?? 'Game Over'}</p>
          <button style={reloadBtn} onClick={() => window.location.reload()}>
            {gameOverReload ?? 'Reload'}
          </button>
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
