#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('new-trip-v2.html', 'utf8');
const start = html.indexOf('async function deleteItineraryItemServer(');
const end = html.indexOf('// ── ADD / EDIT MODAL', start);
if (start < 0 || end < 0) throw new Error('Could not locate item deletion functions in template');
const fnSource = html.slice(start, end);

function makeContext({ responseOk = true } = {}) {
  const calls = { closeDrawer: 0, alert: 0, fetch: 0, reloaded: false };
  const ctx = {
    STATE: { days: [{ items: [] }] },
    drawerItem: null,
    RECORD_ID: 'test-trip',
    confirm: () => true,
    alert: () => { calls.alert++; },
    closeDrawer: () => { calls.closeDrawer++; },
    setStatus: () => {},
    getToken: () => 'test-token',
    Date,
    URL,
    window: {
      location: {
        href: 'https://example.test/trip',
        replace: () => { calls.reloaded = true; }
      }
    },
    fetch: async (url, options) => {
      calls.fetch++;
      calls.url = url;
      calls.body = JSON.parse(options.body);
      return {
        ok: responseOk,
        status: responseOk ? 200 : 500,
        json: async () => responseOk
          ? ({ ok: true, data: { deleted: true } })
          : ({ ok: false, error: 'Delete item failed' })
      };
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
    const item = { _id: 'a1', type: 'place', title: 'Cathedral', time: '10:00', period: 'morning' };
    ctx.STATE.days[0].items = [item];
    ctx.drawerItem = { dayIdx: 0, itemIdx: 0, item };

    await ctx.deleteCurrentItem();

    if (calls.fetch !== 1 || calls.url !== '/record.php?action=delete_item') {
      throw new Error('activity delete did not call atomic delete endpoint');
    }
    if (calls.body.item_id !== 'a1' || calls.body.item_index !== 0 || calls.body.fingerprint.type !== 'place') {
      throw new Error('activity delete sent the wrong target');
    }
    if (calls.closeDrawer !== 1 || !calls.reloaded) {
      throw new Error('activity delete did not close and reload after server success');
    }
  }

  {
    const { ctx, calls } = makeContext();
    const transport = {
      _id: 't1', type: 'move', title: 'Guimaraes → Braga', time: '14:00', period: 'afternoon',
      transport: { mode: 'Coach', from: 'Guimaraes', to: 'Braga' }
    };
    ctx.STATE.days[0].items = [{ type: 'place', title: 'Keep' }, transport];
    ctx.drawerItem = { dayIdx: 0, itemIdx: 0, item: transport };

    await ctx.deleteCurrentItem();

    if (calls.body.item_id !== 't1' || calls.body.item_index !== 1) {
      throw new Error('drawer delete did not resolve the live item index by identity');
    }
    if (calls.body.fingerprint.mode !== 'Coach' || calls.body.fingerprint.from !== 'Guimaraes') {
      throw new Error('transport delete fingerprint is incomplete');
    }
    if (!calls.reloaded) throw new Error('transport delete did not reload after server success');
  }

  {
    const { ctx, calls } = makeContext({ responseOk: false });
    const item = { _id: 'm1', type: 'meal', title: 'Dinner', time: '19:00', period: 'evening' };
    ctx.STATE.days[0].items = [item];
    ctx.drawerItem = { dayIdx: 0, itemIdx: 0, item };

    await ctx.deleteCurrentItem();

    if (calls.fetch !== 1) throw new Error('failed delete did not reach the server');
    if (calls.reloaded) throw new Error('failed delete must not reload');
    if (calls.alert !== 1) throw new Error('failed delete did not notify the user');
  }

  console.log('item deletion behavior: ok');
})().catch(err => {
  console.error('item deletion behavior failed:', err.message);
  process.exit(1);
});
