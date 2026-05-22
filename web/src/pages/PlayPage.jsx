import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import UnityGame from '../components/UnityGame.jsx';
import IssueReportOverlay from '../components/IssueReportOverlay.jsx';
import { collectBrowserMetadata } from '../browserMetadata.js';
import { postIssue, getPlayInfo } from '../api.js';

export default function PlayPage() {
  const { gameSlug, buildId } = useParams();

  const [buildInfo, setBuildInfo] = useState(null);
  const [loadError, setLoadError] = useState('');

  const [overlayOpen, setOverlayOpen] = useState(false);
  const [submitState, setSubmitState] = useState({ status: 'idle', message: '' });
  const pendingMeta = useRef(null);

  // Load build info from server when we have a gameSlug route param.
  useEffect(() => {
    if (!gameSlug) {
      // Legacy local-dev path — no build info needed, UnityGame uses its own hardcoded URLs.
      setBuildInfo('legacy');
      return;
    }
    getPlayInfo(gameSlug, buildId || null)
      .then((info) => setBuildInfo(info))
      .catch((err) => setLoadError(err.message));
  }, [gameSlug, buildId]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setOverlayOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Blur Unity canvas when overlay opens so keyboard events stop reaching the game.
  useEffect(() => {
    if (overlayOpen) {
      document.activeElement?.blur();
    }
  }, [overlayOpen]);

  useEffect(() => {
    window.__issueTrackerReceive = async (payloadJson) => {
      try {
        const payload = JSON.parse(payloadJson);
        const meta = pendingMeta.current ?? collectBrowserMetadata();
        pendingMeta.current = null;
        const finalPayload = {
          ...payload,
          browser: meta,
          gameId: buildInfo?.gameId,
          buildId: buildInfo?.buildId,
        };
        setSubmitState({ status: 'sending', message: 'Submitting...' });
        await postIssue(finalPayload);
        setSubmitState({ status: 'success', message: 'Report submitted. Thanks!' });
        setTimeout(() => setSubmitState({ status: 'idle', message: '' }), 3000);
      } catch (err) {
        console.error(err);
        setSubmitState({ status: 'error', message: err.message || 'Submit failed' });
      }
    };
    return () => { delete window.__issueTrackerReceive; };
  }, [buildInfo]);

  const handleSubmit = useCallback(({ title, description, sendMessage }) => {
    pendingMeta.current = collectBrowserMetadata();
    sendMessage('IssueTracker', 'SubmitReport', JSON.stringify({ title, description }));
    setOverlayOpen(false);
  }, []);

  if (loadError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#aaa', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 18 }}>Could not load game</div>
        <div style={{ fontSize: 14, color: '#666' }}>{loadError}</div>
      </div>
    );
  }

  if (!buildInfo) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#aaa' }}>
        Loading…
      </div>
    );
  }

  const urls = buildInfo === 'legacy'
    ? {
        loaderUrl: '/unity/Build/game.loader.js',
        dataUrl: '/unity/Build/game.data',
        frameworkUrl: '/unity/Build/game.framework.js',
        codeUrl: '/unity/Build/game.wasm',
      }
    : {
        loaderUrl: buildInfo.urls.loader,
        dataUrl: buildInfo.urls.data,
        frameworkUrl: buildInfo.urls.framework,
        codeUrl: buildInfo.urls.wasm,
      };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <UnityGame
        {...urls}
        inputBlocked={overlayOpen}
        renderOverlay={(sendMessage) => (
          <>
            <button onClick={() => setOverlayOpen(true)} style={overlayButtonStyle}>
              Report Bug (F2)
            </button>
            {overlayOpen && (
              <IssueReportOverlay
                onClose={() => setOverlayOpen(false)}
                onSubmit={(values) => handleSubmit({ ...values, sendMessage })}
              />
            )}
            {submitState.status !== 'idle' && (
              <div style={toastStyle(submitState.status)}>{submitState.message}</div>
            )}
          </>
        )}
      />
    </div>
  );
}

const overlayButtonStyle = {
  position: 'absolute', top: 16, right: 16, zIndex: 10,
  padding: '8px 14px', background: '#d33', color: '#fff',
  border: 'none', borderRadius: 4, cursor: 'pointer',
};

const toastStyle = (status) => ({
  position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
  padding: '10px 16px', borderRadius: 4,
  background: status === 'error' ? '#a33' : status === 'success' ? '#3a7' : '#444',
  color: '#fff', zIndex: 11,
});
