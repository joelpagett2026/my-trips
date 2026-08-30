// MY TRIPS — completion checkboxes for attractions / places of interest
// Adds an owner-only "done" state without changing the shared itinerary template.
(function () {
  'use strict';

  const ELIGIBLE_TYPES = new Set(['act', 'ticket', 'attraction']);
  const MOBILE_DRAG_TYPES = new Set(['place', 'act', 'ticket', 'attraction']);

  function injectStyles() {
    if (document.getElementById('itinerary-completion-style')) return;
    const style = document.createElement('style');
    style.id = 'itinerary-completion-style';
    style.textContent = `
      .tl-complete-btn {
        width: 30px;
        height: 30px;
        flex: 0 0 30px;
        align-self: center;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin-left: 1px;
        border: 1.5px solid rgba(90,137,104,.45);
        border-radius: 50%;
        background: rgba(90,137,104,.05);
        color: #5A8968;
        cursor: pointer;
        transition: background .14s ease, border-color .14s ease, color .14s ease, transform .12s ease;
        position: relative;
        z-index: 3;
      }
      .tl-complete-btn svg {
        width: 14px;
        height: 14px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2.4;
        stroke-linecap: round;
        stroke-linejoin: round;
        opacity: 0;
        transform: scale(.72);
        transition: opacity .12s ease, transform .12s ease;
      }
      .tl-complete-btn:hover {
        background: rgba(90,137,104,.11);
        border-color: #5A8968;
      }
      .tl-complete-btn:active { transform: scale(.93); }
      .tl-complete-btn.is-done {
        background: #5A8968;
        border-color: #5A8968;
        color: #fff;
      }
      .tl-complete-btn.is-done svg {
        opacity: 1;
        transform: scale(1);
      }

      /* Keep the completion control crisp while gently receding the finished item. */
      .tl-item.tl-completed { background: rgba(0,0,0,.018); }
      .tl-item.tl-completed .tl-time,
      .tl-item.tl-completed .tl-text,
      .tl-item.tl-completed .tl-ico,
      .tl-item.tl-completed .tl-price,
      .tl-item.tl-completed .tl-ticket-status,
      .tl-item.tl-completed .badge {
        opacity: .52;
        filter: grayscale(.28);
      }
      .tl-item.tl-completed .tl-dot {
        background: #aeb8bb !important;
        box-shadow: none !important;
      }
      .tl-item.tl-completed .tl-title { color: var(--text2); }

      @media (max-width: 700px) {
        .tl-complete-btn {
          width: 34px;
          height: 34px;
          flex-basis: 34px;
          margin-left: 0;
        }
        .tl-complete-btn svg { width: 15px; height: 15px; }

        /* iOS web-app: eligible itinerary rows own the long-press gesture. */
        .tl-item.mobile-longpress-eligible,
        .tl-item.mobile-longpress-eligible * {
          -webkit-user-select: none !important;
          user-select: none !important;
          -webkit-touch-callout: none !important;
          -webkit-user-drag: none !important;
        }
        .tl-item.mobile-longpress-active {
          cursor: grabbing;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function currentItem(row) {
    if (typeof STATE === 'undefined' || typeof activeDay === 'undefined') return null;
    const idx = Number(row.dataset.idx);
    if (!Number.isInteger(idx)) return null;
    return STATE.days?.[activeDay]?.items?.[idx] || null;
  }

  function applyState(row, button, item) {
    const done = item.completed === true;
    row.classList.toggle('tl-completed', done);
    button.classList.toggle('is-done', done);
    button.setAttribute('aria-pressed', done ? 'true' : 'false');
    button.setAttribute('aria-label', done ? `Mark ${item.title || 'item'} as not done` : `Mark ${item.title || 'item'} as done`);
    button.title = done ? 'Completed — click to undo' : 'Mark as completed';
  }

  function decorateTimeline() {
    const root = document.getElementById('tl-col');
    if (!root) return;

    root.querySelectorAll('.tl-item').forEach(row => {
      const item = currentItem(row);
      row.classList.toggle('mobile-longpress-eligible', !!item && MOBILE_DRAG_TYPES.has(item.type));

      if (!item || !ELIGIBLE_TYPES.has(item.type)) {
        row.classList.remove('tl-completed');
        row.querySelector('.tl-complete-btn')?.remove();
        return;
      }

      let button = row.querySelector('.tl-complete-btn');
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'tl-complete-btn';
        button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="5 12.5 9.2 16.5 19 6.5"></polyline></svg>';

        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          const latest = currentItem(row);
          if (!latest || !ELIGIBLE_TYPES.has(latest.type)) return;

          if (typeof takeSnapshot === 'function') takeSnapshot();
          latest.completed = latest.completed !== true;
          applyState(row, button, latest);
          if (typeof scheduleSave === 'function') scheduleSave();
        });

        const more = row.querySelector('.tl-more-btn');
        const body = row.querySelector('.tl-body-wrap');
        if (more && more.parentNode) more.parentNode.insertBefore(button, more);
        else if (body) body.appendChild(button);
      }

      applyState(row, button, item);
    });
  }

  function installMobileLongPressDrag() {
    if (!window.matchMedia || !window.matchMedia('(max-width: 768px)').matches) return;
    if (document.documentElement.dataset.mobileLongPressV3 === '1') return;
    document.documentElement.dataset.mobileLongPressV3 = '1';

    const HOLD_MS = 280;
    const MOVE_THRESHOLD = 7;
    const SYNTHETIC_POINTER_ID = 778899;

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

    function clearSelection() {
      try {
        const selection = window.getSelection?.();
        if (selection?.rangeCount) selection.removeAllRanges();
      } catch (_) {}
    }

    function clearTimer() {
      if (timer) clearTimeout(timer);
      timer = null;
    }

    function reset() {
      clearTimer();
      row?.classList.remove('mobile-longpress-active');
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

    function eligibleRowFrom(target) {
      if (!(target instanceof Element)) return null;
      // Keep only the dedicated row controls out of the drag gesture. The
      // itinerary card body itself may contain links/buttons, and those should
      // still be draggable after a hold; a quick tap is recreated below.
      if (target.closest('.tl-complete-btn, .tl-more-btn, input, select, textarea, label')) return null;
      const candidate = target.closest('.tl-item');
      if (!candidate) return null;
      const item = currentItem(candidate);
      return item && MOBILE_DRAG_TYPES.has(item.type) ? candidate : null;
    }

    function harden(candidate) {
      candidate.classList.add('mobile-longpress-eligible');
      [candidate, ...candidate.querySelectorAll('*')].forEach(node => {
        if (!node.style) return;
        node.style.setProperty('-webkit-user-select', 'none', 'important');
        node.style.setProperty('user-select', 'none', 'important');
        node.style.setProperty('-webkit-touch-callout', 'none', 'important');
        node.style.setProperty('-webkit-user-drag', 'none', 'important');
      });
    }

    function pointer(type, x, y, buttons) {
      const target = type === 'pointerdown' ? row?.querySelector('.tl-time') : window;
      if (!target || typeof PointerEvent !== 'function') return;
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: SYNTHETIC_POINTER_ID,
        pointerType: 'touch',
        isPrimary: true,
        clientX: x,
        clientY: y,
        button: type === 'pointerdown' ? 0 : -1,
        buttons
      }));
    }

    function manualTap(target) {
      if (!(target instanceof Element)) return;
      target.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      }));
    }

    document.addEventListener('touchstart', event => {
      if (!event.touches || event.touches.length !== 1) return;
      const candidate = eligibleRowFrom(event.target);
      if (!candidate) return;

      // Critical for iOS standalone web apps: cancel the native touch at the
      // beginning so Copy / Look Up / Translate never gets ownership.
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

      timer = setTimeout(() => {
        if (!row || mode !== 'waiting') return;
        clearSelection();
        mode = 'dragging';
        row.classList.add('mobile-longpress-active');
        pointer('pointerdown', startX, startY, 1);
        if (navigator.vibrate) navigator.vibrate(15);
      }, HOLD_MS);
    }, { capture: true, passive: false });

    document.addEventListener('touchmove', event => {
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

      if (mode === 'dragging') pointer('pointermove', lastX, lastY, 1);
    }, { capture: true, passive: false });

    function finish(event, cancelled) {
      if (!row || mode === 'idle') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      clearSelection();
      clearTimer();

      const finishedMode = mode;
      const tapTarget = originalTarget;

      if (finishedMode === 'dragging') {
        pointer(cancelled ? 'pointercancel' : 'pointerup', lastX || startX, lastY || startY, 0);
      }

      reset();

      if (!cancelled && finishedMode === 'waiting') {
        // preventDefault() suppresses iOS's synthetic click, so recreate the
        // ordinary quick-tap behaviour ourselves.
        setTimeout(() => manualTap(tapTarget), 0);
      }
    }

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

  function init() {
    injectStyles();
    const root = document.getElementById('tl-col');
    if (!root) return;

    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        decorateTimeline();
      });
    });
    observer.observe(root, { childList: true, subtree: true });
    decorateTimeline();
    installMobileLongPressDrag();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
