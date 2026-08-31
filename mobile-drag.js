// MY TRIPS — completion tick reconciliation
// Keeps completion controls attached to the real POI/attraction item after
// timeline grouping/reload, and persists a tick immediately.
(function () {
  'use strict';

  const ELIGIBLE_TYPES = new Set(['place', 'poi', 'act', 'attraction', 'ticket']);
  const normalise = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

  function currentDayItems() {
    if (typeof STATE === 'undefined' || typeof activeDay === 'undefined') return [];
    return STATE.days?.[activeDay]?.items || [];
  }

  function resolveItem(row) {
    if (!row) return null;
    const visibleTitle = normalise(row.querySelector('.tl-title')?.textContent);
    if (!visibleTitle) return null;

    const period = row.closest('.tl-section')?.dataset?.period || '';
    const candidates = currentDayItems().filter(item =>
      ELIGIBLE_TYPES.has(item?.type) && normalise(item?.title) === visibleTitle
    );
    if (!candidates.length) return null;

    if (period) {
      const exactPeriod = candidates.find(item => !item.period || item.period === period);
      if (exactPeriod) return exactPeriod;
    }
    return candidates[0];
  }

  function syncVisual(row, button, item) {
    if (!button) return;
    const eligible = !!item;
    button.style.display = eligible ? '' : 'none';
    row.classList.toggle('tl-completed', eligible && item.completed === true);
    button.classList.toggle('is-done', eligible && item.completed === true);
    if (!eligible) return;
    button.setAttribute('aria-pressed', item.completed === true ? 'true' : 'false');
    button.setAttribute('aria-label', item.completed === true
      ? `Mark ${item.title || 'item'} as not done`
      : `Mark ${item.title || 'item'} as done`);
  }

  function persistNow() {
    if (typeof saveData === 'function') {
      Promise.resolve(saveData()).catch(error => console.error('Completion save failed', error));
    } else if (typeof scheduleSave === 'function') {
      scheduleSave();
    }
  }

  function reconcile() {
    const root = document.getElementById('tl-col');
    if (!root) return;

    root.querySelectorAll('.tl-item').forEach(row => {
      const existing = row.querySelector('.tl-complete-btn');
      if (!existing) return;

      const item = resolveItem(row);
      let button = existing;

      if (button.dataset.completionReconciled !== '1') {
        const replacement = button.cloneNode(true);
        replacement.dataset.completionReconciled = '1';
        button.replaceWith(replacement);
        button = replacement;

        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          const latest = resolveItem(row);
          if (!latest) return;
          if (typeof takeSnapshot === 'function') takeSnapshot();
          latest.completed = latest.completed !== true;
          syncVisual(row, button, latest);
          persistNow();
        });
      }

      syncVisual(row, button, item);
    });
  }

  function init() {
    const root = document.getElementById('tl-col');
    if (!root) return;
    let queued = false;
    const queue = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        reconcile();
      });
    };
    new MutationObserver(queue).observe(root, { childList: true, subtree: true });
    reconcile();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

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
      }
    `;
    document.head.appendChild(style);
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

    // Claim the gesture immediately so iOS does not start text selection or
    // the Copy / Look Up callout while we wait to distinguish drag from scroll.
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
