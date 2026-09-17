// Holiday records use the same authenticated, version-checked store as trips.
(function () {
  'use strict';
  const fields = ['dest', 'start', 'end', 'ret', 'days', 'lieu', 'hol', 'notes'];
  let ready = false, loading = false, dirty = false, saving = false, conflict = false;
  let revision = 0, timer, config, status, retry;

  function validTrips(value) {
    return Array.isArray(value) && value.every(t => t && typeof t === 'object' &&
      fields.every(key => t[key] == null || ['string', 'number'].includes(typeof t[key])));
  }

  async function loadYear(year, defaults) {
    const saved = await dbLoad('holiday-allowance-' + year);
    if (saved === null) return { trips: defaults, exists: false };
    if (!saved || !validTrips(saved.trips)) throw new Error('Invalid saved holiday data');
    return { trips: saved.trips, exists: true };
  }

  function message(text, canRetry = false) {
    status.textContent = text;
    retry.hidden = !canRetry;
  }

  function lock(locked) {
    document.querySelectorAll('#cards input, #cards button, .nav-actions button:not(.print-btn)')
      .forEach(el => { el.disabled = locked; });
  }

  function collect() {
    return Array.from(document.querySelectorAll('.trip-card')).map(card => {
      const inputs = card.querySelectorAll('input');
      return Object.fromEntries(fields.map((key, index) => [key, inputs[index].value]));
    });
  }

  async function save() {
    clearTimeout(timer);
    if (!ready || !dirty || saving || conflict) return;
    saving = true;
    const currentRevision = revision;
    message('Saving…');
    try {
      await dbSave('holiday-allowance-' + config.year, { trips: collect() });
      if (revision === currentRevision) {
        dirty = false;
        message('Saved');
      }
    } catch (error) {
      conflict = error.status === 409;
      message(conflict
        ? 'Not saved: this year changed in another tab or device. Copy your edits, then reload.'
        : 'Changes not saved. Keep this page open and retry.', !conflict);
      saving = false;
      return;
    }
    saving = false;
    if (dirty) void save();
  }

  function changed() {
    if (!ready) return;
    dirty = true;
    revision++;
    if (conflict) return;
    message('Unsaved changes…');
    clearTimeout(timer);
    timer = setTimeout(save, 350);
  }

  async function start() {
    if (ready || loading || window._mytripsAuthed !== true) return;
    loading = true;
    message('Loading saved allowance…');
    try {
      const result = await loadYear(config.year, config.defaults);
      let rows = result.trips;
      let migrate = false;
      // Preserve the existing 2026/27 browser-only edits on first server save.
      // Once a server record exists it is authoritative across devices.
      if (!result.exists && config.legacyKey) {
        try {
          const local = JSON.parse(localStorage.getItem(config.legacyKey) || 'null');
          if (validTrips(local)) { rows = local; migrate = true; }
        } catch { /* Browser storage may be unavailable. */ }
      }
      document.querySelectorAll('.trip-card').forEach(card => card.remove());
      rows.forEach(config.addTrip);
      config.recalc();
      ready = true;
      lock(false);
      message('Changes save automatically');
      if (migrate) changed();
    } catch {
      message('Could not load saved allowance. Retry before editing.', true);
    } finally {
      loading = false;
    }
  }

  function init(options) {
    config = options;
    const bar = document.createElement('div');
    bar.className = 'holiday-save-status';
    status = document.createElement('span');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Retry';
    retry.hidden = true;
    retry.addEventListener('click', () => { void (ready ? save() : start()); });
    bar.append(status, retry);
    document.getElementById('cards').before(bar);
    lock(true);
    message('Sign in to load your saved allowance');
    document.addEventListener('mytrips:authed', () => {
      if (!ready) void start();
      else if (dirty) void save();
    });
    window.addEventListener('online', () => { void (ready ? save() : start()); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void save();
    });
    window.addEventListener('beforeunload', event => {
      if (dirty) { event.preventDefault(); event.returnValue = ''; }
    });
    void start();
  }

  window.HolidayAllowance = { init, changed, loadYear };
})();
