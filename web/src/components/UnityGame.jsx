import React from 'react';
import { Unity, useUnityContext } from 'react-unity-webgl';

export default function UnityGame({ loaderUrl, dataUrl, frameworkUrl, codeUrl, renderOverlay, inputBlocked }) {
  const { unityProvider, sendMessage, isLoaded, loadingProgression } = useUnityContext({
    loaderUrl,
    dataUrl,
    frameworkUrl,
    codeUrl,
  });

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Unity
        unityProvider={unityProvider}
        style={{ width: '100%', height: '100%', background: '#000', pointerEvents: inputBlocked ? 'none' : 'auto' }}
        tabIndex={inputBlocked ? -1 : 0}
      />
      {!isLoaded && (
        <div style={loadingStyle}>
          Loading… {Math.round(loadingProgression * 100)}%
        </div>
      )}
      {isLoaded && renderOverlay?.(sendMessage)}
    </div>
  );
}

const loadingStyle = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#eee',
  background: '#111',
  fontSize: 20,
};
