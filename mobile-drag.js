// MY TRIPS — mobile long-press itinerary reordering
// Dedicated iOS/Android touch handler for POI / attraction / ticket rows.
(function () {
  'use strict';

  if (!window.matchMedia || !window.matchMedia('(max-width: 768px)').matches) return;
  if (window.__mobileTimelineDragInstalled) return;
  window.__mobileTimelineDragInstalled = true;

  const ELIGIBLE_TYPES = new Set(['place', 'poi', 'act', 'attraction', 'ticket']);
  const HOLD_MS = 280;
  const MOVE_THRESHOLD = 7;

  let row = null;
  let originalTarget = null;
  let touchId = null;
  let timer = null;
  let mode = 'idle'; // idle | waiting | scrolling | dragging
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let startScrollTop = 0;
  let scrollEl = null;

  function injectStyles() {
    if (document.getElementById('mobile-timeline-drag-style')) return;
    const style = document.createElement('style');
    style.id = 'mobile-timeline-drag-style';
    style.textContent = `
      @media (max-width: 768px) {
        .tl-item.mobile-drag-eligible,
        .tl-item.mobile-drag-eligible * {
          -webkit-user-select: none !important;
          user-select: none !important;
          -webkit-touch-callout: none !important;
          -webkit-user-drag: none !important;
        }
        .tl-item.mobile-drag-active { cursor: grabbing; }

        #modal-overlay .modal-head {
          display:grid !important;
          grid-template-columns:96px minmax(0,1fr) 40px !important;
          grid-template-rows:auto !important;
          align-items:center !important;
          gap:6px !important;
          padding:10px 12px !important;
          min-height:0 !important;
          background:#f2f4f4 !important;
          border-bottom:1px solid rgba(100,120,128,.14) !important;
          box-shadow:none !important;
        }
        #modal-overlay .modal-title {
          grid-column:1 !important;
          grid-row:1 !important;
          position:static !important;
          left:auto !important;
          right:auto !important;
          top:auto !important;
          bottom:auto !important;
          transform:none !important;
          -webkit-transform:none !important;
          width:auto !important;
          max-width:none !important;
          min-width:0 !important;
          min-height:38px !important;
          margin:0 !important;
          padding:0 !important;
          display:flex !important;
          align-items:center !important;
          justify-content:flex-start !important;
          overflow:visible !important;
          white-space:nowrap !important;
          font-size:14px !important;
          line-height:1.1 !important;
        }
        #modal-overlay .modal-tabs {
          grid-column:2 !important;
          grid-row:1 !important;
          position:static !important;
          display:flex !important;
          width:100% !important;
          min-width:0 !important;
          min-height:38px !important;
          margin:0 !important;
          padding:3px !important;
          gap:3px !important;
          border-radius:10px !important;
          background:rgba(102,117,125,.10) !important;
        }
        #modal-overlay .modal-tab {
          flex:1 1 0 !important;
          min-width:0 !important;
          min-height:32px !important;
          padding:6px 5px !important;
          border-radius:8px !important;
          font-size:10px !important;
          line-height:1.1 !important;
          white-space:nowrap !important;
        }
        #modal-overlay .modal-close {
          grid-column:3 !important;
          grid-row:1 !important;
          position:static !important;
          left:auto !important;
          right:auto !important;
          top:auto !important;
          transform:none !important;
          width:40px !important;
          height:40px !important;
          min-width:40px !important;
          margin:0 !important;
          justify-self:end !important;
          background:rgba(99,115,122,.08) !important;
          border-radius:11px !important;
        }
        html.ios-standalone #modal-overlay .modal-head {
          padding-top:calc(10px + env(safe-area-inset-top,0px)) !important;
        }
      }

      @media (max-width: 390px) {
        #modal-overlay .modal-head {
          grid-template-columns:88px minmax(0,1fr) 38px !important;
          gap:5px !important;
          padding-left:10px !important;
          padding-right:10px !important;
        }
        #modal-overlay .modal-title { font-size:13px !important; }
        #modal-overlay .modal-tab {
          padding-left:3px !important;
          padding-right:3px !important;
          font-size:9.5px !important;
        }
        #modal-overlay .modal-close {
          width:38px !important;
          height:38px !important;
          min-width:38px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function important(el, property, value) {
    if (el?.style) el.style.setProperty(property, value, 'important');
  }

  function applyModalHeaderLayout() {
    const head = document.querySelector('#modal-overlay .modal-head');
    const title = document.querySelector('#modal-overlay .modal-title');
    const tabs = document.querySelector('#modal-overlay .modal-tabs');
    const close = document.querySelector('#modal-overlay .modal-close');
    if (!head || !title || !tabs || !close) return;

    const narrow = window.innerWidth <= 390;
    important(head, 'display', 'grid');
    important(head, 'grid-template-columns', narrow ? '88px minmax(0,1fr) 38px' : '96px minmax(0,1fr) 40px');
    important(head, 'grid-template-rows', 'auto');
    important(head, 'align-items', 'center');
    important(head, 'gap', narrow ? '5px' : '6px');
    important(head, 'padding-left', narrow ? '10px' : '12px');
    important(head, 'padding-right', narrow ? '10px' : '12px');
    important(head, 'padding-bottom', '10px');
    important(head, 'background', '#f2f4f4');
    important(head, 'border-bottom', '1px solid rgba(100,120,128,.14)');

    [
      ['grid-column', '1'], ['grid-row', '1'], ['position', 'static'],
      ['left', 'auto'], ['right', 'auto'], ['top', 'auto'], ['bottom', 'auto'],
      ['transform', 'none'], ['-webkit-transform', 'none'], ['width', 'auto'],
      ['max-width', 'none'], ['min-width', '0'], ['margin', '0'], ['padding', '0'],
      ['display', 'flex'], ['align-items', 'center'], ['justify-content', 'flex-start'],
      ['overflow', 'visible'], ['white-space', 'nowrap'], ['font-size', narrow ? '13px' : '14px'],
      ['line-height', '1.1']
    ].forEach(([property, value]) => important(title, property, value));

    [
      ['grid-column', '2'], ['grid-row', '1'], ['position', 'static'],
      ['left', 'auto'], ['right', 'auto'], ['top', 'auto'], ['transform', 'none'],
      ['width', '100%'], ['min-width', '0'], ['margin', '0'], ['display', 'flex']
    ].forEach(([property, value]) => important(tabs, property, value));

    [
      ['grid-column', '3'], ['grid-row', '1'], ['position', 'static'],
      ['left', 'auto'], ['right', 'auto'], ['top', 'auto'], ['transform', 'none'],
      ['width', narrow ? '38px' : '40px'], ['height', narrow ? '38px' : '40px'],
      ['min-width', narrow ? '38px' : '40px'], ['margin', '0'], ['justify-self', 'end']
    ].forEach(([property, value]) => important(close, property, value));
  }

  function currentItem(candidate) {
    if (!candidate || typeof STATE === 'undefined' || typeof activeDay === 'undefined') return null;
    const idx = Number(candidate.dataset.idx);
    if (!Number.isInteger(idx)) return null;
    return STATE.days?.[activeDay]?.items?.[idx] || null;
  }

  function eligibleRowFrom(target) {
    if (!(target instanceof Element)) return null;
    if (target.closest('.tl-complete-btn, .tl-more-btn, input, select, textarea, label')) return null;
    const candidate = target.closest('.tl-item');
    if (!candidate) return null;
    const item = currentItem(candidate);
    return item && ELIGIBLE_TYPES.has(item.type) ? candidate : null;
  }

  function decorateRows() {
    const root = document.getElementById('tl-col');
    if (!root) return;
    root.querySelectorAll('.tl-item').forEach(candidate => {
      const item = currentItem(candidate);
      candidate.classList.toggle('mobile-drag-eligible', !!item && ELIGIBLE_TYPES.has(item.type));
    });
  }

  function harden(candidate) {
    if (!candidate) return;
    candidate.classList.add('mobile-drag-eligible');
    [candidate, ...candidate.querySelectorAll('*')].forEach(node => {
      if (!node.style) return;
      node.style.setProperty('-webkit-user-select', 'none', 'important');
      node.style.setProperty('user-select', 'none', 'important');
      node.style.setProperty('-webkit-touch-callout', 'none', 'important');
      node.style.setProperty('-webkit-user-drag', 'none', 'important');
      if ('draggable' in node) node.draggable = false;
    });
  }

  function clearSelection() {
    try {
      const selection = window.getSelection?.();
      if (selection?.rangeCount) selection.removeAllRanges();
    } catch (_) {}
  }

  function clearTimer() {
    if (timer) window.clearTimeout(timer);
    timer = null;
  }

  function reset() {
    clearTimer();
    row?.classList.remove('mobile-drag-active');
    row = null;
    originalTarget = null;
    touchId = null;
    mode = 'idle';
    startX = startY = lastX = lastY = 0;
    startScrollTop = 0;
    scrollEl = null;
  }

  function touchFrom(list) {
    if (!list) return null;
    for (const touch of list) {
      if (touch.identifier === touchId) return touch;
    }
    return null;
  }

  function recreateTap(target) {
    if (!(target instanceof Element)) return;
    target.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    }));
  }

  function sharedDragReady() {
    return typeof startDragVisual === 'function'
      && typeof updateDropTarget === 'function'
      && typeof onDragEnd === 'function'
      && typeof dragCleanup === 'function';
  }

  function beginSharedDrag() {
    if (!row || !sharedDragReady()) return false;
    try {
      dragEl = row;
      dragStartX = startX;
      dragStartY = startY;
      dragMoved = true;
      startDragVisual();
      updateDropTarget(startY);
      return !!dragGhost;
    } catch (_) {
      try { dragCleanup(); } catch (_) {}
      return false;
    }
  }

  function moveSharedDrag(x, y) {
    try {
      const dx = x - startX;
      const dy = y - startY;
      if (dragGhost) {
        dragGhost.style.top = (dragGhost._baseTop + dy) + 'px';
        dragGhost.style.left = (dragGhost._baseLeft + dx) + 'px';
      }
      updateDropTarget(y);
    } catch (_) {}
  }

  function finishSharedDrag(cancelled) {
    try {
      if (cancelled) dragCleanup();
      else onDragEnd();
    } catch (_) {
      try { dragCleanup(); } catch (_) {}
    }
  }

  function onTouchStart(event) {
    if (!event.touches || event.touches.length !== 1) return;
    const candidate = eligibleRowFrom(event.target);
    if (!candidate) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    clearSelection();
    reset();

    row = candidate;
    originalTarget = event.target;
    harden(row);

    const touch = event.touches[0];
    touchId = touch.identifier;
    startX = lastX = touch.clientX;
    startY = lastY = touch.clientY;
    scrollEl = row.closest('.v2-content') || document.scrollingElement;
    startScrollTop = scrollEl?.scrollTop || 0;
    mode = 'waiting';

    timer = window.setTimeout(() => {
      if (!row || mode !== 'waiting') return;
      clearSelection();
      if (!beginSharedDrag()) {
        reset();
        return;
      }
      mode = 'dragging';
      row.classList.add('mobile-drag-active');
      if (navigator.vibrate) navigator.vibrate(15);
    }, HOLD_MS);
  }

  function onTouchMove(event) {
    if (!row || mode === 'idle') return;
    const touch = touchFrom(event.touches);
    if (!touch) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    clearSelection();

    lastX = touch.clientX;
    lastY = touch.clientY;
    const dx = lastX - startX;
    const dy = lastY - startY;

    if (mode === 'waiting' && Math.hypot(dx, dy) > MOVE_THRESHOLD) {
      clearTimer();
      mode = 'scrolling';
    }

    if (mode === 'scrolling') {
      if (scrollEl) scrollEl.scrollTop = startScrollTop - dy;
      return;
    }

    if (mode === 'dragging') moveSharedDrag(lastX, lastY);
  }

  function finish(event, cancelled) {
    if (!row || mode === 'idle') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    clearSelection();
    clearTimer();

    const finishedMode = mode;
    const tapTarget = originalTarget;

    if (finishedMode === 'dragging') finishSharedDrag(cancelled);

    reset();

    if (!cancelled && finishedMode === 'waiting') {
      window.setTimeout(() => recreateTap(tapTarget), 0);
    }
  }

  function init() {
    injectStyles();
    decorateRows();
    applyModalHeaderLayout();
    requestAnimationFrame(applyModalHeaderLayout);
    window.setTimeout(applyModalHeaderLayout, 80);
    window.setTimeout(applyModalHeaderLayout, 250);

    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
      const modalObserver = new MutationObserver(() => requestAnimationFrame(applyModalHeaderLayout));
      modalObserver.observe(overlay, { attributes: true, childList: true, subtree: true });
    }

    window.addEventListener('resize', applyModalHeaderLayout, { passive: true });

    const root = document.getElementById('tl-col');
    if (root) {
      const observer = new MutationObserver(() => requestAnimationFrame(decorateRows));
      observer.observe(root, { childList: true, subtree: true });
    }

    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    document.addEventListener('touchend', event => finish(event, false), { capture: true, passive: false });
    document.addEventListener('touchcancel', event => finish(event, true), { capture: true, passive: false });

    document.addEventListener('contextmenu', event => {
      if (eligibleRowFrom(event.target) || row) {
        event.preventDefault();
        event.stopImmediatePropagation();
        clearSelection();
      }
    }, true);

    document.addEventListener('selectstart', event => {
      if (eligibleRowFrom(event.target) || row) {
        event.preventDefault();
        clearSelection();
      }
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();