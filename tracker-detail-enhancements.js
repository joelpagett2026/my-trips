// MY TRIPS — shared mobile detail drawer enhancements for tracker templates.
// Loaded conditionally by db.js on parks, shows, concerts and private trackers.
(function () {
  'use strict';

  const MOBILE_QUERY = '(max-width: 768px)';
  const DETAIL_SELECTOR = '.detail-overlay';
  const CARD_SELECTOR = '.detail-card';
  const MODAL_SELECTOR = '#overlay.modal-overlay';
  const INJECTED_DELETE_ID = 'tracker-modal-delete';

  function addStyles() {
    if (document.getElementById('tracker-detail-enhancement-styles')) return;
    const style = document.createElement('style');
    style.id = 'tracker-detail-enhancement-styles';
    style.textContent = `
      /* Detail actions: destructive action lives inside Edit; pencil stays compact. */
      .detail-actions .d-btn.delete { display: none !important; }
      .detail-actions .d-btn.edit {
        flex: 0 0 40px !important;
        width: 40px !important;
        min-width: 40px !important;
        height: 40px !important;
        padding: 0 !important;
        gap: 0 !important;
        justify-content: center !important;
        align-items: center !important;
        font-size: 0 !important;
        line-height: 0 !important;
        border-radius: 10px !important;
      }
      .detail-actions .d-btn.edit svg {
        width: 17px !important;
        height: 17px !important;
        margin: 0 !important;
      }
      .detail-actions .d-btn.edit .d-lbl { display: none !important; }

      /* Delete is deliberately quieter inside the edit modal. */
      #tracker-modal-delete,
      #modal-delete {
        margin-right: auto !important;
        border: 0 !important;
        background: transparent !important;
        color: #c94c4c !important;
        padding: 9px 4px !important;
        font-family: Montserrat, sans-serif !important;
        font-size: 12px !important;
        font-weight: 700 !important;
        cursor: pointer !important;
      }
      #tracker-modal-delete:hover,
      #modal-delete:hover { color: #a62f2f !important; }

      @media (max-width: 768px) {
        .detail-card {
          will-change: transform;
          transform: translate3d(0,0,0);
        }
        .detail-card::before {
          content: '';
          position: absolute;
          top: 8px;
          left: 50%;
          width: 38px;
          height: 4px;
          border-radius: 999px;
          transform: translateX(-50%);
          background: rgba(255,255,255,0.92);
          box-shadow: 0 1px 5px rgba(0,0,0,0.28);
          z-index: 60;
          pointer-events: none;
        }
        .detail-card.tracker-dragging {
          transition: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function prepareEditButtons(root) {
    (root || document).querySelectorAll('.detail-actions .d-btn.edit').forEach(btn => {
      if (!btn.getAttribute('aria-label')) btn.setAttribute('aria-label', 'Edit');
      if (!btn.getAttribute('title')) btn.setAttribute('title', 'Edit');
    });
  }

  function removeInjectedDelete() {
    const btn = document.getElementById(INJECTED_DELETE_ID);
    if (btn) btn.remove();
  }

  function insertDeleteIntoEditModal(editButton) {
    const overlay = document.querySelector(MODAL_SELECTOR);
    if (!overlay || !overlay.classList.contains('open')) return;

    // The private tracker already has a native modal delete button.
    const nativeDelete = document.getElementById('modal-delete');
    if (nativeDelete) return;

    const actions = overlay.querySelector('.modal-actions');
    const detailActions = editButton && editButton.closest('.detail-actions');
    const detailDelete = detailActions && detailActions.querySelector('.d-btn.delete');
    if (!actions || !detailDelete) return;

    removeInjectedDelete();
    const originalAction = detailDelete.getAttribute('onclick') || '';
    if (!originalAction.trim()) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.id = INJECTED_DELETE_ID;
    button.textContent = 'Delete';
    button.setAttribute('aria-label', 'Delete');
    button.setAttribute('title', 'Delete');
    // Match the established private-template behaviour: close the editor before
    // handing off to the page's existing delete + confirmation function.
    button.setAttribute('onclick', 'if (typeof closeModal === "function") closeModal();' + originalAction);
    actions.insertBefore(button, actions.firstChild);
  }

  function initDeleteRelocation() {
    document.addEventListener('click', event => {
      const edit = event.target.closest && event.target.closest('.detail-actions .d-btn.edit');
      if (!edit) return;
      // Inline onclick opens the modal after this listener; wait one task so the
      // modal is open and its edit state has been populated.
      setTimeout(() => insertDeleteIntoEditModal(edit), 0);
    }, true);

    const modal = document.querySelector(MODAL_SELECTOR);
    if (modal && typeof MutationObserver !== 'undefined') {
      new MutationObserver(() => {
        if (!modal.classList.contains('open')) removeInjectedDelete();
      }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    }
  }

  function closeDetailOverlay(overlay) {
    if (typeof window.closeDetail === 'function') {
      window.closeDetail();
      return;
    }
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  function initSwipeForOverlay(overlay) {
    if (!overlay || overlay.dataset.trackerSwipeReady === '1') return;
    const card = overlay.querySelector(CARD_SELECTOR);
    if (!card) return;
    overlay.dataset.trackerSwipeReady = '1';

    let tracking = false;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let currentY = 0;
    let startedAt = 0;
    let cardHeight = 0;
    let baseBackground = '';

    function reset(animate) {
      tracking = false;
      dragging = false;
      card.classList.remove('tracker-dragging');
      card.style.transition = animate ? 'transform 180ms ease-out' : '';
      card.style.transform = '';
      overlay.style.background = baseBackground;
      if (animate) {
        setTimeout(() => { card.style.transition = ''; }, 190);
      }
    }

    card.addEventListener('touchstart', event => {
      if (!window.matchMedia(MOBILE_QUERY).matches) return;
      if (!overlay.classList.contains('open') || event.touches.length !== 1) return;
      if (overlay.scrollTop > 2) return;

      const touch = event.touches[0];
      const rect = card.getBoundingClientRect();
      // Mirror the itinerary drawer: the pull begins from the drawer header / drag
      // handle area so normal scrolling and controls remain untouched.
      if ((touch.clientY - rect.top) > 180) return;
      if (event.target.closest && event.target.closest('button, a, input, textarea, select, label')) return;

      tracking = true;
      dragging = false;
      startX = touch.clientX;
      startY = touch.clientY;
      currentY = startY;
      startedAt = performance.now();
      cardHeight = Math.max(card.getBoundingClientRect().height, window.innerHeight);
      baseBackground = overlay.style.background || '';
    }, { passive: true });

    card.addEventListener('touchmove', event => {
      if (!tracking || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      currentY = touch.clientY;

      if (!dragging) {
        if (dy <= 7) {
          if (dy < -10) tracking = false;
          return;
        }
        if (Math.abs(dx) > Math.abs(dy)) {
          tracking = false;
          return;
        }
        dragging = true;
        card.classList.add('tracker-dragging');
      }

      if (dy <= 0) return;
      event.preventDefault();
      card.style.transform = 'translate3d(0,' + dy + 'px,0)';

      const progress = Math.min(0.72, dy / Math.max(cardHeight * 0.65, 1));
      // Inline background wins over template CSS while dragging, then reset restores it.
      overlay.style.background = 'rgba(0,0,0,' + (0.55 * (1 - progress)).toFixed(3) + ')';
    }, { passive: false });

    function finish() {
      if (!tracking && !dragging) return;
      const dy = Math.max(0, currentY - startY);
      const elapsed = Math.max(performance.now() - startedAt, 1);
      const velocity = dy / elapsed;
      const shouldClose = dragging && (dy > Math.max(105, cardHeight * 0.18) || velocity > 0.7);

      tracking = false;
      if (!dragging) return;
      dragging = false;
      card.classList.remove('tracker-dragging');

      if (shouldClose) {
        card.style.transition = 'transform 180ms ease-in';
        card.style.transform = 'translate3d(0,105vh,0)';
        overlay.style.background = 'rgba(0,0,0,0)';
        setTimeout(() => {
          card.style.transition = '';
          card.style.transform = '';
          overlay.style.background = baseBackground;
          closeDetailOverlay(overlay);
        }, 170);
      } else {
        reset(true);
      }
    }

    card.addEventListener('touchend', finish, { passive: true });
    card.addEventListener('touchcancel', () => reset(true), { passive: true });
  }

  function initSwipeDrawers() {
    document.querySelectorAll(DETAIL_SELECTOR).forEach(initSwipeForOverlay);
    if (typeof MutationObserver === 'undefined') return;
    new MutationObserver(() => {
      document.querySelectorAll(DETAIL_SELECTOR).forEach(initSwipeForOverlay);
      prepareEditButtons(document);
    }).observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    addStyles();
    prepareEditButtons(document);
    initDeleteRelocation();
    initSwipeDrawers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
