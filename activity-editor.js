// MY TRIPS — Activity Editor diagnostic companion
//
// The authoritative activity controller currently lives in trip-delete.js (V4).
// This file is intentionally diagnostic-only while the iPhone Home Screen issue
// is being traced. It MUST NOT prevent, cancel or synthesize any interaction.
//
// Compatibility marker retained for runtime validation:
// window.__activityEditorControllerV1
(function installActivityTouchDiagnostics() {
  'use strict';
  if (typeof window === 'undefined' || window.__activityTouchDiagnostics) return;

  const BUILD = 'D1-20260905';
  const state = {
    lastEvent: 'ready',
    lastTarget: '-',
    lastPointTarget: '-',
    lastButton: '-',
    lastControllerAction: '-',
    x: null,
    y: null,
  };

  function isMobile() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
  }

  function isStandalone() {
    return window.navigator?.standalone === true
      || window.matchMedia?.('(display-mode: standalone)')?.matches === true;
  }

  function overlay() {
    return document.getElementById('modal-overlay');
  }

  function modalOpen() {
    return !!overlay()?.classList.contains('open');
  }

  function shortNode(node) {
    if (!(node instanceof Element)) return String(node?.nodeName || '-');
    const id = node.id ? '#' + node.id : '';
    const classes = String(node.className || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(name => '.' + name)
      .join('');
    const text = String(node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 22);
    return (node.tagName || 'el').toLowerCase() + id + classes + (text ? '[' + text + ']' : '');
  }

  function controller() {
    return window.__activityEditorControllerV4
      || window.__activityEditorControllerV3
      || window.__activityEditorControllerV2
      || window.__activityEditorControllerV1
      || null;
  }

  function ensurePanel() {
    let panel = document.getElementById('activity-touch-diagnostic');
    if (panel) return panel;
    if (!document.body) return null;

    panel = document.createElement('div');
    panel.id = 'activity-touch-diagnostic';
    panel.setAttribute('aria-hidden', 'true');
    panel.style.cssText = [
      'position:fixed',
      'left:8px',
      'right:8px',
      'bottom:calc(8px + env(safe-area-inset-bottom,0px))',
      'z-index:2147483647',
      'padding:7px 9px',
      'border-radius:9px',
      'background:rgba(17,24,28,.92)',
      'color:#fff',
      'font:600 10px/1.35 -apple-system,BlinkMacSystemFont,system-ui,sans-serif',
      'letter-spacing:.01em',
      'box-shadow:0 2px 12px rgba(0,0,0,.24)',
      'pointer-events:none',
      'user-select:none',
      '-webkit-user-select:none',
      'display:none',
      'white-space:normal',
      'word-break:break-word'
    ].join(';');
    document.body.appendChild(panel);
    return panel;
  }

  function render(extra = '') {
    const panel = ensurePanel();
    if (!panel) return;
    panel.style.display = modalOpen() && isMobile() ? 'block' : 'none';
    if (panel.style.display === 'none') return;

    let diag = {};
    try { diag = controller()?.diagnostics?.() || {}; } catch (_) {}
    const mode = isStandalone() ? 'APP' : 'WEB';
    const point = Number.isFinite(state.x) && Number.isFinite(state.y)
      ? Math.round(state.x) + ',' + Math.round(state.y)
      : '-';
    panel.textContent = [
      'ACTIVITY ' + BUILD + ' · ' + mode,
      'event=' + state.lastEvent + ' @' + point,
      'target=' + state.lastTarget,
      'atPoint=' + state.lastPointTarget,
      'button=' + state.lastButton,
      'controller=' + (diag.version || '-') + ' action=' + (diag.lastTouchAction || state.lastControllerAction || '-'),
      extra
    ].filter(Boolean).join(' | ');
  }

  function pointButton(x, y) {
    try {
      const hit = controller()?.actionButtonAt?.(x, y);
      if (hit?.button) return hit.button;
    } catch (_) {}
    return null;
  }

  function note(type, event, touch) {
    if (!modalOpen()) return;
    const x = Number(touch?.clientX ?? event?.clientX);
    const y = Number(touch?.clientY ?? event?.clientY);
    state.lastEvent = type;
    state.x = Number.isFinite(x) ? x : null;
    state.y = Number.isFinite(y) ? y : null;
    state.lastTarget = shortNode(event?.target);

    let pointTarget = null;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      try { pointTarget = document.elementFromPoint(x, y); } catch (_) {}
    }
    state.lastPointTarget = shortNode(pointTarget);
    const button = Number.isFinite(x) && Number.isFinite(y) ? pointButton(x, y) : null;
    state.lastButton = shortNode(button);
    render();

    // Let the authoritative controller finish first, then read its reported action.
    if (type === 'touchend' || type === 'pointerup' || type === 'click') {
      window.setTimeout(() => {
        let diag = {};
        try { diag = controller()?.diagnostics?.() || {}; } catch (_) {}
        state.lastControllerAction = diag.lastTouchAction || state.lastControllerAction;
        render();
      }, 60);
    }
  }

  function installListeners() {
    // Observation only: passive touch/pointer listeners and no stop/prevent calls.
    window.addEventListener('touchstart', event => {
      const touch = event.touches?.length === 1 ? event.touches[0] : null;
      note('touchstart', event, touch);
    }, { capture:true, passive:true });

    window.addEventListener('touchend', event => {
      const touch = event.changedTouches?.length === 1 ? event.changedTouches[0] : null;
      note('touchend', event, touch);
    }, { capture:true, passive:true });

    window.addEventListener('pointerdown', event => note('pointerdown:' + (event.pointerType || '?'), event, event), { capture:true, passive:true });
    window.addEventListener('pointerup', event => note('pointerup:' + (event.pointerType || '?'), event, event), { capture:true, passive:true });
    window.addEventListener('click', event => note('click:' + (event.isTrusted ? 'trusted' : 'synthetic'), event, event), true);
  }

  function observeModal() {
    const el = overlay();
    if (!el) return;
    const observer = new MutationObserver(() => {
      if (modalOpen()) {
        state.lastEvent = 'modal-open';
        state.lastTarget = '-';
        state.lastPointTarget = '-';
        state.lastButton = '-';
        render('tap Meal, Point Of Interest or X');
      } else {
        render();
      }
    });
    observer.observe(el, { attributes:true, attributeFilter:['class'] });
  }

  function init() {
    ensurePanel();
    installListeners();
    observeModal();
    if (modalOpen()) render('tap Meal, Point Of Interest or X');
    window.__activityTouchDiagnostics = {
      version: BUILD,
      snapshot() {
        let controllerDiag = {};
        try { controllerDiag = controller()?.diagnostics?.() || {}; } catch (_) {}
        return { ...state, build:BUILD, standalone:isStandalone(), mobile:isMobile(), controller:controllerDiag };
      }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
