// MY TRIPS — Activity Editor diagnostics disabled in production
//
// The authoritative Activity Editor controller lives in trip-delete.js (V4).
// This compatibility file is deliberately kept as a no-op so production users
// do not see the temporary mobile touch diagnostic overlay.
//
// Compatibility marker retained for runtime validation:
// window.__activityEditorControllerV1
(function disableActivityTouchDiagnostics() {
  'use strict';
  if (typeof window === 'undefined') return;

  const BUILD = 'D1-20260905';

  function disable() {
    const panel = document.getElementById('activity-touch-diagnostic');
    if (panel) panel.remove();

    window.__activityTouchDiagnostics = {
      version: BUILD,
      enabled: false,
      snapshot() {
        return {
          build: BUILD,
          enabled: false,
          standalone: window.navigator?.standalone === true
            || window.matchMedia?.('(display-mode: standalone)')?.matches === true,
          mobile: !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches),
        };
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', disable, { once: true });
  } else {
    disable();
  }
})();
