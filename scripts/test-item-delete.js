#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('new-trip-v2.html', 'utf8');
const start = html.indexOf('async function deleteItineraryItemServer(');
const end = html.indexOf('// ── ADD / EDIT MODAL', start);
if (start < 0 || end < 0) throw new Error('Could not locate item deletion functions in template');
const fnSource = html.slice(start, end);

function makeContext({ saveOk = true } = {}) {
  const calls = { closeDrawer: 0, closeModal: 0, render: 0, alert: 0, saves: 0 };
  const ctx = {
    STATE: { days: [{ items: [] }] },
    drawerItem: null,
    RECORD_ID: 'test-trip',
    confirm: () => true,
    alert: () => { calls.alert++; },
    closeDrawer: () => { calls.closeDrawer++; },
    closeModal: () => { calls.closeModal++; },
    closeQuickJourneyModal: () => {},
    render: () => { calls.render++; },
    syncRegistryCities: () => {},
    showSnapshotBar: () => {},
    takeSnapshot: () => {},
    setStatus: () => {},
    setTimeout: () => {},
    dbSave: async () => {
      calls.saves++;
      if (!saveOk) throw new Error('save failed');
      return { ok:true };
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
    const visit = { _id:'visit1', type:'attraction', title:'Palace', visitPeriods:['morning','afternoon','evening'] };
    const keep = { _id:'keep', type:'place', title:'Keep' };
    ctx.STATE.days[0].items = [keep,visit];
    ctx.drawerItem = { dayIdx:0, itemIdx:0, item:visit };
    let message;
    ctx.confirm = text => { message = text; return false; };
    await ctx.deleteCurrentItem();
    if (calls.saves || ctx.STATE.days[0].items.length !== 2) throw new Error('cancelled linked delete mutated data');
    if (!message.includes('all its period appearances')) throw new Error('linked delete must explain its scope');
    ctx.confirm = () => true;
    await ctx.deleteCurrentItem();
    if (ctx.STATE.days[0].items.length !== 1 || ctx.STATE.days[0].items[0]._id !== 'keep') throw new Error('linked delete removed wrong visit');
    ctx.drawerItem = { dayIdx:0, itemIdx:0, item:visit };
    await ctx.deleteCurrentItem();
    if (ctx.STATE.days[0].items.length !== 1) throw new Error('stale stable ID must not fall back to unrelated index');
  }
  {
    const { ctx, calls } = makeContext();
    const item = { _id:'a1', type:'place', title:'Cathedral', time:'10:00', period:'morning' };
    ctx.STATE.days[0].items = [item];
    ctx.drawerItem = { dayIdx:0, itemIdx:0, item };
    await ctx.deleteCurrentItem();
    if (calls.saves !== 1) throw new Error('activity delete did not persist the updated record');
    if (ctx.STATE.days[0].items.length !== 0) throw new Error('activity delete did not remove live item');
  }

  {
    const { ctx, calls } = makeContext();
    const transport = { _id:'t1', type:'move', title:'Guimaraes → Braga', transport:{ mode:'Coach' } };
    ctx.STATE.days[0].items = [{ type:'place', title:'Keep' }, transport];
    ctx.drawerItem = { dayIdx:0, itemIdx:0, item:transport };
    await ctx.deleteCurrentItem();
    if (calls.saves !== 1) throw new Error('transport delete did not save');
    if (ctx.STATE.days[0].items.some(it => it && it._id === 't1')) throw new Error('transport delete removed wrong item');
  }

  {
    const { ctx, calls } = makeContext({ saveOk:false });
    const item = { _id:'m1', type:'meal', title:'Dinner' };
    ctx.STATE.days[0].items = [item];
    ctx.drawerItem = { dayIdx:0, itemIdx:0, item };
    await ctx.deleteCurrentItem();
    if (calls.saves !== 1) throw new Error('failed delete did not attempt save');
    if (ctx.STATE.days[0].items.length !== 1 || ctx.STATE.days[0].items[0]._id !== 'm1') throw new Error('failed delete did not restore item');
    if (calls.alert !== 1) throw new Error('failed delete did not notify user');
  }

  console.log('item deletion behavior: ok');
})().catch(err => {
  console.error('item deletion behavior failed:', err.message);
  process.exit(1);
});
