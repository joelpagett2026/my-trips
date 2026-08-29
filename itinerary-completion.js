// MY TRIPS — completion checkboxes for attractions / places of interest
// Adds an owner-only "done" state without changing the shared itinerary template.
(function () {
  'use strict';

  const ELIGIBLE_TYPES = new Set(['act', 'ticket', 'attraction']);

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
      .tl-item.tl-completed .tl-info,
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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
