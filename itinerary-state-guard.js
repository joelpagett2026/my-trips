// MY TRIPS — itinerary state safety layer
// Keeps snapshot/undo history based on the last successfully persisted state
// instead of snapshotting the already-edited state during save.
(function () {
  if (typeof window === 'undefined') return;

  let lastPersistedState = null;
  let lastSnapshotKey = null;
  let initialized = false;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function stateKey(value) {
    try { return JSON.stringify(value); }
    catch { return ''; }
  }

  async function persistSnapshots() {
    if (typeof SNAPS_ID === 'undefined' || typeof dbSave !== 'function') return;
    try {
      await dbSave(SNAPS_ID, { snaps: snapshotList });
    } catch (e) {
      console.warn('Snapshot save failed', e);
    }
  }

  function pushSnapshot(data) {
    if (!data || typeof snapshotList === 'undefined') return;
    const key = stateKey(data);
    const currentTopKey = snapshotList.length ? stateKey(snapshotList[0]?.data) : '';
    if (!key || key === lastSnapshotKey || key === currentTopKey) {
      if (key) lastSnapshotKey = key;
      return;
    }
    snapshotList.unshift({ ts: Date.now(), data: clone(data) });
    if (snapshotList.length > 10) snapshotList.length = 10;
    lastSnapshotKey = key;
    persistSnapshots();
  }

  function initializeFromLoadedRecord() {
    if (initialized) return true;
    if (typeof RECORD_ID === 'undefined' || typeof STATE === 'undefined' || !STATE) return false;
    const loaded = window.__mytripsLoadedRecords;
    if (!(loaded instanceof Map) || !loaded.has(RECORD_ID)) return false;

    const serverState = loaded.get(RECORD_ID);
    lastPersistedState = serverState == null ? clone(STATE) : clone(serverState);
    initialized = true;
    return true;
  }

  function waitForLoadedRecord(maxMs = 5000) {
    if (initializeFromLoadedRecord()) return Promise.resolve(true);
    return new Promise(resolve => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (initializeFromLoadedRecord()) {
          clearInterval(timer);
          resolve(true);
          return;
        }
        if (Date.now() - started >= maxMs) {
          clearInterval(timer);
          resolve(false);
        }
      }, 100);
    });
  }

  document.addEventListener('mytrips:record-loaded', (event) => {
    if (typeof RECORD_ID === 'undefined') return;
    if (!event.detail || event.detail.id !== RECORD_ID) return;
    const serverState = event.detail.data;
    if (!initialized) {
      lastPersistedState = serverState == null ? clone(STATE) : clone(serverState);
      initialized = true;
    }
  });

  // Existing handlers call takeSnapshot() around destructive edits. Capture the
  // last server-confirmed state immediately so Undo is safe even if the user taps
  // it before the asynchronous autosave finishes. saveData() also captures the
  // same baseline for edit paths that never call takeSnapshot(); de-duplication in
  // pushSnapshot() prevents the two paths from creating duplicate history rows.
  window.takeSnapshot = function () {
    if (!initializeFromLoadedRecord()) return;
    pushSnapshot(lastPersistedState);
  };

  window.saveData = async function () {
    if (!initializeFromLoadedRecord()) {
      const ready = await waitForLoadedRecord();
      if (!ready) {
        if (typeof setStatus === 'function') setStatus('error', '✕ Save paused — reload');
        console.error('Save paused: authoritative itinerary state did not finish loading');
        return false;
      }
    }

    const nextState = clone(STATE);
    const previousState = clone(lastPersistedState);

    try {
      await dbSave(RECORD_ID, nextState);
      if (stateKey(previousState) !== stateKey(nextState)) pushSnapshot(previousState);
      lastPersistedState = nextState;
      if (typeof setStatus === 'function') setStatus('saved', '');
      if (typeof syncRegistryCities === 'function') syncRegistryCities();
      return true;
    } catch (e) {
      if (typeof setStatus === 'function') {
        const conflict = e && e.status === 409;
        setStatus('error', conflict ? '✕ Newer version exists — reload' : '✕ Save failed');
      }
      console.error('Save failed', e);
      return false;
    }
  };

  // Explicit Add/Edit saves are item-level transactions. The old path mutated
  // STATE, closed the modal, then hoped a whole-document autosave would complete.
  // On iPhone that could lose the click during keyboard viewport movement, and a
  // harmless change elsewhere could also make the whole-document version stale.
  // Keep autosave for background edits, but commit modal items directly on the
  // server while protecting concurrent edits to the same item.
  function installAtomicItemSave() {
    if (typeof window.saveItem !== 'function' || typeof window.scheduleSave !== 'function') return;
    if (window.saveItem.__atomicItemSave) return;

    const originalSaveItem = window.saveItem;
    const originalScheduleSave = window.scheduleSave;
    let suppressAutosave = false;
    let explicitSaveBusy = false;

    window.scheduleSave = function (...args) {
      if (suppressAutosave) return;
      return originalScheduleSave.apply(this, args);
    };

    const wrapped = function (...args) {
      if (explicitSaveBusy) return false;

      const bulkActive = !!document.getElementById('tab-bulk')?.classList.contains('active');
      const isCarHire = document.getElementById('f-type')?.value === 'move'
        && document.getElementById('f-transport-type')?.value === 'Car Hire / Road Trip';
      if (bulkActive || isCarHire || typeof window.dbUpsertItineraryItem !== 'function') {
        return originalSaveItem.apply(this, args);
      }

      const dayIdx = typeof activeDay === 'number' ? activeDay : 0;
      const beforeState = clone(STATE);
      const beforeItems = Array.isArray(STATE.days?.[dayIdx]?.items) ? STATE.days[dayIdx].items.slice() : [];
      const beforeRefs = new Set(beforeItems);
      const editDescriptor = (typeof editItem !== 'undefined' && editItem)
        ? { dayIdx: editItem.dayIdx, itemIdx: editItem.itemIdx, item: editItem.item || null }
        : null;
      const originalIndex = editDescriptor
        ? Math.max(0, beforeItems.indexOf(editDescriptor.item) >= 0 ? beforeItems.indexOf(editDescriptor.item) : Number(editDescriptor.itemIdx) || 0)
        : -1;
      const originalItem = editDescriptor?.item ? clone(editDescriptor.item) : null;

      suppressAutosave = true;
      let result;
      try {
        result = originalSaveItem.apply(this, args);
      } finally {
        suppressAutosave = false;
      }

      const overlay = document.getElementById('modal-overlay');
      if (overlay?.classList.contains('open')) return result; // validation kept it open

      const items = STATE.days?.[dayIdx]?.items || [];
      let savedIndex = -1;
      if (editDescriptor) {
        savedIndex = originalIndex < items.length ? originalIndex : -1;
      } else {
        savedIndex = items.findIndex(item => !beforeRefs.has(item));
      }
      if (savedIndex < 0 || !items[savedIndex]) {
        STATE = beforeState;
        if (typeof render === 'function') render();
        if (typeof setStatus === 'function') setStatus('error', '✕ Save failed');
        overlay?.classList.add('open');
        return false;
      }

      if (!items[savedIndex]._id) {
        items[savedIndex]._id = (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
          ? globalThis.crypto.randomUUID()
          : 'item-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      }

      explicitSaveBusy = true;
      if (typeof setStatus === 'function') setStatus('saving', '●  Saving…');

      // Defer one microtask so itinerary-completion.js can synchronously attach
      // restaurant place/photo metadata before we capture the item payload.
      Promise.resolve().then(async () => {
        const currentItems = STATE.days?.[dayIdx]?.items || [];
        let currentIndex = savedIndex;
        const stableId = items[savedIndex]?._id || '';
        if (stableId) {
          const byId = currentItems.findIndex(item => item && item._id === stableId);
          if (byId >= 0) currentIndex = byId;
        }
        const currentItem = currentItems[currentIndex];
        if (!currentItem) throw new Error('Saved item disappeared before persistence');

        const response = await window.dbUpsertItineraryItem(
          RECORD_ID,
          dayIdx,
          currentIndex,
          clone(currentItem),
          originalItem
        );

        STATE = clone(response.data);
        lastPersistedState = clone(response.data);
        initialized = true;
        if (stateKey(beforeState) !== stateKey(response.data)) pushSnapshot(beforeState);
        if (typeof render === 'function') render();
        if (typeof setStatus === 'function') setStatus('saved', '');
        if (typeof syncRegistryCities === 'function') syncRegistryCities();
      }).catch(error => {
        console.error('Atomic itinerary item save failed', error);
        STATE = beforeState;
        lastPersistedState = clone(beforeState);
        if (typeof render === 'function') render();
        if (editDescriptor && typeof editItem !== 'undefined') {
          const restored = STATE.days?.[dayIdx]?.items?.[originalIndex] || null;
          editItem = { dayIdx, itemIdx: originalIndex, item: restored };
        }
        if (typeof setStatus === 'function') {
          setStatus('error', error?.status === 409 ? '✕ Item changed — reload' : '✕ Save failed — try again');
        }
        const modal = document.getElementById('modal-overlay');
        modal?.classList.add('open');
        window.setTimeout(() => {
          alert(error?.status === 409
            ? 'This item changed in another tab. Reload the itinerary and try again.'
            : 'This item was not saved. Your form is still open so you can try again.');
        }, 0);
      }).finally(() => {
        explicitSaveBusy = false;
      });

      return result;
    };

    wrapped.__atomicItemSave = true;
    window.saveItem = wrapped;
  }

  function installTouchStableModalControls() {
    if (document.documentElement.dataset.touchStableEntryControls === '1') return;
    document.documentElement.dataset.touchStableEntryControls = '1';

    const style = document.createElement('style');
    style.textContent = `
      #f-meal-kind-row .tt-btn.active {
        background:var(--amber,#b97825) !important;
        border-color:var(--amber,#b97825) !important;
        color:#fff !important;
        box-shadow:0 1px 2px rgba(0,0,0,.08) !important;
      }
      #f-meal-status-row .tt-btn.active {
        background:rgba(185,120,37,.12) !important;
        border-color:var(--amber,#b97825) !important;
        color:#8a5618 !important;
      }
      #modal-save-btn[data-saving="1"] { opacity:.72 !important; pointer-events:none !important; }
    `;
    document.head.appendChild(style);

    let armedSavePointer = null;
    let lastTouchSaveAt = 0;
    let ignoreMealClickUntil = 0;

    document.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch') return;

      const kind = event.target.closest('#f-meal-kind-row .tt-btn');
      if (kind && typeof setMealKind === 'function') {
        event.preventDefault();
        event.stopImmediatePropagation();
        ignoreMealClickUntil = Date.now() + 900;
        setMealKind(kind.dataset.val || '');
        return;
      }

      const status = event.target.closest('#f-meal-status-row .tt-btn');
      if (status && typeof setMealStatus === 'function') {
        event.preventDefault();
        event.stopImmediatePropagation();
        ignoreMealClickUntil = Date.now() + 900;
        setMealStatus(status.dataset.val || 'walkin');
        return;
      }

      const save = event.target.closest('#modal-save-btn');
      if (save) {
        event.preventDefault();
        event.stopImmediatePropagation();
        armedSavePointer = event.pointerId;
      }
    }, true);

    document.addEventListener('pointerup', event => {
      if (event.pointerType !== 'touch' || armedSavePointer !== event.pointerId) return;
      const save = event.target.closest('#modal-save-btn');
      armedSavePointer = null;
      if (!save) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      lastTouchSaveAt = Date.now();
      save.dataset.saving = '1';
      try { window.saveItem(); }
      finally { window.setTimeout(() => { delete save.dataset.saving; }, 700); }
    }, true);

    document.addEventListener('pointercancel', event => {
      if (armedSavePointer === event.pointerId) armedSavePointer = null;
    }, true);

    // iOS may synthesize a click after the pointer sequence, sometimes after the
    // visual viewport has resized and a different segmented button is under the
    // old finger coordinate. Suppress that ghost click: the pointerdown selection
    // above is already authoritative.
    document.addEventListener('click', event => {
      if (Date.now() < ignoreMealClickUntil && event.target.closest('#f-meal-kind-row .tt-btn,#f-meal-status-row .tt-btn')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (Date.now() - lastTouchSaveAt < 900 && event.target.closest('#modal-save-btn')) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  }

  window.restoreSnapshot = function () {
    if (typeof snapshotList === 'undefined' || !snapshotList.length) return;
    const previous = snapshotList[0];
    if (!previous || !previous.data) return;
    STATE = clone(previous.data);
    if (typeof render === 'function') render();
    if (typeof scheduleSave === 'function') scheduleSave();
    if (typeof showSnapshotBar === 'function') showSnapshotBar(false);
  };

  // "Travel Day" is an itinerary label, not a real destination/city tag.
  // Filter it before syncing the registry so bad presentation data is not stored.
  window.computeTripCities = function () {
    if (typeof STATE === 'undefined' || !STATE || !STATE.meta) return [];
    const m = STATE.meta;
    const seen = new Set();
    const out = [];
    [m.dest || (typeof dest !== 'undefined' ? dest : ''), ...STATE.days.map(d => (d.loc || '').trim())].forEach(c => {
      if (!c) return;
      const key = c.trim().toLowerCase();
      if (key === 'travel day') return;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(c.trim());
    });
    return out.slice(0, 8);
  };

  initializeFromLoadedRecord();
  installAtomicItemSave();
  installTouchStableModalControls();
})();
