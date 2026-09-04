// MY TRIPS — authoritative activity editor + item action controller
//
// One controller owns Add/Edit/Remove interaction across desktop, mobile web and
// the iOS Home Screen app. It deliberately does NOT execute actions from touchend
// or pointerdown. Those events only stop the drawer swipe gesture. The native
// click is the single activation event, preventing duplicate saves and iOS
// click-through after a drawer/modal closes.
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.__activityEditorControllerV1) return;

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
    modalSession: 0,
    saveBusy: false,
    removeBusy: false,
    overlayWasOpen: false,
    resizeRaf: 0,
  };

  const bound = new WeakSet();
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

    let itemIdx = -1;
    const selected = descriptor.item || null;
    const stableId = selected?._id ? String(selected._id) : '';

    // Stable ID is authoritative after a server response replaces STATE with a
    // fresh object graph.
    if (stableId) itemIdx = items.findIndex(item => item && String(item._id || '') === stableId);
    if (itemIdx < 0 && selected) itemIdx = items.indexOf(selected);

    // Older rows may pre-date stable IDs. Fingerprint matching is only safe if
    // it uniquely identifies one row; never guess between duplicate-looking
    // activities.
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
    if (!document.head || document.getElementById('activity-editor-controller-style')) return;
    const style = document.createElement('style');
    style.id = 'activity-editor-controller-style';
    style.textContent = `
      #activity-save-btn,
      [data-activity-action="edit"],
      [data-activity-action="remove"] {
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

    // iOS already positions fixed elements relative to its visible viewport.
    // Only the visible HEIGHT is consumed here; applying offsetTop/pageTop again
    // is what previously pushed the editor down when the keyboard opened.
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

    // Never set pointer-events inline. The stylesheet contract remains the sole
    // authority: .modal-overlay is pointer-events:none and only .open is auto.
    // That guarantees a closed editor cannot leave an invisible touch blocker.
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

  function finishModalSession() {
    state.saveBusy = false;
    const save = document.getElementById('activity-save-btn') || document.getElementById('modal-save-btn');
    if (save) {
      save.disabled = false;
      delete save.dataset.busy;
      if (save.dataset.normalText) save.textContent = save.dataset.normalText;
    }
  }

  function configureSaveButton() {
    const save = document.getElementById('activity-save-btn') || document.getElementById('modal-save-btn');
    if (!save) return;

    // Older document-level Save handlers explicitly query #modal-save-btn. Give
    // the live control a controller-only ID so they are inert, while preserving
    // the existing atomic persistence wrapper behind legacy.saveItem.
    save.id = 'activity-save-btn';
    save.removeAttribute('onclick');
    save.type = 'button';
    save.dataset.activityAction = 'save';
    if (!save.dataset.normalText) save.dataset.normalText = save.textContent || 'Save';
    save.disabled = false;
    delete save.dataset.busy;

    if (!bound.has(save)) {
      save.addEventListener('click', onSaveClick);
      bound.add(save);
    }
  }

  function configureCloseControls() {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;
    const close = overlay.querySelector('.modal-close');
    const cancel = overlay.querySelector('.modal-foot .modal-btn.secondary');
    [close, cancel].filter(Boolean).forEach(button => {
      button.removeAttribute('onclick');
      button.type = 'button';
      if (!bound.has(button)) {
        button.addEventListener('click', onCloseClick);
        bound.add(button);
      }
    });
  }

  function configureModalDeleteButton() {
    const button = document.getElementById('modal-delete-btn');
    if (!button) return;
    button.removeAttribute('onclick');
    button.type = 'button';
    button.dataset.activityAction = 'remove';
    if (!bound.has(button)) {
      button.addEventListener('click', onRemoveClick);
      button.addEventListener('pointerdown', stopGesture, { passive:true });
      button.addEventListener('touchstart', stopGesture, { passive:true });
      bound.add(button);
    }
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
    if (button.dataset.activityAction === 'edit' || button.dataset.activityAction === 'remove') return button.dataset.activityAction;
    const onclick = button.getAttribute('onclick') || '';
    const text = String(button.textContent || '').trim().toLowerCase();
    if (onclick.includes('editCurrentItem') || text === 'edit') return 'edit';
    if (onclick.includes('deleteCurrentItem') || text === 'remove' || text === 'delete') return 'remove';
    return '';
  }

  function stopGesture(event) {
    // Never perform the action here. This only keeps the drawer's swipe-to-close
    // recogniser from arming when the user intended to press a button.
    event.stopPropagation();
  }

  function configureDrawerActions() {
    document.querySelectorAll('#drawer .dr-text-actions .dr-text-btn').forEach(button => {
      const action = classifyDrawerButton(button);
      if (!action) return;
      button.dataset.activityAction = action;
      button.removeAttribute('onclick');
      button.type = 'button';
      if (bound.has(button)) return;
      button.addEventListener('pointerdown', stopGesture, { passive:true });
      button.addEventListener('touchstart', stopGesture, { passive:true });
      button.addEventListener('click', action === 'edit' ? onEditClick : onRemoveClick);
      bound.add(button);
    });
  }

  function onCloseClick(event) {
    event.preventDefault();
    event.stopPropagation();
    finishModalSession();
    if (legacy.closeModal) legacy.closeModal.call(window);
  }

  function onSaveClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const overlay = document.getElementById('modal-overlay');
    if (!overlay?.classList.contains('open') || state.saveBusy) return;

    const save = event.currentTarget;
    state.saveBusy = true;
    save.dataset.busy = '1';
    save.disabled = true;
    save.textContent = 'Saving…';

    // The click capture phase has already passed while the control had the
    // controller-only ID. Restore the legacy ID now so existing form-building
    // code can query it, without letting old document handlers see this click.
    save.id = 'modal-save-btn';

    try {
      if (!legacy.saveItem) throw new Error('Save action is unavailable');
      legacy.saveItem.call(window);
    } catch (error) {
      console.error('Activity Save failed before persistence', error);
      save.id = 'activity-save-btn';
      state.saveBusy = false;
      save.disabled = false;
      delete save.dataset.busy;
      save.textContent = save.dataset.normalText || 'Save';
      if (typeof setStatus === 'function') setStatus('error', '✕ Save failed — try again');
      alert('This activity could not be saved. Please try again.');
      return;
    }

    // Validation keeps the editor open synchronously. If that happened, restore
    // the controller ID and permit a corrected retry. A valid submission closes
    // the modal and the atomic persistence layer owns success/failure recovery.
    if (overlay.classList.contains('open')) {
      window.setTimeout(() => {
        if (!overlay.classList.contains('open')) return;
        const activeSave = document.getElementById('modal-save-btn') || save;
        activeSave.id = 'activity-save-btn';
        state.saveBusy = false;
        activeSave.disabled = false;
        delete activeSave.dataset.busy;
        activeSave.textContent = activeSave.dataset.normalText || 'Save';
      }, 0);
    }
  }

  function onEditClick(event) {
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
    } catch (error) {
      console.error('Open activity editor failed', error);
      alert('Could not open this item for editing. Please try again.');
      return false;
    }

    // Close the details drawer only after the editor exists. Because the action
    // runs from native click rather than touchend, no later synthetic click can
    // fall through onto the itinerary underneath.
    try { if (legacy.closeDrawer) legacy.closeDrawer.call(window); } catch (_) {}
    return true;
  }

  async function onRemoveClick(event) {
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
    const button = event?.currentTarget;
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

    // Any remaining inline/programmatic calls are routed through the same
    // authoritative controller instead of creating a second interaction path.
    window.editCurrentItem = function () { return onEditClick(null); };
    window.deleteCurrentItem = function () { return onRemoveClick(null); };
  }

  function observeUi() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
      state.overlayWasOpen = overlay.classList.contains('open');
      const observer = new MutationObserver(() => {
        const open = overlay.classList.contains('open');
        if (open && !state.overlayWasOpen) {
          // Atomic-save failure can reopen the form without calling openAdd/Edit.
          state.saveBusy = false;
          state.removeBusy = false;
          configureModal({ newSession:false });
        }
        if (!open && state.overlayWasOpen) finishModalSession();
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

  window.__activityEditorControllerV1 = {
    version: '1.1.0',
    resolveTarget,
    sameFingerprint,
    configureModal,
    configureDrawerActions,
    diagnostics() {
      return {
        modalSession: state.modalSession,
        saveBusy: state.saveBusy,
        removeBusy: state.removeBusy,
        mobile: isMobile(),
      };
    },
  };
})();
