mergeInto(LibraryManager.library, {
  IssueTracker_SubmitReport: function (payloadPtr) {
    try {
      var json = UTF8ToString(payloadPtr);
      if (typeof window.__issueTrackerReceive === 'function') {
        window.__issueTrackerReceive(json);
      } else {
        console.warn('[IssueTracker] window.__issueTrackerReceive is not defined');
      }
    } catch (e) {
      console.error('[IssueTracker] submit failed', e);
    }
  },
  IssueTracker_GameOver: function () {
    if (typeof window.__unityGameOver === 'function') {
      window.__unityGameOver();
    }
  },
});
