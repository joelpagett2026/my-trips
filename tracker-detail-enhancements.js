// MY TRIPS — shared mobile detail drawer enhancements for tracker templates.
(function () {
  'use strict';

  // Guard against the shared helper being included more than once.
  if (window.__trackerDetailEnhancementsV3) return;
  window.__trackerDetailEnhancementsV3 = true;

  const MOBILE_QUERY = '(max-width: 768px), (display-mode: standalone) and (max-width: 900px)';
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

      .tracker-drawer-handle { display: none; }

      @media (max-width: 768px), (display-mode: standalone) and (max-width: 900px) {
        .detail-card {
          will-change: transform;
          transform: translate3d(0,0,0);
        }

        /* Mobile/app details close with the swipe gesture, so the X is redundant. */
        .detail-close { display: none !important; }

        /* The grabber now sits over the lower edge of the image rather than the
           very top of the sheet. It is inserted next to whichever detail image
           the tracker uses, including the square Private Log photo. */
        .tracker-drawer-handle {
          display: block;
          width: 38px;
          height: 4px;
          flex: 0 0 4px;
          border-radius: 999px;
          margin: -12px auto 8px;
          position: relative;
          z-index: 60;
          background: rgba(255,255,255,0.94);
          box-shadow: 0 1px 5px rgba(0,0,0,0.30);
          pointer-events: none;
        }
        .detail-card.tracker-dragging { transition: none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function prepareMobileChrome(root) {
    (root || document).querySelectorAll(CARD_SELECTOR).forEach(card => {
      const photo = card.querySelector('.detail-photo, .detail-photo-thumb');
      const existing = card.querySelector('.tracker-drawer-handle');

      if (!photo) {
        if (existing) existing.remove();
        return;
      }
      if (existing && existing.previousElementSibling === photo) return;
      if (existing) existing.remove();

      const handle = document.createElement('span');
      handle.className = 'tracker-drawer-handle';
      handle.setAttribute('aria-hidden', 'true');
      photo.insertAdjacentElement('afterend', handle);
    });
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
    button.setAttribute('onclick', 'if (typeof closeModal === "function") closeModal();' + originalAction);
    actions.insertBefore(button, actions.firstChild);
  }

  function initDeleteRelocation() {
    document.addEventListener('click', event => {
      const edit = event.target.closest && event.target.closest('.detail-actions .d-btn.edit');
      if (!edit) return;
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

  // This deliberately mirrors the proven itinerary drawer gesture: when the
  // drawer is at the top, a downward pull from anywhere on the card may close it.
  // A 70px pull is enough, matching trip-drawer-swipe.js.
  function initSwipeForOverlay(overlay) {
    if (!overlay || overlay.dataset.trackerSwipeReady === '3') return;
    const card = overlay.querySelector(CARD_SELECTOR);
    if (!card) return;
    overlay.dataset.trackerSwipeReady = '3';

    let startY = 0;
    let lastY = 0;
    let tracking = false;
    let eligible = false;
    let baseBackground = '';

    const scrollIsAtTop = () => {
      const candidates = [
        overlay,
        card,
        card.querySelector('.detail-body'),
        card.querySelector('.detail-scroll'),
      ].filter(Boolean);
      return candidates.every(el => (el.scrollTop || 0) <= 1);
    };

    const isOpen = () => overlay.classList.contains('open');

    function resetVisuals() {
      card.classList.remove('tracker-dragging');
      card.style.transition = '';
      card.style.transform = '';
      overlay.style.background = baseBackground;
    }

    card.addEventListener('touchstart', event => {
      if (!window.matchMedia(MOBILE_QUERY).matches) return;
      if (!isOpen() || !event.touches || event.touches.length !== 1) return;

      const rect = card.getBoundingClientRect();
      const touch = event.touches[0];
      const handle = card.querySelector('.tracker-drawer-handle');
      const handleRect = handle ? handle.getBoundingClientRect() : null;
      const onHandle = !!handleRect && touch.clientY >= handleRect.top - 28 && touch.clientY <= handleRect.bottom + 28;
      const inFallbackTopArea = !handle && (touch.clientY - rect.top) <= 90;

      // The visible grabber is the preferred start point. As before, when the
      // detail is already at the top the whole card can still be pulled down.
      eligible = onHandle || inFallbackTopArea || scrollIsAtTop();
      if (!eligible) return;

      startY = lastY = touch.clientY;
      tracking = true;
      baseBackground = overlay.style.background || '';
    }, { passive: true });

    card.addEventListener('touchmove', event => {
      if (!tracking || !eligible || !event.touches || event.touches.length !== 1) return;
      lastY = event.touches[0].clientY;
      const dy = Math.max(0, lastY - startY);
      if (dy <= 0) return;

      card.classList.add('tracker-dragging');
      card.style.transition = 'none';
      card.style.transform = `translate3d(0,${Math.min(dy, 220)}px,0)`;

      const fade = Math.min(0.72, dy / 260);
      overlay.style.background = `rgba(0,0,0,${(0.55 * (1 - fade)).toFixed(3)})`;
    }, { passive: true });

    function finish() {
      if (!tracking) return;
      const dy = Math.max(0, lastY - startY);
      tracking = false;
      eligible = false;

      if (dy >= 70) {
        card.classList.remove('tracker-dragging');
        card.style.transition = 'transform 160ms ease-in';
        card.style.transform = 'translate3d(0,105vh,0)';
        overlay.style.background = 'rgba(0,0,0,0)';
        setTimeout(() => {
          resetVisuals();
          closeDetailOverlay(overlay);
        }, 150);
      } else {
        card.classList.remove('tracker-dragging');
        card.style.transition = 'transform 160ms ease-out';
        card.style.transform = '';
        overlay.style.background = baseBackground;
        setTimeout(() => { card.style.transition = ''; }, 170);
      }

      startY = lastY = 0;
    }

    card.addEventListener('touchend', finish, { passive: true });
    card.addEventListener('touchcancel', () => {
      tracking = false;
      eligible = false;
      startY = lastY = 0;
      resetVisuals();
    }, { passive: true });
  }

  function initSwipeDrawers() {
    document.querySelectorAll(DETAIL_SELECTOR).forEach(initSwipeForOverlay);
    if (typeof MutationObserver === 'undefined') return;
    new MutationObserver(() => {
      document.querySelectorAll(DETAIL_SELECTOR).forEach(initSwipeForOverlay);
      prepareMobileChrome(document);
      prepareEditButtons(document);
    }).observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    addStyles();
    prepareMobileChrome(document);
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
