const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'holidays/holiday-save.js'), 'utf8');
const fields = ['dest', 'start', 'end', 'ret', 'days', 'lieu', 'hol', 'notes'];
const seed = { dest: 'Test trip', start: '01/05/2027', end: '', ret: '', days: 2, lieu: 0, hol: 1.5, notes: '' };
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture({ saved = null, legacy = null, authed = true } = {}) {
  const events = {}, elements = [], writes = [], timers = new Map();
  let rows = [], timerId = 0, loadError, saveError, pending;
  function el() { const value = { disabled: false, hidden: false, textContent: '', setAttribute() {}, append() {}, before() {}, addEventListener(name, fn) { this[name] = fn; } }; elements.push(value); return value; }
  const cards = el(), control = el();
  const document = { visibilityState: 'visible', createElement: el, getElementById: () => cards,
    addEventListener(name, fn) { events[name] = fn; },
    querySelectorAll(selector) {
      if (selector !== '.trip-card') return [control];
      return rows.map(row => ({ querySelectorAll: () => fields.map(key => ({ value: String(row[key] ?? '') })), remove() { rows = rows.filter(t => t !== row); } }));
    } };
  const context = { document, console, localStorage: { getItem: () => legacy === null ? null : JSON.stringify(legacy) },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
    async dbLoad() { if (loadError) throw loadError; return saved; },
    async dbSave(id, data) { writes.push({ id, data }); if (pending) await pending; if (saveError) throw saveError; saved = JSON.parse(JSON.stringify(data)); return { version: 'v' }; }
  };
  context.window = { _mytripsAuthed: authed, addEventListener(name, fn) { events[name] = fn; } };
  vm.runInNewContext(source, context);
  const app = context.window.HolidayAllowance;
  const options = { year: '2027-28', defaults: [seed], legacyKey: 'old', addTrip(row) { rows.push({ ...row }); app.changed(); }, recalc() { app.changed(); } };
  return { app, writes, events, control, context,
    init() { app.init(options); },
    get rows() { return rows; }, get status() { return elements[3].textContent; },
    change(key, value) { rows[0][key] = value; app.changed(); },
    removeAll() { rows = []; app.changed(); },
    async flush() { for (const fn of [...timers.values()]) fn(); timers.clear(); await tick(); },
    retry() { elements[4].click(); },
    failLoad(error) { loadError = error; }, failSave(error) { saveError = error; },
    holdSave(promise) { pending = promise; }, get saved() { return saved; }
  };
}

(async () => {
  let f = fixture(); f.init(); await tick();
  assert.equal(f.writes.length, 0, 'initial defaults must not overwrite storage');
  f.change('notes', 'Remember this'); f.change('hol', '2.5'); await f.flush();
  assert.equal(f.saved.trips[0].notes, 'Remember this');
  assert.equal(f.saved.trips[0].hol, '2.5'); assert.equal(f.status, 'Saved');
  const reopened = fixture({ saved: f.saved }); reopened.init(); await tick();
  assert.equal(reopened.rows[0].notes, 'Remember this', 'reload restores edits');
  reopened.removeAll(); await reopened.flush();
  const empty = fixture({ saved: reopened.saved }); empty.init(); await tick();
  assert.equal(empty.rows.length, 0, 'deleting final trip stays empty');

  f = fixture({ legacy: [{ ...seed, notes: 'Old browser edits' }] }); f.init(); await tick(); await f.flush();
  assert.equal(f.saved.trips[0].notes, 'Old browser edits');
  f = fixture({ saved: { trips: [seed] }, legacy: [{ ...seed, notes: 'Stale local' }] }); f.init(); await tick();
  assert.equal(f.rows[0].notes, '', 'server record wins over old local cache');

  f = fixture(); f.failLoad(new Error('offline')); f.init(); await tick();
  assert.equal(f.control.disabled, true); assert.match(f.status, /Could not load/);
  f.failLoad(null); f.retry(); await tick(); assert.equal(f.control.disabled, false);
  f.failSave(new Error('offline')); f.change('dest', 'Unsaved trip'); await f.flush();
  assert.match(f.status, /not saved/); assert.equal(f.rows[0].dest, 'Unsaved trip');
  f.failSave(null); f.retry(); await tick(); assert.equal(f.status, 'Saved');

  f.failSave(Object.assign(new Error('conflict'), { status: 409 })); f.change('notes', 'Conflict'); await f.flush();
  const count = f.writes.length; f.change('notes', 'Still here'); await f.flush();
  assert.equal(f.writes.length, count, 'conflict cannot silently overwrite remote data');
  assert.match(f.status, /another tab/);

  f = fixture(); f.init(); await tick(); let release;
  f.holdSave(new Promise(resolve => { release = resolve; })); f.change('notes', 'First'); await f.flush();
  f.change('notes', 'Newest'); await f.flush(); release(); await tick(); await tick();
  assert.equal(f.saved.trips[0].notes, 'Newest'); assert.equal(f.status, 'Saved');

  f = fixture({ authed: false }); f.init(); await tick(); assert.equal(f.rows.length, 0);
  f.context.window._mytripsAuthed = true; f.events['mytrips:authed'](); await tick(); assert.equal(f.rows.length, 1);
  for (const file of ['2025-26.html','2026-27.html','2027-28.html','jonathan/2026.html','jonathan/2027.html']) {
    const html = fs.readFileSync(path.join(root, 'holidays', file), 'utf8');
    for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
    assert.ok(html.includes('/holidays/holiday-save.js?v=1'));
  }
  console.log('PASS: persistence, reload, empty year, migration, load/save failures, retry, conflict, in-flight edits, authentication, and all holiday page syntax');
})().catch(error => { console.error(error); process.exitCode = 1; });
