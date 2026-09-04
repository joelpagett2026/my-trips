#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

const dbSource = fs.readFileSync('db.js', 'utf8');

function makeResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  };
}

function tick() {
  return new Promise(resolve => setImmediate(resolve));
}

function makeContext(fetchImpl) {
  const storageValue = JSON.stringify({ sessionToken: 'test-session' });
  const document = {
    visibilityState: 'visible',
    dispatchEvent: () => {},
  };
  const window = { __mytripsLoadedRecords: new Map() };
  const ctx = {
    window,
    document,
    location: { origin: 'https://example.test' },
    localStorage: { getItem: () => storageValue, setItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    fetch: fetchImpl,
    URL,
    AbortController,
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
    setTimeout,
    clearTimeout,
    Date,
    Math,
    Map,
    Set,
    Promise,
    JSON,
    console,
    crypto: { randomUUID: () => 'generated-stable-id' },
  };
  vm.createContext(ctx);
  vm.runInContext(dbSource, ctx, { filename: 'db.js' });
  return ctx;
}

async function testAutosaveAndItemSaveAreSerialized() {
  const starts = [];
  let releaseSave = null;

  const ctx = makeContext(async (url, options) => {
    const action = new URL(url).searchParams.get('action');
    if (action === 'load') {
      return makeResponse(200, {
        ok: true,
        data: {
          data: { days: [{ items: [] }] },
          version: 'v0',
        },
      });
    }

    if (action === 'save') {
      starts.push('save');
      return new Promise(resolve => {
        releaseSave = () => resolve(makeResponse(200, {
          ok: true,
          data: { id: 'test-trip', version: 'v1' },
        }));
      });
    }

    if (action === 'upsert_item') {
      starts.push('upsert_item');
      const body = JSON.parse(options.body);
      return makeResponse(200, {
        ok: true,
        data: {
          id: 'test-trip',
          saved: true,
          saved_index: 0,
          data: { days: [{ items: [body.item] }] },
          version: 'v2',
        },
      });
    }

    throw new Error(`Unexpected action: ${action}`);
  });

  await ctx.window.dbLoad('test-trip');

  const autosave = ctx.window.dbSave('test-trip', { days: [{ items: [] }], meta: { note: 'pending autosave' } });
  for (let i = 0; i < 10 && !releaseSave; i++) await tick();
  if (!releaseSave) throw new Error('test autosave never reached the fake server');

  const itemSave = ctx.window.dbUpsertItineraryItem(
    'test-trip',
    0,
    0,
    { type: 'place', title: 'Teatro Colón', time: '', period: 'morning' },
    null
  );

  await tick();
  await tick();
  if (starts.includes('upsert_item')) {
    throw new Error('item save bypassed an in-flight autosave instead of waiting for the record write queue');
  }

  releaseSave();
  await autosave;
  const result = await itemSave;

  if (starts.join(',') !== 'save,upsert_item') {
    throw new Error(`record writes ran out of order: ${starts.join(',')}`);
  }
  const saved = result.data.days[0].items[0];
  if (saved.title !== 'Teatro Colón' || saved._id !== 'generated-stable-id') {
    throw new Error('new activity was not persisted with a stable id');
  }
}

async function testEditRetainsStableIdentity() {
  let sentItem = null;
  const original = {
    _id: 'existing-id',
    type: 'place',
    title: 'Old title',
    time: '10:00',
    period: 'morning',
  };

  const ctx = makeContext(async (url, options) => {
    const action = new URL(url).searchParams.get('action');
    if (action === 'load') {
      return makeResponse(200, {
        ok: true,
        data: { data: { days: [{ items: [original] }] }, version: 'v0' },
      });
    }
    if (action === 'upsert_item') {
      const body = JSON.parse(options.body);
      sentItem = body.item;
      return makeResponse(200, {
        ok: true,
        data: {
          id: 'test-trip',
          saved: true,
          saved_index: 0,
          data: { days: [{ items: [body.item] }] },
          version: 'v1',
        },
      });
    }
    throw new Error(`Unexpected action: ${action}`);
  });

  await ctx.window.dbLoad('test-trip');
  const result = await ctx.window.dbUpsertItineraryItem(
    'test-trip',
    0,
    0,
    { _id: 'accidental-new-id', type: 'place', title: 'Updated title', time: '11:00', period: 'morning' },
    original
  );

  if (!sentItem || sentItem._id !== 'existing-id') {
    throw new Error('editing an item changed its stable identity');
  }
  if (result.data.days[0].items[0]._id !== 'existing-id') {
    throw new Error('server-authoritative edited item did not retain its stable identity');
  }
}

async function testServerConfirmationMustContainItem() {
  const ctx = makeContext(async (url, options) => {
    const action = new URL(url).searchParams.get('action');
    if (action === 'load') {
      return makeResponse(200, {
        ok: true,
        data: { data: { days: [{ items: [] }] }, version: 'v0' },
      });
    }
    if (action === 'upsert_item') {
      return makeResponse(200, {
        ok: true,
        data: {
          id: 'test-trip',
          saved: true,
          saved_index: 0,
          data: { days: [{ items: [] }] },
          version: 'v1',
        },
      });
    }
    throw new Error(`Unexpected action: ${action}`);
  });

  await ctx.window.dbLoad('test-trip');
  let rejected = false;
  try {
    await ctx.window.dbUpsertItineraryItem(
      'test-trip',
      0,
      0,
      { type: 'place', title: 'Must be confirmed', time: '', period: 'morning' },
      null
    );
  } catch (err) {
    rejected = /did not contain the saved itinerary item/i.test(err.message);
  }
  if (!rejected) {
    throw new Error('client accepted a success response that did not actually contain the saved item');
  }
}

(async () => {
  await testAutosaveAndItemSaveAreSerialized();
  await testEditRetainsStableIdentity();
  await testServerConfirmationMustContainItem();
  console.log('item save transaction behavior: ok');
})().catch(err => {
  console.error('item save transaction behavior failed:', err.stack || err.message);
  process.exit(1);
});
