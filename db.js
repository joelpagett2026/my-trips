// ══════════════════════════════════════════════════════════════════════
//  MY TRIPS — Database client (replaces Supabase)
// ══════════════════════════════════════════════════════════════════════

const API = '/api.php';
const RECORD_API = '/record.php';
const RECORD_REQUEST_TIMEOUT_MS = 20000;

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

    const { timeoutMs = RECORD_REQUEST_TIMEOUT_MS, ...requestOptions } = fetchOptions || {};
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const suppliedSignal = requestOptions.signal;
    if (controller && !suppliedSignal) requestOptions.signal = controller.signal;

    const options = {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        ...requestOptions,
    };
    if (body) options.body = JSON.stringify(body);

    let timeout = null;
    if (controller && !suppliedSignal && Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0) {
        timeout = setTimeout(() => controller.abort(), Number(timeoutMs));
    }

    try {
        return await parseJsonResponse(await fetch(url.toString(), options));
    } catch (err) {
        if (err && err.name === 'AbortError') {
            const timeoutError = new Error('The save request took too long. Please try again.');
            timeoutError.status = 408;
            throw timeoutError;
        }
        throw err;
    } finally {
        if (timeout) clearTimeout(timeout);
    }
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

function dbAdoptRecord(id, data, version) {
    _recordVersions.set(id, version || null);
    _recordConflicts.delete(id);
    noteRecordLoaded(id, data);
    return data;
}

// All writes for a record — whole-document autosaves and explicit item saves —
// must pass through the same queue. Previously dbSave() was queued but
// dbUpsertItineraryItem() bypassed that queue, so an older autosave could race a
// modal Save and leave the browser/server disagreeing about which state won.
function queueRecordWrite(id, operation) {
    const previous = _dbSaveQueues.get(id) || Promise.resolve();
    const run = previous.catch(() => {}).then(operation);
    _dbSaveQueues.set(id, run);
    const cleanup = () => { if (_dbSaveQueues.get(id) === run) _dbSaveQueues.delete(id); };
    run.then(cleanup, cleanup);
    return run;
}

function dbSave(id, data, options = {}) {
    const snapshot = JSON.parse(JSON.stringify(data));
    const saveOptions = { ...options };
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') saveOptions.keepalive = true;

    return queueRecordWrite(id, async () => {
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
}

function cloneRecordValue(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function ensureStableItemId(item, originalItem = null) {
    const next = cloneRecordValue(item) || {};
    const originalId = String(originalItem?._id || '').trim();
    if (originalId) {
        // Editing must retain the same stable identity. Older UI code rebuilt the
        // object and could accidentally assign a new ID on every edit.
        next._id = originalId;
    } else if (!String(next._id || '').trim()) {
        next._id = (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
            ? globalThis.crypto.randomUUID()
            : 'item-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    }
    return next;
}

function itemExistsInRecord(data, dayIndex, item) {
    const items = data?.days?.[Number(dayIndex)]?.items;
    if (!Array.isArray(items) || !item) return false;
    const id = String(item._id || '').trim();
    if (id) return items.some(candidate => candidate && String(candidate._id || '') === id);
    return items.some(candidate => JSON.stringify(candidate) === JSON.stringify(item));
}

function isTransientRecordError(err) {
    const status = Number(err?.status || 0);
    return !status || status === 408 || status === 425 || status === 429 || status >= 500;
}

// Explicit Add/Edit modal saves use an item-level transaction. This is deliberately
// separate from whole-record autosave: an unrelated change from another tab must
// not make a newly added meal/activity disappear, while an edit of the same item
// is still rejected if that item changed on the server.
function dbUpsertItineraryItem(id, dayIndex, itemIndex, item, originalItem = null) {
    const originalSnapshot = cloneRecordValue(originalItem);
    const itemSnapshot = ensureStableItemId(item, originalSnapshot);
    const numericDay = Number(dayIndex);
    const numericIndex = Number(itemIndex);

    return queueRecordWrite(id, async () => {
        let result;
        let firstError = null;

        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                result = await recordCall('upsert_item', {}, {
                    id,
                    day_index: numericDay,
                    item_index: numericIndex,
                    item: itemSnapshot,
                    original_item: originalSnapshot,
                });
                break;
            } catch (err) {
                if (attempt === 0 && isTransientRecordError(err)) {
                    firstError = err;
                    await new Promise(resolve => setTimeout(resolve, 250));
                    continue;
                }

                // A response can be lost after the server has already committed.
                // For an edit, retrying then correctly produces 409 because the
                // original item no longer matches. Reload once and accept the save
                // only if the stable item ID proves that the intended item exists.
                if (attempt === 1 && firstError && err?.status === 409) {
                    const authoritative = await dbLoad(id);
                    if (itemExistsInRecord(authoritative, numericDay, itemSnapshot)) {
                        return {
                            id,
                            saved: true,
                            recovered: true,
                            data: authoritative,
                            version: _recordVersions.get(id) || null,
                        };
                    }
                }
                throw err;
            }
        }

        if (!result || !result.data || !result.version) {
            throw new Error('The server did not confirm the itinerary item save.');
        }
        if (!itemExistsInRecord(result.data, numericDay, itemSnapshot)) {
            throw new Error('The server response did not contain the saved itinerary item.');
        }

        dbAdoptRecord(id, result.data, result.version);
        return result;
    });
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
        dbAdoptRecord,
        dbUpsertItineraryItem,
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
