// MY TRIPS — trip deletion + authoritative activity editor bootstrap
//
// This file is loaded directly by trip.php with a file-version query string.
// Activity Add/Edit/Remove/Save is therefore installed synchronously with the
// itinerary page instead of depending on a second dynamically fetched script.
// That is important for iOS Home Screen apps, where a suspended/cached document
// can otherwise leave the modal visible while the action controller never loads.
(function () {
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
    if (!btn) return;
    if (btn.dataset.busy === '1') return;
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

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITY EDITOR V2
// One controller owns Save, Edit and Remove on desktop, mobile Safari and the
// installed iPhone Home Screen app. Touch activation happens on pointerup, then
// the following synthetic click is consumed globally. Mouse/keyboard activation
// uses click. No action is ever executed from both paths.
// ─────────────────────────────────────────────────────────────────────────────
(function installActivityEditorV2() {
  'use strict';
  if (typeof window === 'undefined' || window.__activityEditorControllerV2) return;

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
    suppressClickUntil: 0,
    overlayWasOpen: false,
    resizeRaf: 0,
    modalSession: 0,
  };

  const bound = new WeakSet();
  const MOBILE_QUERY = '(max-width: 768px)';
  const isMobile = () => !!(window.matchMedia && window.matchMedia(MOBILE_QUERY).matches);
  const isTouchPointer = event => event && (event.pointerType === 'touch' || event.pointerType === 'pen');

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

    // Old rows can pre-date stable IDs. A fingerprint is safe only if unique.
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

  function setImportant(el, property, value) {
    if (el) el.style.setProperty(property, value, 'important');
  }

  function ensureStyles() {
    if (!document.head || document.getElementById('activity-editor-v2-style')) return;
    const style = document.createElement('style');
    style.id = 'activity-editor-v2-style';
    style.textContent = `
      #activity-save-btn,
      [data-activity-action="edit"],
      [data-activity-action="remove"],
      [data-activity-action="close"] {
        touch-action:manipulation !important;
        -webkit-user-select:none !important;
        user-select:none !important;
      }
      #activity-save-btn[data-busy="1"],
      [data-activity-action="remove"][data-busy="1"] {
        opacity:.68 !important;
        pointer-events:none !important;
      }
      @media (max-width:768px) {
        #modal-overlay .modal::before { display:none !important; content:none !important; }
        #modal-overlay .modal-head {
          flex:0 0 auto !important;
          display:grid !important;
          grid-template-columns:minmax(102px,.72fr) minmax(0,1.18fr) 42px !important;
          align-items:center !important;
          gap:6px !important;
          padding:calc(10px + env(safe-area-inset-top,0px)) 12px 10px !important;
          border-radius:0 !important;
          background:#fff !important;
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
          position:static !important;
          justify-self:end !important;
          margin:0 !important;
        }
        #modal-overlay .modal-body,
        #modal-overlay #modal-body-single,
        #modal-overlay #modal-body-bulk {
          flex:1 1 0 !important;
          min-height:0 !important;
          overflow-y:auto !important;
          overflow-x:hidden !important;
          -webkit-overflow-scrolling:touch !important;
          overscroll-behavior-y:contain !important;
          background:#fff !important;
          scroll-padding-bottom:96px !important;
        }
        #modal-overlay .modal-foot {
          position:relative !important;
          flex:0 0 auto !important;
          display:flex !important;
          align-items:center !important;
          gap:10px !important;
          width:100% !important;
          grid-template-columns:none !important;
          padding:12px 14px calc(12px + env(safe-area-inset-bottom,0px)) !important;
          background:#fff !important;
          border-top:1px solid rgba(100,120,128,.13) !important;
          box-shadow:0 -8px 20px rgba(20,35,45,.055) !important;
        }
        #modal-overlay .modal-foot .modal-btn.secondary { display:none !important; }
        #activity-save-btn {
          display:block !important;
          flex:1 1 auto !important;
          width:auto !important;
          min-width:0 !important;
        }
        #modal-overlay #modal-delete-btn { flex:0 0 auto !important; }
      }
      @media (max-width:390px) {
        #modal-overlay .modal-head {
          grid-template-columns:minmax(96px,.7fr) minmax(0,1.1fr) 38px !important;
          padding-left:10px !important;
          padding-right:10px !important;
          gap:5px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function applyMobileShell() {
    state.resizeRaf = 0;
    if (!isMobile()) return;
    const overlay = document.getElementById('modal-overlay');
    const modal = overlay?.querySelector('.modal');
    if (!overlay || !modal || !overlay.classList.contains('open')) return;

    const vv = window.visualViewport;
    const height = Math.max(320, Math.round(vv?.height || window.innerHeight || 640));

    // Fixed elements already track the visible iOS viewport. Only its HEIGHT is
    // consumed; offsetTop/pageTop must never be applied a second time.
    setImportant(overlay, 'position', 'fixed');
    setImportant(overlay, 'left', '0');
    setImportant(overlay, 'right', '0');
    setImportant(overlay, 'top', '0');
    setImportant(overlay, 'bottom', 'auto');
    setImportant(overlay, 'width', '100%');
    setImportant(overlay, 'height', height + 'px');
    setImportant(overlay, 'min-height', '0');
    setImportant(overlay, 'padding', '0');
    setImportant(overlay, 'margin', '0');
    setImportant(overlay, 'align-items', 'stretch');
    setImportant(overlay, 'justify-content', 'stretch');
    setImportant(overlay, 'overflow', 'hidden');
    setImportant(overlay, 'background', '#fff');
    setImportant(overlay, 'transform', 'none');
    setImportant(overlay, 'overscroll-behavior', 'none');

    setImportant(modal, 'position', 'relative');
    setImportant(modal, 'left', 'auto');
    setImportant(modal, 'right', 'auto');
    setImportant(modal, 'top', 'auto');
    setImportant(modal, 'bottom', 'auto');
    setImportant(modal, 'width', '100%');
    setImportant(modal, 'max-width', 'none');
    setImportant(modal, 'min-width', '0');
    setImportant(modal, 'height', '100%');
    setImportant(modal, 'max-height', 'none');
    setImportant(modal, 'margin', '0');
    setImportant(modal, 'padding', '0');
    setImportant(modal, 'border-radius', '0');
    setImportant(modal, 'box-shadow', 'none');
    setImportant(modal, 'transform', 'none');
    setImportant(modal, 'contain', 'none');
    setImportant(modal, 'overflow', 'hidden');
    setImportant(modal, 'background', '#fff');
    setImportant(modal, 'display', 'flex');
    setImportant(modal, 'flex-direction', 'column');
  }

  function queueMobileShell() {
    if (state.resizeRaf) cancelAnimationFrame(state.resizeRaf);
    state.resizeRaf = requestAnimationFrame(applyMobileShell);
  }

  function restoreLegacySaveId() {
    const save = document.getElementById('activity-save-btn');
    if (save) save.id = 'modal-save-btn';
    return save || document.getElementById('modal-save-btn');
  }

  function armSyntheticClickBlock() {
    state.suppressClickUntil = Date.now() + 800;
  }

  // Consume the synthetic click iOS emits after a touch pointerup. This capture
  // listener prevents click-through even when the modal/drawer has already been
  // removed and Safari retargets the click to the itinerary underneath.
  document.addEventListener('click', event => {
    if (Date.now() >= state.suppressClickUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  function finishModalSession() {
    state.saveBusy = false;
    state.removeBusy = false;
    const save = document.getElementById('activity-save-btn') || document.getElementById('modal-save-btn');
    if (save) {
      save.disabled = false;
      delete save.dataset.busy;
      if (save.dataset.normalText) save.textContent = save.dataset.normalText;
    }
  }

  function bindPress(button, actionName, handler) {
    if (!button || bound.has(button)) return;
    bound.add(button);
    button.dataset.activityAction = actionName;
    button.type = 'button';
    button.removeAttribute('onclick');

    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let moved = false;

    button.addEventListener('touchstart', event => {
      // Stops the drawer's touchstart swipe recogniser from arming. No action is
      // executed from touchstart/touchend.
      event.stopPropagation();
    }, { passive:true });

    button.addEventListener('pointerdown', event => {
      if (!isTouchPointer(event)) return;
      event.stopPropagation();
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      moved = false;
    }, { passive:true });

    button.addEventListener('pointermove', event => {
      if (pointerId === null || event.pointerId !== pointerId) return;
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 18) moved = true;
    }, { passive:true });

    button.addEventListener('pointercancel', event => {
      if (pointerId !== null && event.pointerId === pointerId) {
        pointerId = null;
        moved = false;
      }
    }, { passive:true });

    button.addEventListener('pointerup', event => {
      if (!isTouchPointer(event) || pointerId === null || event.pointerId !== pointerId) return;
      const shouldRun = !moved;
      pointerId = null;
      moved = false;
      event.preventDefault();
      event.stopPropagation();
      armSyntheticClickBlock();
      if (shouldRun) handler(event);
    }, { passive:false });

    button.addEventListener('click', event => {
      // Touch-generated clicks are consumed by the document capture guard above.
      // Mouse clicks and keyboard activation arrive here normally.
      if (Date.now() < state.suppressClickUntil) return;
      handler(event);
    });
  }

  function configureSaveButton() {
    const save = document.getElementById('activity-save-btn') || document.getElementById('modal-save-btn');
    if (!save) return;

    // itinerary-state-guard.js contains historical document-level touch handlers
    // that explicitly look for #modal-save-btn. While the modal is interactive,
    // the authoritative controller gives the button its own ID so those handlers
    // are inert. The legacy ID is restored only during the synchronous save call.
    save.id = 'activity-save-btn';
    if (!save.dataset.normalText) save.dataset.normalText = save.textContent || 'Save';
    bindPress(save, 'save', onSavePress);
  }

  function configureCloseControls() {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;
    const close = overlay.querySelector('.modal-close');
    const cancel = overlay.querySelector('.modal-foot .modal-btn.secondary');
    bindPress(close, 'close', onClosePress);
    bindPress(cancel, 'close', onClosePress);
  }

  function configureModalDeleteButton() {
    const button = document.getElementById('modal-delete-btn');
    bindPress(button, 'remove', onRemovePress);
  }

  function configureModal(options = {}) {
    ensureStyles();
    if (options.newSession) {
      state.modalSession += 1;
      state.saveBusy = false;
      state.removeBusy = false;
    }
    configureSaveButton();
    configureCloseControls();
    configureModalDeleteButton();
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

  function configureDrawerActions() {
    document.querySelectorAll('#drawer .dr-text-actions .dr-text-btn').forEach(button => {
      const action = classifyDrawerButton(button);
      if (action === 'edit') bindPress(button, 'edit', onEditPress);
      else if (action === 'remove') bindPress(button, 'remove', onRemovePress);
    });
  }

  function onClosePress(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    finishModalSession();
    if (legacy.closeModal) legacy.closeModal.call(window);
  }

  function onSavePress(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const overlay = document.getElementById('modal-overlay');
    if (!overlay?.classList.contains('open') || state.saveBusy) return false;

    const save = event?.currentTarget || document.getElementById('activity-save-btn');
    if (!save) return false;
    state.saveBusy = true;
    save.dataset.busy = '1';
    save.disabled = true;
    save.textContent = 'Saving…';

    // Restore #modal-save-btn only for the synchronous legacy form serializer.
    // It is changed back immediately if validation keeps the modal open.
    save.id = 'modal-save-btn';
    let result;
    try {
      if (!legacy.saveItem) throw new Error('Save action is unavailable');
      result = legacy.saveItem.call(window);
    } catch (error) {
      console.error('Activity Save failed before persistence', error);
      save.id = 'activity-save-btn';
      state.saveBusy = false;
      save.disabled = false;
      delete save.dataset.busy;
      save.textContent = save.dataset.normalText || 'Save';
      if (typeof setStatus === 'function') setStatus('error', '✕ Save failed — try again');
      alert('This activity could not be saved. Please try again.');
      return false;
    }

    if (overlay.classList.contains('open')) {
      save.id = 'activity-save-btn';
      state.saveBusy = false;
      save.disabled = false;
      delete save.dataset.busy;
      save.textContent = save.dataset.normalText || 'Save';
    }
    return result;
  }

  function onEditPress(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const target = resolveTarget(readDescriptor(false));
    if (!target) {
      alert('This item changed while it was open. Close it, reopen it and try again.');
      return false;
    }

    exposeTarget(target);
    restoreLegacySaveId();
    try {
      if (!legacy.openEditItem) throw new Error('Edit action is unavailable');
      legacy.openEditItem.call(window, target.dayIdx, target.itemIdx);
      configureModal({ newSession:true });
      if (legacy.closeDrawer) legacy.closeDrawer.call(window);
      return true;
    } catch (error) {
      console.error('Open activity editor failed', error);
      alert('Could not open this item for editing. Please try again.');
      return false;
    }
  }

  async function onRemovePress(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (state.removeBusy) return false;

    const preferEdit = !!event?.currentTarget?.closest?.('#modal-overlay');
    const target = resolveTarget(readDescriptor(preferEdit));
    if (!target) {
      alert('This item changed while it was open. Close it, reopen it and try again.');
      return false;
    }

    exposeTarget(target);
    state.removeBusy = true;
    const button = event?.currentTarget || null;
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

  function wrapLegacyEntrypoints() {
    if (legacy.openAddItem) {
      window.openAddItem = function (...args) {
        restoreLegacySaveId();
        const result = legacy.openAddItem.apply(this, args);
        configureModal({ newSession:true });
        return result;
      };
    }
    if (legacy.openEditItem) {
      window.openEditItem = function (...args) {
        restoreLegacySaveId();
        const result = legacy.openEditItem.apply(this, args);
        configureModal({ newSession:true });
        return result;
      };
    }
    if (legacy.openDrawerItem) {
      window.openDrawerItem = function (...args) {
        const result = legacy.openDrawerItem.apply(this, args);
        configureDrawerActions();
        return result;
      };
    }

    window.editCurrentItem = function () { return onEditPress(null); };
    window.deleteCurrentItem = function () { return onRemovePress(null); };
  }

  function observeUi() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
      state.overlayWasOpen = overlay.classList.contains('open');
      const observer = new MutationObserver(() => {
        const open = overlay.classList.contains('open');
        if (open && !state.overlayWasOpen) {
          state.saveBusy = false;
          state.removeBusy = false;
          configureModal({ newSession:false });
        } else if (!open && state.overlayWasOpen) {
          finishModalSession();
        }
        state.overlayWasOpen = open;
      });
      observer.observe(overlay, { attributes:true, attributeFilter:['class'] });
    }

    const drawer = document.getElementById('drawer');
    if (drawer) {
      const observer = new MutationObserver(() => {
        if (drawer.classList.contains('open')) configureDrawerActions();
      });
      observer.observe(drawer, { attributes:true, attributeFilter:['class'] });
    }
  }

  function bindViewport() {
    if (window.visualViewport) window.visualViewport.addEventListener('resize', queueMobileShell, { passive:true });
    window.addEventListener('resize', queueMobileShell, { passive:true });
    window.addEventListener('orientationchange', () => window.setTimeout(queueMobileShell, 120), { passive:true });
  }

  ensureStyles();
  wrapLegacyEntrypoints();
  observeUi();
  bindViewport();
  configureDrawerActions();
  if (document.getElementById('modal-overlay')?.classList.contains('open')) configureModal({ newSession:true });

  window.__activityEditorControllerV2 = {
    version: '2.0.0',
    resolveTarget,
    sameFingerprint,
    configureModal,
    configureDrawerActions,
    diagnostics() {
      return {
        version: '2.0.0',
        modalSession: state.modalSession,
        saveBusy: state.saveBusy,
        removeBusy: state.removeBusy,
        mobile: isMobile(),
      };
    },
  };

  // The previous external controller checks this flag before installing. Keep it
  // truthy so an older dynamically loaded file becomes an inert compatibility
  // fetch rather than a second set of event handlers.
  window.__activityEditorControllerV1 = window.__activityEditorControllerV2;
})();

// Compatibility loader retained for one release so existing validation and any
// old HTML references still resolve. Activity Editor V2 above is already active;
// activity-editor.js sees the V1 guard and exits without binding anything.
(function loadActivityEditor() {
  if (typeof document === 'undefined') return;
  if (document.querySelector('script[data-activity-editor-controller="1"]')) return;
  const script = document.createElement('script');
  script.src = '/activity-editor.js?v=20260905-1';
  script.async = false;
  script.dataset.activityEditorController = '1';
  document.body.appendChild(script);
})();
