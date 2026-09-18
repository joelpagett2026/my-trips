(function () {
  'use strict';

  const LOCAL_KEY = 'holiday-allowance-v2';
  const RECORD_ID = 'holiday-allowance-v2';
  const JOEL_ALLOWANCE = 28;
  const JON_FLEXIBLE_ALLOWANCE = 24;
  const defaults = {
    '2026-27': [
      { dest:'China', start:'31/03/2026', end:'15/04/2026', ret:'17/04/2026', days:5, lieu:2, hol:10, notes:'One Lieu from March 6th, One from additional hours. Working 25/04' },
      { dest:'Porto', start:'29/08/2026', end:'06/09/2026', ret:'07/09/2026', days:4, lieu:1, hol:4, notes:'One Lieu from additional hours' },
      { dest:'Hamburg', start:'18/09/2026', end:'20/09/2026', ret:'21/09/2026', days:2, lieu:0, hol:2, notes:'' },
      { dest:'Gothenburg', start:'09/10/2026', end:'11/10/2026', ret:'12/10/2026', days:2, lieu:1, hol:0, notes:'One Lieu from additional hours' },
      { dest:'Cyprus', start:'23/12/2026', end:'30/12/2026', ret:'31/12/2026', days:2, lieu:1, hol:4, notes:'One Lieu from additional hours.' },
      { dest:'Hong Kong & Taiwan', start:'27/03/2027', end:'11/04/2027', ret:'12/04/2027', days:0, lieu:0, hol:3, notes:'3 Holiday Days from 2025/26 Allowance - Remainder 2027' }
    ],
    '2027-28': [
      { dest:'Hong Kong & Taiwan', start:'27/03/2027', end:'11/04/2027', ret:'12/04/2027', days:0, lieu:0, hol:0, notes:'Continued from 2026/27 — holiday days TBC' }
    ]
  };

  let state;
  let saveTimer;
  let needsRemoteRepair = false;

  const uid = prefix => prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  const number = value => Number.parseFloat(value) || 0;
  const sharedFields = trip => ({ dest:trip.dest || '', start:trip.start || '', end:trip.end || '', ret:trip.ret || '' });
  const sameShared = (a, b) => ['dest','start','end','ret'].every(key => String(a?.[key] || '') === String(b?.[key] || ''));
  const yearFromDate = date => /^\d{2}\/\d{2}\/(\d{4})$/.exec(date || '')?.[1] || '';

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
  }

  function writeLocal(value) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function normaliseJoel(trip, period) {
    return {
      id: trip.id || uid('joel'), period,
      dest: trip.dest || '', start: trip.start || '', end: trip.end || '', ret: trip.ret || '',
      days: trip.days ?? '', lieu: trip.lieu ?? '', hol: trip.hol ?? '', notes: trip.notes || '',
      createdAt: trip.createdAt || new Date().toISOString(), updatedAt: trip.updatedAt || new Date().toISOString()
    };
  }

  function migrate() {
    const joel = {};
    Object.keys(defaults).forEach(period => {
      const legacy = readJson('holiday-allowance-' + period + '-v1');
      const source = Array.isArray(legacy) ? legacy : defaults[period];
      joel[period] = source.map(trip => normaliseJoel(trip, period));
    });
    return { version:2, updatedAt:new Date().toISOString(), joel, jon:{ '2026':[], '2027':[] } };
  }

  function valid(candidate) {
    return candidate && candidate.version === 2 && candidate.joel && candidate.jon;
  }

  function recoveryTrips(period, alternate) {
    const alternateTrips = alternate?.joel?.[period];
    if (Array.isArray(alternateTrips) && alternateTrips.length) {
      return alternateTrips.map(trip => normaliseJoel(trip, period));
    }
    const legacy = readJson('holiday-allowance-' + period + '-v1');
    const source = Array.isArray(legacy) && legacy.length ? legacy : defaults[period];
    return source.map(trip => normaliseJoel(trip, period));
  }

  function normalise(candidate, alternate) {
    const next = valid(candidate) ? candidate : migrate();
    next.joel ||= {};
    next.jon ||= {};
    Object.keys(defaults).forEach(period => {
      if (!Array.isArray(next.joel[period]) || next.joel[period].length === 0) {
        next.joel[period] = recoveryTrips(period, alternate);
        needsRemoteRepair = true;
      } else {
        next.joel[period] = next.joel[period].map(t => normaliseJoel(t, period));
      }
    });
    ['2026','2027'].forEach(year => { if (!Array.isArray(next.jon[year])) next.jon[year] = []; });
    return next;
  }

  async function load() {
    needsRemoteRepair = false;
    const local = readJson(LOCAL_KEY);
    let remote = null;
    if (typeof window.dbLoad === 'function') {
      try { remote = await window.dbLoad(RECORD_ID); } catch (_) { /* local fallback remains available */ }
    }
    const localTime = Date.parse(local?.updatedAt || 0) || 0;
    const remoteTime = Date.parse(remote?.updatedAt || 0) || 0;
    const useRemote = remoteTime > localTime;
    state = normalise(useRemote ? remote : local, useRemote ? local : remote);
    writeLocal(state);
    if (needsRemoteRepair && typeof window.dbSave === 'function') {
      try {
        state.updatedAt = new Date().toISOString();
        writeLocal(state);
        await window.dbSave(RECORD_ID, state);
      } catch (_) { /* repaired device copy remains usable */ }
    }
    return state;
  }

  function announce(kind, message) {
    document.querySelectorAll('[data-save-status]').forEach(el => {
      el.textContent = message;
      el.dataset.kind = kind;
    });
  }

  async function persistNow() {
    clearTimeout(saveTimer);
    state.updatedAt = new Date().toISOString();
    writeLocal(state);
    announce('saving', 'Saving…');
    if (typeof window.dbSave === 'function') {
      try {
        await window.dbSave(RECORD_ID, state);
        announce('saved', 'Saved');
        return;
      } catch (_) {
        announce('local', 'Saved on this device');
        return;
      }
    }
    announce('local', 'Saved on this device');
  }

  function persistSoon() {
    state.updatedAt = new Date().toISOString();
    writeLocal(state);
    announce('saving', 'Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistNow, 350);
  }

  function findJonBySource(sourceTripId) {
    for (const year of Object.keys(state.jon)) {
      const record = state.jon[year].find(item => item.sourceTripId === sourceTripId);
      if (record) return { record, year };
    }
    return null;
  }

  function moveJonRecord(record, fromYear, toYear) {
    if (!toYear || fromYear === toYear) return;
    state.jon[fromYear] = state.jon[fromYear].filter(item => item.id !== record.id);
    state.jon[toYear] ||= [];
    state.jon[toYear].push(record);
  }

  function updateJoelTrip(period, id, patch) {
    const trip = state.joel[period].find(item => item.id === id);
    if (!trip) return;
    Object.assign(trip, patch, { updatedAt:new Date().toISOString() });
    const linked = findJonBySource(id);
    if (linked && linked.record.sourceStatus !== 'cancelled' && !sameShared(linked.record.sourceSnapshot, trip)) {
      linked.record.status = 'update_available';
      linked.record.latestSource = sharedFields(trip);
      linked.record.sourceUpdatedAt = trip.updatedAt;
      const targetYear = yearFromDate(trip.start);
      if (targetYear) linked.record.suggestedYear = targetYear;
    }
    persistSoon();
  }

  function sendToJon(period, id) {
    const existing = findJonBySource(id);
    if (existing) return existing.record;
    const trip = state.joel[period].find(item => item.id === id);
    if (!trip) return null;
    const year = yearFromDate(trip.start);
    if (!year) throw new Error('Add a start date in dd/mm/yyyy format before sending.');
    state.jon[year] ||= [];
    const record = {
      id:uid('jon'), sourceTripId:id, sourcePeriod:period, sourceStatus:'active', status:'pending',
      sourceSnapshot:sharedFields(trip), latestSource:null, suggestedYear:null,
      dest:trip.dest, start:trip.start, end:trip.end, ret:trip.ret,
      days:'', hol:'', workPattern:'', notes:'',
      sentAt:new Date().toISOString(), reviewedAt:null, sourceUpdatedAt:trip.updatedAt
    };
    state.jon[year].push(record);
    persistNow();
    return record;
  }

  function deleteJoelTrip(period, id) {
    const linked = findJonBySource(id);
    if (linked) {
      linked.record.sourceStatus = 'cancelled';
      linked.record.status = linked.record.status === 'pending' ? 'cancelled' : linked.record.status;
      linked.record.cancelledAt = new Date().toISOString();
    }
    state.joel[period] = state.joel[period].filter(item => item.id !== id);
    persistNow();
  }

  function addJoelTrip(period) {
    const trip = normaliseJoel({}, period);
    state.joel[period].push(trip);
    persistNow();
    return trip;
  }

  function updateJon(year, id, patch, review) {
    const record = state.jon[year].find(item => item.id === id);
    if (!record) return;
    Object.assign(record, patch);
    if (review) {
      record.status = 'accepted';
      record.reviewedAt = new Date().toISOString();
    }
    persistSoon();
  }

  function applySourceUpdate(year, id) {
    const record = state.jon[year].find(item => item.id === id);
    if (!record || !record.latestSource) return;
    Object.assign(record, record.latestSource);
    record.sourceSnapshot = record.latestSource;
    record.latestSource = null;
    record.status = 'accepted';
    record.reviewedAt = new Date().toISOString();
    const targetYear = yearFromDate(record.start);
    record.suggestedYear = null;
    moveJonRecord(record, year, targetYear);
    persistNow();
  }

  function keepJonVersion(year, id) {
    const record = state.jon[year].find(item => item.id === id);
    if (!record) return;
    if (record.latestSource) record.sourceSnapshot = record.latestSource;
    record.latestSource = null;
    record.suggestedYear = null;
    record.status = 'accepted';
    record.reviewedAt = new Date().toISOString();
    persistNow();
  }

  function deleteJon(year, id) {
    state.jon[year] = state.jon[year].filter(item => item.id !== id);
    persistNow();
  }

  function addJon(year) {
    const record = { id:uid('jon'), sourceTripId:null, sourcePeriod:null, sourceStatus:'personal', status:'accepted', dest:'', start:'', end:'', ret:'', days:'', hol:'', workPattern:'', notes:'', reviewedAt:new Date().toISOString() };
    state.jon[year].push(record);
    persistNow();
    return record;
  }

  function totals(trips, allowance) {
    const included = trips.filter(item => item.status !== 'pending' && item.status !== 'cancelled');
    const days = included.reduce((sum, item) => sum + number(item.days), 0);
    const hol = included.reduce((sum, item) => sum + number(item.hol), 0);
    const lieu = included.reduce((sum, item) => sum + number(item.lieu), 0);
    return { days, hol, lieu, remaining:allowance - hol };
  }

  window.HolidayV2 = {
    load, getState:() => state, persistNow, findJonBySource, updateJoelTrip, sendToJon, deleteJoelTrip, addJoelTrip,
    updateJon, applySourceUpdate, keepJonVersion, deleteJon, addJon, totals,
    JOEL_ALLOWANCE, JON_FLEXIBLE_ALLOWANCE
  };
})();

