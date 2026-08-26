// ══════════════════════════════════════════════════════════════════════
//  MY TRIPS — Database client (replaces Supabase)
//  All pages include this instead of using localStorage for credentials.
// ══════════════════════════════════════════════════════════════════════

const API = '/api.php';

// The active auth token is stored after login and read from localStorage so
// it persists across pages. The server remains the authority on validity.
function getToken() {
    try {
        const s = JSON.parse(localStorage.getItem('jh_auth') || 'null');
        return s ? s.token : '';
    } catch { return ''; }
}

// Wait for a token to appear in localStorage before firing authenticated
// requests. Prevents a race where a page's initial data load fires before
// the login gate has finished storing the session token.
async function waitForToken(maxMs = 8000) {
    const start = Date.now();
    let token = getToken();
    while (!token && Date.now() - start < maxMs) {
        await new Promise(r => setTimeout(r, 100));
        token = getToken();
    }
    return token;
}

async function apiCall(action, params = {}, body = null, method = null, fetchOptions = {}) {
    const url = new URL(API, location.origin);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const token = (action === 'auth' || action === 'share_load') ? getToken() : await waitForToken();

    const options = {
        method: method || (body ? 'POST' : 'GET'),
        headers: {
            'Content-Type': 'application/json',
            'X-Auth-Token': token,
        },
        ...fetchOptions,
    };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(url.toString(), options);
    const text = await res.text();
    let json;
    try {
        json = text ? JSON.parse(text) : {};
    } catch {
        throw new Error(`Server returned an invalid response (${res.status})`);
    }

    if (!res.ok || json.ok === false) {
        const err = new Error(json.error || `Request failed (${res.status})`);
        err.status = res.status;
        throw err;
    }
    return json.data;
}

// ── PUBLIC API ────────────────────────────────────────────────────────

/** Load an itinerary record by ID. Returns null if not found. */
async function dbLoad(id) {
    const result = await apiCall('load', { id });
    return result ? result.data : null;
}

// Saves replace a whole itinerary JSON document, so overlapping requests for
// the same record must never be allowed to overtake one another. Keep a
// separate promise chain per record; a failed save is swallowed only for the
// purpose of keeping the queue alive, while the caller still receives the
// original rejection.
const _dbSaveQueues = new Map();

/** Save an itinerary record, serialized against any earlier save for that ID. */
function dbSave(id, data, options = {}) {
    const previous = _dbSaveQueues.get(id) || Promise.resolve();
    const snapshot = JSON.parse(JSON.stringify(data));
    const saveOptions = { ...options };
    // Browsers, especially iOS, may terminate ordinary fetches as soon as a
    // Home Screen app is backgrounded. The itinerary flushes pending edits on
    // visibilitychange/pagehide, so mark those final requests as keepalive.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        saveOptions.keepalive = true;
    }
    const run = previous
        .catch(() => {})
        .then(() => apiCall('save', {}, { id, data: snapshot }, null, saveOptions));

    _dbSaveQueues.set(id, run);
    const cleanup = () => {
        if (_dbSaveQueues.get(id) === run) _dbSaveQueues.delete(id);
    };
    run.then(cleanup, cleanup);
    return run;
}

/** Delete a record. */
async function dbDelete(id) {
    return apiCall('delete', { id }, null, 'DELETE');
}

/** Verify a PIN hash against the server. Returns token on success. */
async function dbVerifyPin(pinHash) {
    const result = await apiCall('auth', {}, { pin_hash: pinHash });
    return result ? result.token : null;
}

/** Change the PIN. Requires current and new hash. */
async function dbChangePin(currentHash, newHash) {
    return apiCall('auth', {}, { pin_hash: currentHash, new_hash: newHash });
}

/** Load the trip registry. */
async function dbLoadRegistry() {
    const result = await dbLoad('trip-registry');
    return result ? (result.trips || []) : [];
}

/** Save the trip registry. */
async function dbSaveRegistry(trips) {
    return dbSave('trip-registry', { trips });
}

// ── SHARE LINKS ──────────────────────────────────────────────────────

/** Create a new read-only share link for a trip. Anyone with the link
 *  gets full, unrestricted read access to every tab — there's no
 *  booking-refs toggle. Returns the token. */
async function dbCreateShare(tripId) {
    const result = await apiCall('create_share', {}, { trip_id: tripId });
    return result ? result.token : null;
}

/** List active share links for a trip. */
async function dbListShares(tripId) {
    const result = await apiCall('list_shares', { trip_id: tripId });
    return result || [];
}

/** Revoke a share link. */
async function dbRevokeShare(token) {
    return apiCall('revoke_share', { token }, null, 'DELETE');
}

/** Load a shared (read-only, sanitized) itinerary by token. No auth needed. */
async function dbLoadShare(token) {
    const result = await apiCall('share_load', { token });
    return result || null;
}

// ── CAR HIRE / ROAD TRIP ─────────────────────────────────────────────

/** Places autocomplete predictions for a partial input string. */
async function dbPlacesAutocomplete(input) {
    const result = await apiCall('places_autocomplete', { input });
    return result ? (result.predictions || []) : [];
}

/** Resolve a place_id to { place_id, name, address, lat, lng }. */
async function dbPlaceDetails(placeId) {
    const result = await apiCall('places_details', { place_id: placeId });
    return result ? result.place : null;
}

/** Compute a driving route via the Google Routes API.
 *  origin/destination/waypoints: { placeId } or { lat, lng }.
 *  Returns { distanceMeters, durationSeconds, polyline, legs, error }. */
async function dbComputeRoute(origin, destination, waypoints = []) {
    const result = await apiCall('routes_compute', {}, { origin, destination, waypoints });
    return result || null;
}
