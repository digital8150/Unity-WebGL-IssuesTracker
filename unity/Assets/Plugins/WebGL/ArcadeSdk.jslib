mergeInto(LibraryManager.library, {
  ArcadeSdk_Ready: function () {
    try {
      if (typeof window.__arcadeSdkReady === 'function') {
        window.__arcadeSdkReady();
      } else {
        console.warn('[ArcadeSdk] window.__arcadeSdkReady is not defined');
      }
    } catch (e) {
      console.error('[ArcadeSdk] ready notification failed', e);
    }
  },
  ArcadeSdk_RequestToken: function () {
    try {
      if (typeof window.__arcadeSdkRequestToken === 'function') {
        window.__arcadeSdkRequestToken();
      } else {
        console.warn('[ArcadeSdk] window.__arcadeSdkRequestToken is not defined');
      }
    } catch (e) {
      console.error('[ArcadeSdk] token request failed', e);
    }
  },
});
