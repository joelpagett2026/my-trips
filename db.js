// ══════════════════════════════════════════════════════════════════════
//  MY TRIPS — Database client (replaces Supabase)
// ══════════════════════════════════════════════════════════════════════

const API = '/api.php';
const RECORD_API = '/record.php';

function getStoredAuth() {
    try {
        const raw = localStorage.getItem('jh_auth') || sessionStorage.getItem('jh_auth') || 'null';
        return JSON.parse(raw) || {};
    } catch { return {}; }
}

// All authenticated API calls use the random, expiring server session token.
// The PIN hash is never stored or transmitted as a bearer credential.
function getToken() {
    return getStoredAuth().sessionToken || '';
}

function getRecordToken() {
    return getToken();
}

async function waitForToken(maxMs = 8000) {
    const start = Date.now();
    let token = getToken();
    while (!token && Date.now() - start < maxMs) {
        await new Promise(r => setTimeout(r, 100));
        token = getToken();
    }
    return token;
}

function signalAuthExpired() {
    if (typeof document === 'undefined') return;
    document.dispatchEvent(new CustomEvent('mytrips:auth-expired'));
}

async function parseJsonResponse(res) {
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : {}; }
    catch {
        if (res.status === 401) signalAuthExpired();
        throw new Error(`Server returned an invalid response (${res.status})`);
    }
    if (!res.ok || json.ok === false) {
        if (res.status === 401) signalAuthExpired();
        const err = new Error(json.error || `Request failed (${res.status})`);
        err.status = res.status;
        err.data = json.data || null;
        throw err;
    }
    return json.data;
}

async function apiCall(action, params = {}, body = null, method = null, fetchOptions = {}) {
    const url = new URL(API, location.origin);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const token = action === 'share_load' ? '' : await waitForToken();
    const options = {
        method: method || (body ? 'POST' : 'GET'),
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        ...fetchOptions,
    };
    if (body) options.body = JSON.stringify(body);
    return parseJsonResponse(await fetch(url.toString(), options));
}

async function recordCall(action, params = {}, body = null, fetchOptions = {}) {
    const url = new URL(RECORD_API, location.origin);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const token = await waitForToken();
    const options = {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        ...fetchOptions,
    };
    if (body) options.body = JSON.stringify(body);
    return parseJsonResponse(await fetch(url.toString(), options));
}

const _recordVersions = new Map();
const _dbSaveQueues = new Map();
const _recordConflicts = new Set();

if (typeof window !== 'undefined' && !(window.__mytripsLoadedRecords instanceof Map)) {
    window.__mytripsLoadedRecords = new Map();
}

function noteRecordLoaded(id, data) {
    if (typeof window === 'undefined') return;
    let snapshot = data;
    try { snapshot = data == null ? null : JSON.parse(JSON.stringify(data)); } catch {}
    window.__mytripsLoadedRecords.set(id, snapshot);
    if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('mytrips:record-loaded', { detail: { id, data: snapshot } }));
    }
}

function staleRecordError(id) {
    const err = new Error('A newer version exists. Reload before saving again.');
    err.status = 409;
    err.data = { id, reload_required: true };
    return err;
}

async function dbLoad(id) {
    const result = await recordCall('load', { id });
    if (!result) {
        _recordVersions.set(id, null);
        _recordConflicts.delete(id);
        noteRecordLoaded(id, null);
        return null;
    }
    _recordVersions.set(id, result.version || null);
    _recordConflicts.delete(id);
    noteRecordLoaded(id, result.data);
    return result.data;
}

function dbSave(id, data, options = {}) {
    const previous = _dbSaveQueues.get(id) || Promise.resolve();
    const snapshot = JSON.parse(JSON.stringify(data));
    const saveOptions = { ...options };
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') saveOptions.keepalive = true;

    const run = previous.catch(() => {}).then(async () => {
        if (!_recordVersions.has(id)) await dbLoad(id);

        // Once the server has rejected a stale write, do not keep sending queued
        // autosaves based on the same stale version. A deliberate dbLoad (normally
        // a page reload) clears this latch after observing the authoritative state.
        if (_recordConflicts.has(id)) throw staleRecordError(id);

        const expectedVersion = _recordVersions.get(id);
        try {
            const result = await recordCall('save', {}, {
                id,
                data: snapshot,
                expected_version: expectedVersion,
            }, saveOptions);
            _recordVersions.set(id, result?.version || null);
            _recordConflicts.delete(id);
            return result;
        } catch (err) {
            if (err && err.status === 409) {
                const firstConflict = !_recordConflicts.has(id);
                _recordConflicts.add(id);
                if (firstConflict && typeof document !== 'undefined') {
                    document.dispatchEvent(new CustomEvent('mytrips:save-conflict', { detail: { id } }));
                }
            }
            throw err;
        }
    });

    _dbSaveQueues.set(id, run);
    const cleanup = () => { if (_dbSaveQueues.get(id) === run) _dbSaveQueues.delete(id); };
    run.then(cleanup, cleanup);
    return run;
}

async function dbDelete(id) {
    const result = await apiCall('delete', { id }, null, 'DELETE');
    _recordVersions.delete(id);
    _recordConflicts.delete(id);
    if (typeof window !== 'undefined' && window.__mytripsLoadedRecords instanceof Map) {
        window.__mytripsLoadedRecords.delete(id);
    }
    return result;
}

async function dbVerifyPin(pin) {
    const res = await fetch('/auth-v2.php?action=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
        body: JSON.stringify({ pin }),
    });
    const data = await parseJsonResponse(res);
    return data?.session_token || null;
}

async function dbChangePin(newPin) {
    const token = await waitForToken();
    const res = await fetch('/auth-v2.php?action=change_pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        cache: 'no-store',
        credentials: 'same-origin',
        body: JSON.stringify({ new_pin: newPin }),
    });
    const data = await parseJsonResponse(res);
    if (data?.session_token) {
        const payload = JSON.stringify({ sessionToken: data.session_token, ts: Date.now() });
        try { localStorage.setItem('jh_auth', payload); } catch {}
        try { sessionStorage.setItem('jh_auth', payload); } catch {}
    }
    return data;
}

async function dbLoadRegistry() {
    const result = await dbLoad('trip-registry');
    return result ? (result.trips || []) : [];
}

async function dbSaveRegistry(trips) {
    return dbSave('trip-registry', { trips });
}

async function dbCreateShare(tripId) {
    const result = await apiCall('create_share', {}, { trip_id: tripId });
    return result ? result.token : null;
}
async function dbListShares(tripId) { return (await apiCall('list_shares', { trip_id: tripId })) || []; }
async function dbRevokeShare(token) { return apiCall('revoke_share', { token }, null, 'DELETE'); }
async function dbLoadShare(token) { return (await apiCall('share_load', { token })) || null; }

async function dbPlacesAutocomplete(input) {
    const result = await apiCall('places_autocomplete', { input });
    return result ? (result.predictions || []) : [];
}
async function dbPlaceDetails(placeId) {
    const result = await apiCall('places_details', { place_id: placeId });
    return result ? result.place : null;
}
async function dbComputeRoute(origin, destination, waypoints = []) {
    const result = await apiCall('routes_compute', {}, { origin, destination, waypoints });
    return result || null;
}

if (typeof window !== 'undefined') {
    Object.assign(window, {
        getToken,
        apiCall,
        dbLoad,
        dbSave,
        dbDelete,
        dbVerifyPin,
        dbChangePin,
        dbLoadRegistry,
        dbSaveRegistry,
        dbCreateShare,
        dbListShares,
        dbRevokeShare,
        dbLoadShare,
        dbPlacesAutocomplete,
        dbPlaceDetails,
        dbComputeRoute,
    });
}
