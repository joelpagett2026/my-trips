// MY TRIPS — trip deletion + Activity Editor V4
//
// V4 has one source of truth for Add/Edit/Remove/Save and a dedicated iPhone
// touch bridge. The bridge runs on WINDOW capture, before older document-level
// gesture handlers, and resolves buttons by screen coordinates rather than
// trusting Safari's event.target. This prevents both dead taps and click-through
// into the itinerary underneath the modal.

(function installTripDeletion() {
  'use strict';
  if (typeof window === 'undefined') return;

  async function parseResponse(res) {
    const text = await res.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; }
    catch { throw new Error(`Server returned an invalid response (${res.status})`); }
    if (res.status === 401) document.dispatchEvent(new Event('mytrips:auth-expired'));
    if (!res.ok || json.ok === false) {
      const err = new Error(json.error || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return json.data || {};
  }

  window.confirmDeleteTrip = async function confirmDeleteTrip() {
    const btn = document.getElementById('dt-confirm-btn');
    if (!btn || btn.dataset.busy === '1') return;
    btn.dataset.busy = '1';
    btn.disabled = true;
    btn.textContent = 'Deleting…';

    try {
      const token = typeof window.waitForToken === 'function'
        ? await window.waitForToken()
        : (typeof window.getToken === 'function' ? window.getToken() : '');
      const res = await fetch('/trip-delete.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': token,
        },
        body: JSON.stringify({ id: RECORD_ID }),
      });
      await parseResponse(res);
      window.location.href = '/trips/';
    } catch (error) {
      console.error('Delete trip failed:', error);
      delete btn.dataset.busy;
      btn.disabled = false;
      btn.textContent = 'Delete permanently';
      alert('Could not delete trip. Nothing was partially deleted; please try again.');
    }
  };
})();

(function installActivityEditorV4() {
  'use strict';
  if (typeof window === 'undefined' || window.__activityEditorControllerV4) return;

  const legacy = {
    openAddItem: typeof window.openAddItem === 'function' ? window.openAddItem : null,
    openEditItem: typeof window.openEditItem === 'function' ? window.openEditItem : null,
    openDrawerItem: typeof window.openDrawerItem === 'function' ? window.openDrawerItem : null,
    closeModal: typeof window.closeModal === 'function' ? window.closeModal : null,
    closeDrawer: typeof window.closeDrawer === 'function' ? window.closeDrawer : null,
    saveItem: typeof window.saveItem === 'function' ? window.saveItem : null,
    deleteCurrentItem: typeof window.deleteCurrentItem === 'function' ? window.deleteCurrentItem : null,
  };

  const state = {
    saveBusy: false,
    removeBusy: false,
    modalSession: 0,
    overlayWasOpen: false,
    touch: null,
    manualClickDepth: 0,
    suppressTrustedClickUntil: 0,
    lastTouchAction: '',
  };

  const MOBILE_QUERY = '(max-width: 768px)';
  const isMobile = () => !!(window.matchMedia && window.matchMedia(MOBILE_QUERY).matches);

  function sameFingerprint(a, b) {
    if (!a || !b) return false;
    if (a._id && b._id) return String(a._id) === String(b._id);
    const at = a.transport || {};
    const bt = b.transport || {};
    return String(a.type || '') === String(b.type || '')
      && String(a.title || '') === String(b.title || '')
      && String(a.time || '') === String(b.time || '')
      && String(a.period || '') === String(b.period || '')
      && String(at.mode || '') === String(bt.mode || '')
      && String(at.from || '') === String(bt.from || '')
      && String(at.to || '') === String(bt.to || '');
  }

  function readDescriptor(preferEdit) {
    let descriptor = null;
    try {
      if (preferEdit && typeof editItem !== 'undefined' && editItem) descriptor = editItem;
    } catch (_) {}
    if (!descriptor) {
      try { if (typeof drawerItem !== 'undefined' && drawerItem) descriptor = drawerItem; } catch (_) {}
    }
    return descriptor;
  }

  function resolveTarget(descriptor) {
    if (!descriptor || typeof STATE === 'undefined' || !STATE) return null;
    const dayIdx = Number(descriptor.dayIdx);
    const items = STATE.days?.[dayIdx]?.items;
    if (!Number.isInteger(dayIdx) || !Array.isArray(items)) return null;

    const selected = descriptor.item || null;
    const stableId = selected?._id ? String(selected._id) : '';
    let itemIdx = -1;

    if (stableId) itemIdx = items.findIndex(item => item && String(item._id || '') === stableId);
    if (itemIdx < 0 && selected) itemIdx = items.indexOf(selected);

    if (itemIdx < 0 && selected) {
      const matches = [];
      items.forEach((item, index) => { if (sameFingerprint(item, selected)) matches.push(index); });
      if (matches.length === 1) itemIdx = matches[0];
    }

    if (itemIdx < 0) {
      const fallback = Number(descriptor.itemIdx);
      if (Number.isInteger(fallback) && fallback >= 0 && fallback < items.length) {
        if (!selected || sameFingerprint(items[fallback], selected)) itemIdx = fallback;
      }
    }

    if (itemIdx < 0 || !items[itemIdx]) return null;
    return { dayIdx, itemIdx, item: items[itemIdx] };
  }

  function exposeTarget(target) {
    if (!target) return;
    try { drawerItem = { dayIdx: target.dayIdx, itemIdx: target.itemIdx, item: target.item }; } catch (_) {}
  }

  function ensureStyles() {
    if (!document.head || document.getElementById('activity-editor-v4-style')) return;
    const style = document.createElement('style');
    style.id = 'activity-editor-v4-style';
    style.textContent = `
      #modal-overlay.open {
        opacity:1 !important;
        visibility:visible !important;
        pointer-events:auto !important;
        z-index:2147483000 !important;
      }
      #modal-overlay.open .modal,
      #modal-overlay.open .modal-head,
      #modal-overlay.open .modal-body,
      #modal-overlay.open #modal-body-single,
      #modal-overlay.open #modal-body-bulk,
      #modal-overlay.open .modal-foot,
      #modal-overlay.open button,
      #modal-overlay.open input,
      #modal-overlay.open textarea,
      #modal-overlay.open select,
      #modal-overlay.open label {
        pointer-events:auto !important;
      }
      #modal-overlay.open button,
      #drawer.open .dr-text-btn {
        touch-action:manipulation !important;
        -webkit-user-select:none !important;
        user-select:none !important;
      }
      #activity-save-btn-v4[data-busy="1"],
      #modal-overlay #modal-delete-btn[data-busy="1"] {
        opacity:.68 !important;
        pointer-events:none !important;
      }

      @media (max-width:768px) {
        html.activity-editor-open,
        html.activity-editor-open body {
          overscroll-behavior:none !important;
        }
        #modal-overlay {
          position:fixed !important;
          inset:0 !important;
          width:100vw !important;
          height:100vh !important;
          height:100dvh !important;
          min-height:0 !important;
          padding:0 !important;
          margin:0 !important;
          overflow:hidden !important;
          align-items:stretch !important;
          justify-content:stretch !important;
          background:#fff !important;
          backdrop-filter:none !important;
          transform:none !important;
          touch-action:auto !important;
        }
        #modal-overlay .modal {
          position:relative !important;
          inset:auto !important;
          width:100% !important;
          max-width:none !important;
          min-width:0 !important;
          height:100% !important;
          max-height:none !important;
          min-height:0 !important;
          margin:0 !important;
          padding:0 !important;
          border-radius:0 !important;
          box-shadow:none !important;
          transform:none !important;
          overflow:hidden !important;
          background:#fff !important;
          display:flex !important;
          flex-direction:column !important;
          touch-action:auto !important;
        }
        #modal-overlay .modal::before,
        #modal-overlay .modal::after {
          display:none !important;
          content:none !important;
          pointer-events:none !important;
        }
        #modal-overlay .modal-head {
          flex:0 0 auto !important;
          display:grid !important;
          grid-template-columns:minmax(104px,.72fr) minmax(0,1.18fr) 42px !important;
          align-items:center !important;
          gap:6px !important;
          padding:calc(10px + env(safe-area-inset-top,0px)) 12px 10px !important;
          min-height:58px !important;
          background:#fff !important;
          border-bottom:1px solid rgba(100,120,128,.14) !important;
          z-index:20 !important;
        }
        #modal-overlay .modal-title {
          min-width:0 !important;
          margin:0 !important;
          padding:0 !important;
          white-space:nowrap !important;
        }
        #modal-overlay .modal-tabs {
          width:100% !important;
          min-width:0 !important;
          margin:0 !important;
        }
        #modal-overlay .modal-close {
          position:relative !important;
          inset:auto !important;
          justify-self:end !important;
          width:40px !important;
          height:40px !important;
          min-width:40px !important;
          margin:0 !important;
          z-index:30 !important;
        }
        #modal-overlay .modal-body,
        #modal-overlay #modal-body-single,
        #modal-overlay #modal-body-bulk {
          position:relative !important;
          flex:1 1 0 !important;
          min-height:0 !important;
          overflow-y:auto !important;
          overflow-x:hidden !important;
          -webkit-overflow-scrolling:touch !important;
          overscroll-behavior:contain !important;
          background:#fff !important;
          padding:14px 14px 24px !important;
          scroll-padding-bottom:96px !important;
          touch-action:pan-y !important;
          z-index:10 !important;
        }
        #modal-overlay .modal-foot {
          position:relative !important;
          flex:0 0 auto !important;
          display:flex !important;
          align-items:center !important;
          gap:10px !important;
          width:100% !important;
          min-height:72px !important;
          padding:10px 14px calc(10px + env(safe-area-inset-bottom,0px)) !important;
          background:#fff !important;
          border-top:1px solid rgba(100,120,128,.14) !important;
          box-shadow:0 -6px 18px rgba(20,35,45,.05) !important;
          z-index:30 !important;
        }
        #modal-overlay .modal-foot .modal-btn.secondary { display:none !important; }
        #activity-save-btn-v4 {
          display:block !important;
          flex:1 1 auto !important;
          width:auto !important;
          min-width:0 !important;
          min-height:50px !important;
          position:relative !important;
          z-index:31 !important;
        }
        #modal-overlay #modal-delete-btn {
          flex:0 0 auto !important;
          min-height:50px !important;
          position:relative !important;
          z-index:31 !important;
        }
      }

      @media (max-width:390px) {
        #modal-overlay .modal-head {
          grid-template-columns:minmax(96px,.7fr) minmax(0,1.1fr) 38px !important;
          padding-left:10px !important;
          padding-right:10px !important;
          gap:5px !important;
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

  function normalizeSaveButton() {
    const save = document.getElementById('activity-save-btn-v4')
      || document.getElementById('activity-save-btn-v3')
      || document.getElementById('activity-save-btn')
      || document.getElementById('modal-save-btn');
    if (!save) return null;
    save.id = 'activity-save-btn-v4';
    save.type = 'button';
    save.removeAttribute('onclick');
    if (!save.dataset.normalText) save.dataset.normalText = save.textContent || 'Save';
    if (!state.saveBusy) {
      save.disabled = false;
      delete save.dataset.busy;
      save.textContent = save.dataset.normalText || 'Save';
    }
    return save;
  }

  function releaseClosedOverlay() {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay || overlay.classList.contains('open')) return;
    document.documentElement.classList.remove('activity-editor-open');
    overlay.style.removeProperty('z-index');
    overlay.style.removeProperty('opacity');
    overlay.style.removeProperty('visibility');
    overlay.style.removeProperty('pointer-events');
  }

  function syncModalOpen(options = {}) {
    ensureStyles();
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;

    if (options.newSession) {
      state.modalSession += 1;
      state.saveBusy = false;
      state.removeBusy = false;
    }

    if (!overlay.classList.contains('open')) {
      releaseClosedOverlay();
      return;
    }

    document.documentElement.classList.add('activity-editor-open');
    normalizeSaveButton();
  }

  function classifyDrawerButton(button) {
    if (!button) return '';
    const existing = button.dataset.activityAction || '';
    if (existing === 'edit' || existing === 'remove') return existing;
    const onclick = button.getAttribute('onclick') || '';
    const text = String(button.textContent || '').trim().toLowerCase();
    if (onclick.includes('editCurrentItem') || text === 'edit') return 'edit';
    if (onclick.includes('deleteCurrentItem') || text === 'remove' || text === 'delete') return 'remove';
    return '';
  }

  function closeEditor() {
    state.saveBusy = false;
    state.removeBusy = false;
    if (legacy.closeModal) legacy.closeModal.call(window);
    window.setTimeout(releaseClosedOverlay, 0);
  }

  function saveActivity() {
    const overlay = document.getElementById('modal-overlay');
    const save = normalizeSaveButton();
    if (!overlay?.classList.contains('open') || !save || state.saveBusy) return false;

    state.saveBusy = true;
    save.dataset.busy = '1';
    save.disabled = true;
    save.textContent = 'Saving…';

    // The existing serializer expects #modal-save-btn. Restore that ID only for
    // the synchronous call; historical document touch handlers never see the
    // user's physical tap because V4 intercepts it at window capture first.
    save.id = 'modal-save-btn';
    let result;
    try {
      if (!legacy.saveItem) throw new Error('Save action is unavailable');
      result = legacy.saveItem.call(window);
    } catch (error) {
      console.error('Activity Save failed before persistence', error);
      save.id = 'activity-save-btn-v4';
      state.saveBusy = false;
      save.disabled = false;
      delete save.dataset.busy;
      save.textContent = save.dataset.normalText || 'Save';
      if (typeof setStatus === 'function') setStatus('error', '✕ Save failed — try again');
      alert('This activity could not be saved. Please try again.');
      return false;
    }

    // Validation errors leave the modal open. Re-arm the button for a retry.
    if (overlay.classList.contains('open')) {
      save.id = 'activity-save-btn-v4';
      state.saveBusy = false;
      save.disabled = false;
      delete save.dataset.busy;
      save.textContent = save.dataset.normalText || 'Save';
    }
    return result;
  }

  function editActivity() {
    const target = resolveTarget(readDescriptor(false));
    if (!target) {
      alert('This item changed while it was open. Close it, reopen it and try again.');
      return false;
    }

    exposeTarget(target);
    try {
      if (!legacy.openEditItem) throw new Error('Edit action is unavailable');
      legacy.openEditItem.call(window, target.dayIdx, target.itemIdx);
      syncModalOpen({ newSession:true });
      if (legacy.closeDrawer) legacy.closeDrawer.call(window);
      return true;
    } catch (error) {
      console.error('Open activity editor failed', error);
      alert('Could not open this item for editing. Please try again.');
      return false;
    }
  }

  async function removeActivity(preferEdit, button) {
    if (state.removeBusy) return false;
    const target = resolveTarget(readDescriptor(preferEdit));
    if (!target) {
      alert('This item changed while it was open. Close it, reopen it and try again.');
      return false;
    }

    exposeTarget(target);
    state.removeBusy = true;
    if (button) {
      button.dataset.busy = '1';
      button.disabled = true;
    }

    try {
      if (!legacy.deleteCurrentItem) throw new Error('Remove action is unavailable');
      return await legacy.deleteCurrentItem.call(window);
    } catch (error) {
      console.error('Remove activity failed', error);
      alert('Could not remove this item. Please try again.');
      return false;
    } finally {
      state.removeBusy = false;
      if (button?.isConnected) {
        delete button.dataset.busy;
        button.disabled = false;
      }
    }
  }

  function onModalClick(event) {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay?.classList.contains('open')) return;
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target) return;

    const close = target.closest('.modal-close');
    const save = target.closest('#activity-save-btn-v4,#activity-save-btn-v3,#activity-save-btn,#modal-save-btn');
    const remove = target.closest('#modal-delete-btn');
    if (!close && !save && !remove) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (close) closeEditor();
    else if (save) saveActivity();
    else removeActivity(true, remove);
  }

  function onDrawerClick(event) {
    const drawer = document.getElementById('drawer');
    if (!drawer?.classList.contains('open')) return;
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const button = target?.closest?.('.dr-text-actions .dr-text-btn');
    if (!button) return;
    const action = classifyDrawerButton(button);
    if (!action) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    button.dataset.activityAction = action;

    if (action === 'edit') editActivity();
    else removeActivity(false, button);
  }

  function rectContains(rect, x, y, pad = 0) {
    if (!rect) return false;
    return x >= rect.left - pad && x <= rect.right + pad
      && y >= rect.top - pad && y <= rect.bottom + pad;
  }

  function visibleButtonAt(scope, selector, x, y) {
    if (!scope?.querySelectorAll) return null;
    const buttons = Array.from(scope.querySelectorAll(selector)).filter(button => {
      if (!button || button.disabled) return false;
      const rect = button.getBoundingClientRect?.();
      return rect && rect.width > 0 && rect.height > 0 && rectContains(rect, x, y, 0);
    });
    return buttons.length ? buttons[buttons.length - 1] : null;
  }

  function actionButtonAt(x, y) {
    const overlay = document.getElementById('modal-overlay');
    if (overlay?.classList.contains('open')) {
      const button = visibleButtonAt(overlay, 'button', x, y);
      if (button) return { scope:'modal', button };
      return { scope:'modal', button:null };
    }

    const drawer = document.getElementById('drawer');
    if (drawer?.classList.contains('open')) {
      const button = visibleButtonAt(drawer, '.dr-text-actions .dr-text-btn', x, y);
      if (button) return { scope:'drawer', button };
    }
    return { scope:'', button:null };
  }

  function touchById(list, id) {
    if (!list) return null;
    for (const touch of Array.from(list)) {
      if (touch.identifier === id) return touch;
    }
    return null;
  }

  function installTouchBridge() {
    if (window.__activityEditorV4TouchBridge) return;
    window.__activityEditorV4TouchBridge = true;

    // WINDOW capture is deliberate: it runs before older document-level mobile
    // drag/save listeners even though those scripts were installed first.
    window.addEventListener('touchstart', event => {
      if (!event.touches || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const hit = actionButtonAt(touch.clientX, touch.clientY);

      state.touch = {
        id: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        moved: false,
        button: hit.button,
        scope: hit.scope,
      };

      if (hit.button) {
        // Prevent old swipe/long-press recognisers from arming on this button.
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      // If iOS paints the modal but mis-targets the underlying itinerary, shield
      // that underlying element. Fields/scrolling inside the modal are untouched.
      const overlay = document.getElementById('modal-overlay');
      if (overlay?.classList.contains('open')) {
        const target = event.target instanceof Element ? event.target : event.target?.parentElement;
        if (target && !overlay.contains(target)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }
    }, { capture:true, passive:false });

    window.addEventListener('touchmove', event => {
      if (!state.touch) return;
      const touch = touchById(event.touches, state.touch.id);
      if (!touch) return;
      if (Math.hypot(touch.clientX - state.touch.startX, touch.clientY - state.touch.startY) > 18) {
        state.touch.moved = true;
      }
      if (state.touch.button) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, { capture:true, passive:false });

    window.addEventListener('touchend', event => {
      if (!state.touch) return;
      const session = state.touch;
      state.touch = null;
      const touch = touchById(event.changedTouches, session.id);
      if (!touch || !session.button) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      if (session.moved) return;
      const rect = session.button.getBoundingClientRect?.();
      if (!rectContains(rect, touch.clientX, touch.clientY, 14)) return;

      // preventDefault on touchend suppresses Safari's normal synthetic click.
      // The short trusted-click guard is an extra defence for standalone mode.
      state.suppressTrustedClickUntil = Date.now() + 700;
      state.lastTouchAction = session.button.id || session.button.dataset?.activityAction || session.button.textContent || 'button';
      state.manualClickDepth += 1;
      try { session.button.click(); }
      finally { state.manualClickDepth -= 1; }
    }, { capture:true, passive:false });

    window.addEventListener('touchcancel', () => { state.touch = null; }, { capture:true, passive:true });

    window.addEventListener('click', event => {
      if (state.manualClickDepth > 0) return;

      // Drop only the trusted follow-up click after a manual touch activation.
      if (Date.now() < state.suppressTrustedClickUntil && event.isTrusted !== false) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      // Never allow a modal-visible click to fall through to the itinerary.
      const overlay = document.getElementById('modal-overlay');
      if (overlay?.classList.contains('open')) {
        const target = event.target instanceof Element ? event.target : event.target?.parentElement;
        if (target && !overlay.contains(target)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }
    }, true);
  }

  function installDelegates() {
    const overlay = document.getElementById('modal-overlay');
    const drawer = document.getElementById('drawer');
    if (overlay && overlay.dataset.activityV4Delegated !== '1') {
      overlay.dataset.activityV4Delegated = '1';
      overlay.addEventListener('click', onModalClick, true);
    }
    if (drawer && drawer.dataset.activityV4Delegated !== '1') {
      drawer.dataset.activityV4Delegated = '1';
      drawer.addEventListener('click', onDrawerClick, true);
    }
  }

  function wrapEntrypoints() {
    if (legacy.openAddItem) {
      window.openAddItem = function (...args) {
        const result = legacy.openAddItem.apply(this, args);
        syncModalOpen({ newSession:true });
        return result;
      };
    }
    if (legacy.openEditItem) {
      window.openEditItem = function (...args) {
        const result = legacy.openEditItem.apply(this, args);
        syncModalOpen({ newSession:true });
        return result;
      };
    }
    if (legacy.openDrawerItem) {
      window.openDrawerItem = function (...args) {
        return legacy.openDrawerItem.apply(this, args);
      };
    }

    window.editCurrentItem = editActivity;
    window.deleteCurrentItem = function () { return removeActivity(false, null); };
  }

  function observeUi() {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;
    state.overlayWasOpen = overlay.classList.contains('open');
    const observer = new MutationObserver(() => {
      const open = overlay.classList.contains('open');
      if (open) {
        if (!state.overlayWasOpen) {
          state.saveBusy = false;
          state.removeBusy = false;
        }
        syncModalOpen({ newSession:false });
      } else if (state.overlayWasOpen) {
        state.saveBusy = false;
        state.removeBusy = false;
        releaseClosedOverlay();
      }
      state.overlayWasOpen = open;
    });
    observer.observe(overlay, { attributes:true, attributeFilter:['class'] });
  }

  ensureStyles();
  installDelegates();
  installTouchBridge();
  wrapEntrypoints();
  observeUi();
  syncModalOpen({ newSession:false });

  const controller = {
    version: '4.0.0',
    resolveTarget,
    sameFingerprint,
    syncModalOpen,
    actionButtonAt,
    diagnostics() {
      const overlay = document.getElementById('modal-overlay');
      const save = document.getElementById('activity-save-btn-v4') || document.getElementById('modal-save-btn');
      return {
        version: '4.0.0',
        modalSession: state.modalSession,
        saveBusy: state.saveBusy,
        removeBusy: state.removeBusy,
        mobile: isMobile(),
        open: !!overlay?.classList.contains('open'),
        saveId: save?.id || '',
        lastTouchAction: state.lastTouchAction,
      };
    },
  };

  window.__activityEditorControllerV4 = controller;
  // Compatibility guards keep the old external controller inert.
  window.__activityEditorControllerV3 = controller;
  window.__activityEditorControllerV2 = controller;
  window.__activityEditorControllerV1 = controller;
})();

// Compatibility loader retained temporarily for deployment/runtime checks.
// The V1 guard above makes activity-editor.js inert; V4 in this file is the
// authoritative implementation actually exercised by CI.
(function loadActivityEditorCompatibility() {
  if (typeof document === 'undefined') return;
  if (document.querySelector('script[data-activity-editor-controller="1"]')) return;
  const script = document.createElement('script');
  script.src = '/activity-editor.js?v=20260905-2';
  script.async = false;
  script.dataset.activityEditorController = '1';
  document.body.appendChild(script);
})();