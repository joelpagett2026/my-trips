#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('new-trip-v2.html', 'utf8');
const start = html.indexOf('async function removeItineraryItem(');
const end = html.indexOf('// ── ADD / EDIT MODAL', start);
if (start < 0 || end < 0) throw new Error('Could not locate item deletion functions in template');
const fnSource = html.slice(start, end);

function makeContext({ saveFails = false } = {}) {
  const calls = { closeDrawer: 0, closeModal: 0, render: 0, save: 0, alert: 0, snapshot: 0 };
  const ctx = {
    STATE: { days: [{ items: [{ id: 'keep' }, { id: 'remove' }] }] },
    drawerItem: { dayIdx: 0, itemIdx: 1 },
    RECORD_ID: 'test-trip',
    confirm: () => true,
    alert: () => { calls.alert++; },
    takeSnapshot: () => { calls.snapshot++; throw new Error('simulated snapshot storage failure'); },
    closeDrawer: () => { calls.closeDrawer++; },
    closeModal: () => { calls.closeModal++; },
    render: () => { calls.render++; },
    setStatus: () => {},
    dbSave: async (_id, state) => {
      calls.save++;
      if (saveFails) throw new Error('simulated save failure');
      calls.savedIds = state.days[0].items.map(x => x.id);
    },
    syncRegistryCities: () => {},
    showSnapshotBar: () => {},
    setTimeout: () => 0,
    getToken: () => 'test-token',
    URL,
    window: { location: { href: 'https://example.test/trip', replace: () => { calls.reloaded = true; } } },
    fetch: async (_url, options) => {
      calls.fetch = (calls.fetch || 0) + 1;
      calls.fetchBody = JSON.parse(options.body);
      return { ok: true, json: async () => ({ ok: true, data: { deleted: true } }) };
    },
    console
  };
  vm.createContext(ctx);
  vm.runInContext(fnSource, ctx);
  return { ctx, calls };
}

(async () => {
  {
    const { ctx, calls } = makeContext();
    await ctx.deleteCurrentItem();
    if (ctx.STATE.days[0].items.length !== 1 || ctx.STATE.days[0].items[0].id !== 'keep') {
      throw new Error('confirmed delete did not remove the selected item');
    }
    if (calls.closeDrawer !== 1 || calls.render < 1) {
      throw new Error('confirmed delete did not update the UI immediately');
    }
    if (calls.save !== 1 || JSON.stringify(calls.savedIds) !== JSON.stringify(['keep'])) {
      throw new Error('confirmed delete did not persist the updated state immediately');
    }
  }

  {
    const { ctx, calls } = makeContext({ saveFails: true });
    await ctx.deleteCurrentItem();
    const ids = ctx.STATE.days[0].items.map(x => x.id);
    if (JSON.stringify(ids) !== JSON.stringify(['keep', 'remove'])) {
      throw new Error('failed save did not restore the removed item');
    }
    if (calls.alert !== 1) {
      throw new Error('failed save did not notify the user');
    }
  }

  {
    const { ctx, calls } = makeContext();
    ctx.STATE.days[0].items = [
      { id: 'keep', type: 'place' },
      { id: 'transport', type: 'move', transport: { mode: 'Coach' } }
    ];
    await ctx.removeItineraryItem(0, 1, {
      label: 'transport item',
      confirmMessage: 'Remove this transport item from the itinerary?',
      closeDrawer: false,
      closeModal: false
    });
    const ids = ctx.STATE.days[0].items.map(x => x.id);
    if (JSON.stringify(ids) !== JSON.stringify(['keep'])) {
      throw new Error('transport item delete did not remove the selected transport row');
    }
    if (calls.save !== 1 || JSON.stringify(calls.savedIds) !== JSON.stringify(['keep'])) {
      throw new Error('transport item delete did not persist immediately');
    }
  }

  {
    const { ctx, calls } = makeContext();
    const transport = { id: 'transport', type: 'move', title: 'Guimaraes → Braga', transport: { mode: 'Coach' } };
    ctx.STATE.days[0].items = [
      { id: 'inserted', type: 'place', title: 'Inserted' },
      { id: 'keep', type: 'place', title: 'Keep' },
      transport
    ];
    // Simulate the drawer having opened before a re-render/reorder changed the
    // numeric position. The object reference must still win over the stale index.
    ctx.drawerItem = { dayIdx: 0, itemIdx: 1, item: transport };
    await ctx.deleteCurrentItem();
    const ids = ctx.STATE.days[0].items.map(x => x.id);
    if (JSON.stringify(ids) !== JSON.stringify(['inserted','keep'])) {
      throw new Error('drawer transport delete did not resolve by object identity');
    }
    if (calls.fetch !== 1 || calls.fetchBody?.fingerprint?.mode !== 'Coach') {
      throw new Error('drawer transport identity delete did not call atomic transport delete');
    }
    if (!calls.reloaded) {
      throw new Error('drawer transport identity delete did not reload after server deletion');
    }
  }

  console.log('item deletion behavior: ok');
})().catch(err => {
  console.error('item deletion behavior failed:', err.message);
  process.exit(1);
});
