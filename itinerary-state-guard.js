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

    // Existing record: use the exact server response, even if loadData() has not
    // yet assigned it to STATE. New record: null means the default STATE is the
    // correct baseline for its first save.
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
    if (initialized || typeof RECORD_ID === 'undefined') return;
    if (!event.detail || event.detail.id !== RECORD_ID) return;
    const serverState = event.detail.data;
    lastPersistedState = serverState == null ? clone(STATE) : clone(serverState);
    initialized = true;
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
    // Never establish an undo baseline from temporary template/default data.
    // A user can edit very quickly after the page becomes interactive. Previously
    // this wrapper simply returned if the initial dbLoad had not populated the
    // safety baseline yet, leaving the toolbar permanently saying "Saving…" and
    // dropping that scheduled save. Wait briefly for the authoritative load instead.
    if (!initializeFromLoadedRecord()) {
      const ready = await waitForLoadedRecord();
      if (!ready) {
        if (typeof setStatus === 'function') setStatus('error', '✕ Save paused — reload');
        console.error('Save paused: authoritative itinerary state did not finish loading');
        return;
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
    } catch (e) {
      if (typeof setStatus === 'function') {
        const conflict = e && e.status === 409;
        setStatus('error', conflict ? '✕ Newer version exists — reload' : '✕ Save failed');
      }
      console.error('Save failed', e);
    }
  };

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

  // If dbLoad completed before this script was injected, initialize immediately.
  // Otherwise the record-loaded event above supplies the authoritative baseline.
  initializeFromLoadedRecord();
})();
