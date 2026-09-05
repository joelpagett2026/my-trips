// MY TRIPS — trip deletion + authoritative activity editor
//
// Activity Editor V3 deliberately uses one interaction model: native `click`.
// iOS/Safari generates one click for a tap, so Save/Edit/Remove are never also
// executed from touchend/pointerup. Capture-phase delegation wins over legacy
// inline handlers without accumulating listeners on every render.

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
    } catch (e) {
      console.error('Delete trip failed:', e);
      delete btn.dataset.busy;
      btn.disabled = false;
      btn.textContent = 'Delete permanently';
      alert('Could not delete trip. Nothing was partially deleted; please try again.');
    }
  };
})();

(function installActivityEditorV3() {
  'use strict';
  if (typeof window === 'undefined' || window.__activityEditorControllerV3) return;

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
    resizeRaf: 0,
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

    // Stable item identity survives authoritative STATE replacement.
    if (stableId) itemIdx = items.findIndex(item => item && String(item._id || '') === stableId);
    if (itemIdx < 0 && selected) itemIdx = items.indexOf(selected);

    // For pre-ID data, accept a fingerprint only when it is unambiguous.
    if (itemIdx < 0 && selected) {
      const matches = [];
      items.forEach((item, index) => { if (sameFingerprint(item, selected)) matches.push(index); });
      if (matches.length === 1) itemIdx = matches[0];
    }

    // The drawer's current index is a safe final fallback if the row at that
    // exact index still matches the item the user opened. This allows old
    // duplicate-looking rows to be edited/removed individually.
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

  function important(el, property, value) {
    if (el?.style) el.style.setProperty(property, value, 'important');
  }

  function ensureStyles() {
    if (!document.head || document.getElementById('activity-editor-v3-style')) return;
    const style = document.createElement('style');
    style.id = 'activity-editor-v3-style';
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
      #activity-save-btn-v3,
      #modal-overlay .modal-close,
      #modal-overlay #modal-delete-btn,
      #drawer .dr-text-btn {
        touch-action:manipulation !important;
        -webkit-user-select:none !important;
        user-select:none !important;
      }
      #activity-save-btn-v3[data-busy="1"],
      #modal-overlay #modal-delete-btn[data-busy="1"] {
        opacity:.68 !important;
        pointer-events:none !important;
      }

      @media (max-width:768px) {
        #modal-overlay {
          position:fixed !important;
          inset:0 !important;
          width:100vw !important;
          height:100vh !important;
          min-height:100dvh !important;
          padding:0 !important;
          margin:0 !important;
          overflow:hidden !important;
          align-items:flex-start !important;
          justify-content:flex-start !important;
          background:#fff !important;
          backdrop-filter:none !important;
        }
        #modal-overlay .modal {
          position:relative !important;
          inset:auto !important;
          width:100% !important;
          max-width:none !important;
          min-width:0 !important;
          height:var(--activity-visible-height,100dvh) !important;
          max-height:var(--activity-visible-height,100dvh) !important;
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
          z-index:1 !important;
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
          grid-column:auto !important;
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
        #activity-save-btn-v3 {
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
    const save = document.getElementById('activity-save-btn-v3')
      || document.getElementById('activity-save-btn')
      || document.getElementById('modal-save-btn');
    if (!save) return null;
    save.id = 'activity-save-btn-v3';
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

  function visibleHeight() {
    const raw = Number(window.visualViewport?.height || window.innerHeight || 640);
    return Math.max(320, Math.round(raw));
  }

  function applyMobileShell() {
    state.resizeRaf = 0;
    if (!isMobile()) return;
    const overlay = document.getElementById('modal-overlay');
    const modal = overlay?.querySelector('.modal');
    if (!overlay || !modal || !overlay.classList.contains('open')) return;

    // The overlay always covers the full layout viewport so the itinerary can
    // never show through. Only the inner editor follows the visible keyboard
    // viewport height.
    important(overlay, 'position', 'fixed');
    important(overlay, 'left', '0');
    important(overlay, 'right', '0');
    important(overlay, 'top', '0');
    important(overlay, 'bottom', '0');
    important(overlay, 'width', '100vw');
    important(overlay, 'height', '100vh');
    important(overlay, 'min-height', '100dvh');
    important(overlay, 'padding', '0');
    important(overlay, 'margin', '0');
    important(overlay, 'background', '#fff');
    important(overlay, 'overflow', 'hidden');
    important(overlay, 'opacity', '1');
    important(overlay, 'visibility', 'visible');
    important(overlay, 'pointer-events', 'auto');
    important(overlay, 'z-index', '2147483000');

    const h = visibleHeight();
    modal.style.setProperty('--activity-visible-height', h + 'px');
    important(modal, 'pointer-events', 'auto');
    important(modal, 'z-index', '1');
  }

  function queueMobileShell() {
    if (state.resizeRaf) cancelAnimationFrame(state.resizeRaf);
    state.resizeRaf = requestAnimationFrame(applyMobileShell);
  }

  function releaseClosedOverlay() {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay || overlay.classList.contains('open')) return;
    important(overlay, 'pointer-events', 'none');
    overlay.style.removeProperty('z-index');
    overlay.style.removeProperty('opacity');
    overlay.style.removeProperty('visibility');
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

    normalizeSaveButton();
    important(overlay, 'pointer-events', 'auto');
    important(overlay, 'opacity', '1');
    important(overlay, 'visibility', 'visible');
    important(overlay, 'z-index', '2147483000');
    queueMobileShell();
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

    // Historical persistence code expects this ID. It exists only during the
    // synchronous serializer call, after capture-phase click handling is over,
    // so legacy document click/touch handlers cannot see the user interaction.
    save.id = 'modal-save-btn';
    let result;
    try {
      if (!legacy.saveItem) throw new Error('Save action is unavailable');
      result = legacy.saveItem.call(window);
    } catch (error) {
      console.error('Activity Save failed before persistence', error);
      save.id = 'activity-save-btn-v3';
      state.saveBusy = false;
      save.disabled = false;
      delete save.dataset.busy;
      save.textContent = save.dataset.normalText || 'Save';
      if (typeof setStatus === 'function') setStatus('error', '✕ Save failed — try again');
      alert('This activity could not be saved. Please try again.');
      return false;
    }

    // Synchronous validation keeps the modal open. Restore the V3 identity and
    // allow the corrected form to be submitted again.
    if (overlay.classList.contains('open')) {
      save.id = 'activity-save-btn-v3';
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
    const save = target.closest('#activity-save-btn-v3,#activity-save-btn,#modal-save-btn');
    const remove = target.closest('#modal-delete-btn');
    if (!close && !save && !remove) return; // category/tabs/fields keep native behavior

    event.preventDefault();
    event.stopImmediatePropagation();

    if (close) {
      closeEditor();
      return;
    }
    if (save) {
      saveActivity();
      return;
    }
    if (remove) removeActivity(true, remove);
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
    button.removeAttribute('onclick');

    if (action === 'edit') editActivity();
    else removeActivity(false, button);
  }

  function installDelegates() {
    const overlay = document.getElementById('modal-overlay');
    const drawer = document.getElementById('drawer');
    if (overlay && overlay.dataset.activityV3Delegated !== '1') {
      overlay.dataset.activityV3Delegated = '1';
      overlay.addEventListener('click', onModalClick, true);
    }
    if (drawer && drawer.dataset.activityV3Delegated !== '1') {
      drawer.dataset.activityV3Delegated = '1';
      drawer.addEventListener('click', onDrawerClick, true);
    }

    // Prevent the drawer swipe recogniser from arming when the user's finger
    // starts on Edit/Remove. This does NOT preventDefault, so iOS still emits
    // the one native click that performs the action.
    if (document.documentElement.dataset.activityV3TouchGuard !== '1') {
      document.documentElement.dataset.activityV3TouchGuard = '1';
      document.addEventListener('touchstart', event => {
        const target = event.target instanceof Element ? event.target : event.target?.parentElement;
        if (target?.closest?.('#drawer .dr-text-actions .dr-text-btn')) event.stopPropagation();
      }, { capture:true, passive:true });
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

  function bindViewport() {
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', queueMobileShell, { passive:true });
    }
    window.addEventListener('resize', queueMobileShell, { passive:true });
    window.addEventListener('orientationchange', () => window.setTimeout(queueMobileShell, 100), { passive:true });
  }

  ensureStyles();
  installDelegates();
  wrapEntrypoints();
  observeUi();
  bindViewport();
  syncModalOpen({ newSession:false });

  const controller = {
    version: '3.0.0',
    resolveTarget,
    sameFingerprint,
    syncModalOpen,
    diagnostics() {
      const overlay = document.getElementById('modal-overlay');
      const save = document.getElementById('activity-save-btn-v3') || document.getElementById('modal-save-btn');
      return {
        version: '3.0.0',
        modalSession: state.modalSession,
        saveBusy: state.saveBusy,
        removeBusy: state.removeBusy,
        mobile: isMobile(),
        open: !!overlay?.classList.contains('open'),
        saveId: save?.id || '',
        overlayPointerEvents: overlay ? getComputedStyle(overlay).pointerEvents : '',
      };
    },
  };

  window.__activityEditorControllerV3 = controller;
  // Keep older compatibility guards truthy so the legacy external controller,
  // if a cached browser requests it, exits without attaching another handler.
  window.__activityEditorControllerV2 = controller;
  window.__activityEditorControllerV1 = controller;
})();

// Compatibility loader retained temporarily because deployment validation still
// verifies this file exists. Activity Editor V3 above is already authoritative;
// activity-editor.js sees the V1 guard and exits without adding listeners.
(function loadActivityEditorCompatibility() {
  if (typeof document === 'undefined') return;
  if (document.querySelector('script[data-activity-editor-controller="1"]')) return;
  const script = document.createElement('script');
  script.src = '/activity-editor.js?v=20260905-1';
  script.async = false;
  script.dataset.activityEditorController = '1';
  document.body.appendChild(script);
})();
