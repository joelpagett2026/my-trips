// ══════════════════════════════════════════════════════════════════════
//  MY TRIPS — Database client (replaces Supabase)
// ══════════════════════════════════════════════════════════════════════

const API = '/api.php';
const RECORD_API = '/record.php';

function getStoredAuth() {
    try { return JSON.parse(localStorage.getItem('jh_auth') || 'null') || {}; }
    catch { return {}; }
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

// Version observed when each record was last loaded/saved in this browser.
// A null value means "loaded and did not exist"; absence means "not observed yet".
const _recordVersions = new Map();
const _dbSaveQueues = new Map();

// Keep the exact server state returned by dbLoad available to safety layers that
// load after the itinerary's asynchronous request has already started. This
// avoids mistaking the template's temporary/default STATE for persisted data.
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

/** Load an itinerary record by ID. Returns null if not found. */
async function dbLoad(id) {
    const result = await recordCall('load', { id });
    if (!result) {
        _recordVersions.set(id, null);
        noteRecordLoaded(id, null);
        return null;
    }
    _recordVersions.set(id, result.version || null);
    noteRecordLoaded(id, result.data);
    return result.data;
}

/** Save a record, serialized locally and rejected server-side if another tab/device changed it first. */
function dbSave(id, data, options = {}) {
    const previous = _dbSaveQueues.get(id) || Promise.resolve();
    const snapshot = JSON.parse(JSON.stringify(data));
    const saveOptions = { ...options };
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') saveOptions.keepalive = true;

    const run = previous.catch(() => {}).then(async () => {
        // If this caller has never loaded the record, establish a baseline first.
        if (!_recordVersions.has(id)) await dbLoad(id);
        const expectedVersion = _recordVersions.get(id);
        try {
            const result = await recordCall('save', {}, {
                id,
                data: snapshot,
                expected_version: expectedVersion,
            }, saveOptions);
            _recordVersions.set(id, result?.version || null);
            return result;
        } catch (err) {
            if (err && err.status === 409 && typeof document !== 'undefined') {
                document.dispatchEvent(new CustomEvent('mytrips:save-conflict', { detail: { id } }));
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
    if (typeof window !== 'undefined' && window.__mytripsLoadedRecords instanceof Map) {
        window.__mytripsLoadedRecords.delete(id);
    }
    return result;
}

// Compatibility helper for older page code. The raw four-digit PIN is sent only
// to the same-origin HTTPS auth endpoint; the server performs the hash comparison.
async function dbVerifyPin(pin) {
    const res = await fetch('/auth-v2.php?action=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        body: JSON.stringify({ new_pin: newPin }),
    });
    const data = await parseJsonResponse(res);
    if (data?.session_token) {
        localStorage.setItem('jh_auth', JSON.stringify({
            sessionToken: data.session_token,
            ts: Date.now(),
        }));
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

// Explicitly publish the helpers used by rendered/legacy pages. Relying on classic
// script function-hoisting onto window is browser-sensitive and made dashboard
// failures indistinguishable from an empty registry because older page code catches
// lookup errors and returns an empty array.
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
