const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('holidays/holiday-v2.js', 'utf8');

function runtime(storage, remote = null) {
  const localStorage = {
    getItem:key => storage.has(key) ? storage.get(key) : null,
    setItem:(key, value) => storage.set(key, String(value))
  };
  const document = { querySelectorAll:() => [] };
  const context = { console, document, localStorage, setTimeout, clearTimeout, Date, Math };
  context.window = context;
  context.dbLoad = async id => {
    if (remote && remote.__records) return remote.__records[id] ?? null;
    return remote;
  };
  context.dbSave = async () => ({ ok:true });
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.HolidayV2;
}

(async () => {
  const storage = new Map();
  storage.set('holiday-allowance-2026-27-v1', JSON.stringify([
    { dest:'Migration check', start:'12/06/2026', end:'18/06/2026', ret:'19/06/2026', days:4, lieu:1, hol:3, notes:'preserve me' }
  ]));
  storage.set('holiday-allowance-2027-28-v1', JSON.stringify([
    { dest:'Next year', start:'04/05/2027', end:'06/05/2027', ret:'07/05/2027', days:2, lieu:0, hol:2, notes:'' }
  ]));

  const app = runtime(storage);
  await app.load();
  assert.equal(app.getState().joel['2026-27'][0].dest, 'Migration check');
  assert.equal(app.getState().joel['2027-28'][0].dest, 'Next year');
  assert(storage.has('holiday-allowance-2026-27-v1'), 'legacy records must remain untouched');

  const repairStorage = new Map();
  repairStorage.set('holiday-allowance-2026-27-v1', JSON.stringify([
    { dest:'Recovered legacy trip', start:'01/08/2026', end:'03/08/2026', ret:'04/08/2026', days:2, lieu:0, hol:2, notes:'recover this' }
  ]));
  const emptyRemote = {
    version:2,
    updatedAt:'2099-01-01T00:00:00.000Z',
    joel:{ '2026-27':[], '2027-28':[] },
    jon:{ '2026':[], '2027':[] }
  };
  const repairedApp = runtime(repairStorage, emptyRemote);
  await repairedApp.load();
  assert.equal(repairedApp.getState().joel['2026-27'][0].dest, 'Recovered legacy trip', 'empty V2 must recover legacy Joel trips');
  assert.equal(repairedApp.getState().joel['2027-28'][0].dest, 'Hong Kong & Taiwan', 'empty V2 must recover known defaults when no legacy copy exists');

  const richLegacyStorage = new Map();
  richLegacyStorage.set('holiday-allowance-2027-28-v1', JSON.stringify([
    { dest:'Hong Kong & Taiwan', start:'27/03/2027', end:'11/04/2027', ret:'12/04/2027', days:4, lieu:0, hol:4, notes:'continued' },
    { dest:'Recovered summer trip', start:'10/07/2027', end:'18/07/2027', ret:'19/07/2027', days:5, lieu:1, hol:4, notes:'device copy' },
    { dest:'Recovered autumn trip', start:'02/10/2027', end:'06/10/2027', ret:'07/10/2027', days:3, lieu:0, hol:3, notes:'' }
  ]));
  const baselineRemote = {
    version:2,
    updatedAt:'2099-01-01T00:00:00.000Z',
    joel:{
      '2026-27':[],
      '2027-28':[
        { id:'baseline-2027', period:'2027-28', dest:'Hong Kong & Taiwan', start:'27/03/2027', end:'11/04/2027', ret:'12/04/2027', days:0, lieu:0, hol:0, notes:'Continued from 2026/27 — holiday days TBC' }
      ]
    },
    jon:{ '2026':[], '2027':[] }
  };
  const richRecoveryApp = runtime(richLegacyStorage, baselineRemote);
  await richRecoveryApp.load();
  assert.equal(richRecoveryApp.getState().joel['2027-28'].length, 3, 'baseline-only V2 must recover richer 2027/28 device data');
  assert.equal(richRecoveryApp.getState().joel['2027-28'][1].dest, 'Recovered summer trip');
  assert.equal(richRecoveryApp.getState().joel['2027-28'][2].dest, 'Recovered autumn trip');

  const genuineRemoteStorage = new Map();
  genuineRemoteStorage.set('holiday-allowance-2027-28-v1', JSON.stringify([
    { dest:'Stale local trip', start:'01/05/2027', end:'02/05/2027', ret:'03/05/2027', days:1, lieu:0, hol:1, notes:'' }
  ]));
  const genuineRemote = {
    version:2,
    updatedAt:'2099-01-01T00:00:00.000Z',
    joel:{
      '2026-27':[],
      '2027-28':[
        { id:'baseline-2027-fresh', period:'2027-28', dest:'Hong Kong & Taiwan', start:'27/03/2027', end:'11/04/2027', ret:'12/04/2027', days:0, lieu:0, hol:0, notes:'Continued from 2026/27 — holiday days TBC' },
        { id:'real-trip', period:'2027-28', dest:'Current server trip', start:'12/08/2027', end:'16/08/2027', ret:'17/08/2027', days:3, lieu:0, hol:3, notes:'' }
      ]
    },
    jon:{ '2026':[], '2027':[] }
  };
  const genuineApp = runtime(genuineRemoteStorage, genuineRemote);
  await genuineApp.load();
  assert.equal(genuineApp.getState().joel['2027-28'].length, 3, 'genuine server data must be preserved while missing legacy trips are merged back');
  assert.equal(genuineApp.getState().joel['2027-28'][1].dest, 'Current server trip');
  assert.equal(genuineApp.getState().joel['2027-28'][2].dest, 'Stale local trip', 'legacy-only trip should be recovered without replacing server trips');

  const registryRecoveryStorage = new Map();
  const registryRecoveryRemote = {
    __records: {
      'holiday-allowance-v2': {
        version:2,
        updatedAt:'2099-01-01T00:00:00.000Z',
        joel:{
          '2026-27':[],
          '2027-28':[
            { id:'hk-existing', period:'2027-28', dest:'Hong Kong & Taiwan', start:'27/03/2027', end:'11/04/2027', ret:'12/04/2027', days:'', lieu:'', hol:'', notes:'' }
          ]
        },
        jon:{ '2026':[], '2027':[] }
      },
      'trip-registry': {
        trips:[
          { slug:'hk-taiwan-2027', dest:'Hong Kong & Taiwan', dep:'27/03/2027', ret:'12/04/2027', status:'planning' },
          { slug:'graz-ljubljana-lake-bled-2027', dest:'Graz, Ljubljana & Lake Bled', dep:'28/05/2027', ret:'02/06/2027', status:'planning' },
          { slug:'canada-2027', dest:'Canada Road Trip', dep:'25/09/2027', ret:'10/10/2027', status:'upcoming' },
          { slug:'old-trip', dest:'Old Trip', dep:'01/02/2027', ret:'05/02/2027', status:'past' }
        ]
      }
    }
  };
  const registryRecoveryApp = runtime(registryRecoveryStorage, registryRecoveryRemote);
  await registryRecoveryApp.load();
  const recovered2027 = registryRecoveryApp.getState().joel['2027-28'];
  assert.equal(recovered2027.length, 3, '2027/28 should recover missing overlapping trips from trip-registry without duplicating Hong Kong & Taiwan');
  assert.equal(recovered2027[1].dest, 'Graz, Ljubljana & Lake Bled');
  assert.equal(recovered2027[1].end, '01/06/2027');
  assert.equal(recovered2027[2].dest, 'Canada Road Trip');
  assert.equal(recovered2027[2].end, '09/10/2027');
  assert.equal(recovered2027[2].hol, '', 'recovery must not invent holiday-day calculations');

  const joel = app.getState().joel['2026-27'][0];
  const sent = app.sendToJon('2026-27', joel.id);
  assert.equal(sent.status, 'pending');
  assert.equal(sent.hol, '', 'Joel allowance must not be copied');
  assert.equal(app.sendToJon('2026-27', joel.id).id, sent.id, 'duplicate sends must return the existing link');
  assert.equal(app.getState().jon['2026'].length, 1);
  assert.equal(app.totals(app.getState().jon['2026'], 24).hol, 0, 'pending trips must not affect totals');

  app.updateJon('2026', sent.id, { days:4, hol:2, workPattern:'My own calculation' }, true);
  assert.equal(sent.status, 'accepted');
  assert.equal(app.totals(app.getState().jon['2026'], 24).remaining, 22);

  app.updateJoelTrip('2026-27', joel.id, { end:'20/06/2026' });
  assert.equal(sent.status, 'update_available');
  assert.equal(sent.hol, 2, 'Joel edits must not overwrite Jonathan allowance fields');
  app.applySourceUpdate('2026', sent.id);
  assert.equal(sent.end, '20/06/2026');
  assert.equal(sent.hol, 2);
  assert.equal(sent.status, 'accepted');

  app.deleteJoelTrip('2026-27', joel.id);
  assert.equal(sent.sourceStatus, 'cancelled');
  assert.equal(app.getState().jon['2026'][0].id, sent.id, 'Joel deletion must preserve Jonathan copy');
  assert.equal(app.totals(app.getState().jon['2026'], 24).remaining, 22);

  const own = app.addJon('2026');
  app.updateJon('2026', own.id, { dest:'Jonathan only', hol:1 }, true);
  assert.equal(app.totals(app.getState().jon['2026'], 24).remaining, 21);
  app.deleteJon('2026', own.id);
  assert.equal(app.getState().jon['2026'].length, 1);

  await app.persistNow();
  const refreshed = runtime(storage);
  await refreshed.load();
  assert.equal(refreshed.getState().jon['2026'][0].sourceStatus, 'cancelled');
  assert.equal(refreshed.getState().jon['2026'][0].hol, 2);

  const next = refreshed.getState().joel['2027-28'][0];
  const nextSent = refreshed.sendToJon('2027-28', next.id);
  assert.equal(nextSent.status, 'pending');
  assert.equal(refreshed.getState().jon['2027'].length, 1);

  console.log('PASS: migration, empty-V2 recovery, 2027/28 merge recovery, trip-registry recovery, server-data preservation, add/edit/delete, share, duplicate prevention, independent review, update, cancellation, refresh, both years');
})().catch(error => { console.error(error); process.exit(1); });

