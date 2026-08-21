import { useEffect } from 'react';
import { issuePlayToken } from '../api.js';

export const TOKEN_REFRESH_MS = 9 * 60 * 1000;
export const TOKEN_REQUEST_DEBOUNCE_MS = 2 * 1000;
export const TOKEN_RETRY_MS = 5 * 1000;

/**
 * Keeps a single-game Arcade SDK v2 credential fresh for the play page.
 *
 * Owns the whole browser-side half of the credential handshake: it issues the
 * first token, pushes it into Unity via `SendMessage`, schedules the renewal
 * ahead of the 15-minute expiry, retries after a failure, and exposes the two
 * `window.__arcadeSdk*` globals the jslib bridge calls into. Every timer and
 * global is torn down on unmount or dependency change.
 *
 * @param {object} params
 * @param {string} params.gameSlug Slug of the game being played.
 * @param {boolean} params.sdkV2Enabled Whether the resolved build enables SDK v2.
 * @param {boolean} params.authLoading Whether the site session is still resolving.
 * @param {object|null} params.user Signed-in member, or null when anonymous.
 * @param {{ current: Function|null }} params.sendMessageRef Ref holding Unity's `SendMessage`.
 * @param {{ current: object|null }} params.tokenRef Ref the caller reads the live token from.
 */
export function useArcadePlayToken({
  gameSlug,
  sdkV2Enabled,
  authLoading,
  user,
  sendMessageRef,
  tokenRef,
}) {
  useEffect(() => {
    const shouldConnect = Boolean(gameSlug && sdkV2Enabled === true && !authLoading && user);

    tokenRef.current = null;
    if (!shouldConnect) return undefined;

    let disposed = false;
    let refreshTimer = null;
    let debounceTimer = null;
    let lastRequestAt = 0;
    let requestInFlight = null;

    const pushCredential = () => {
      const nextToken = tokenRef.current;
      if (!nextToken || !sendMessageRef.current) return;
      sendMessageRef.current('ArcadeSdk', 'SetCredential', JSON.stringify(nextToken));
    };

    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        requestToken();
      }, TOKEN_REFRESH_MS);
    };

    const refreshToken = () => {
      if (disposed || requestInFlight) return requestInFlight;
      lastRequestAt = Date.now();
      requestInFlight = issuePlayToken(gameSlug)
        .then((nextToken) => {
          if (!nextToken?.token) throw new Error('Play token response did not include a token');
          if (disposed) return;
          tokenRef.current = nextToken;
          pushCredential();
          scheduleRefresh();
        })
        .catch((error) => {
          if (!disposed) {
            console.warn('[ArcadeSdk] play token request failed', error);
            window.clearTimeout(refreshTimer);
            refreshTimer = window.setTimeout(() => {
              refreshTimer = null;
              if (!disposed) requestToken();
            }, TOKEN_RETRY_MS);
          }
        })
        .finally(() => {
          requestInFlight = null;
        });
      return requestInFlight;
    };

    const requestToken = () => {
      if (disposed) return;
      const waitMs = TOKEN_REQUEST_DEBOUNCE_MS - (Date.now() - lastRequestAt);
      if (waitMs > 0) {
        window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
          debounceTimer = null;
          refreshToken();
        }, waitMs);
        return;
      }
      refreshToken();
    };

    // Unity may announce readiness before its React wrapper reports isLoaded;
    // the callback remains available until either side is ready.
    window.__arcadeSdkReady = pushCredential;
    // Unity can also ask the page for a replacement after a 401. Keep this
    // browser-owned request path debounced so repeated SDK calls cannot stampede
    // the play-token endpoint.
    window.__arcadeSdkRequestToken = requestToken;
    requestToken();

    return () => {
      disposed = true;
      tokenRef.current = null;
      window.clearTimeout(refreshTimer);
      window.clearTimeout(debounceTimer);
      if (window.__arcadeSdkReady === pushCredential) delete window.__arcadeSdkReady;
      if (window.__arcadeSdkRequestToken === requestToken) delete window.__arcadeSdkRequestToken;
    };
  }, [gameSlug, sdkV2Enabled, authLoading, user]);
}
