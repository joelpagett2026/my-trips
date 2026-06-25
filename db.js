// ══════════════════════════════════════════════════════════════════════
//  MY TRIPS — Database client (replaces Supabase)
//  All pages include this instead of using localStorage for credentials.
// ══════════════════════════════════════════════════════════════════════

const API = '/api.php';

// The active auth token is the PIN hash — set after login, read from
// localStorage so it persists across pages.
function getToken() {
    try {
        const s = JSON.parse(localStorage.getItem('jh_auth') || 'null');
        return s ? s.token : '';
    } catch { return ''; }
}

async function apiCall(action, params = {}, body = null, method = null) {
    const url = new URL(API, location.origin);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const options = {
        method: method || (body ? 'POST' : 'GET'),
        headers: {
            'Content-Type': 'application/json',
            'X-Auth-Token': getToken(),
        },
    };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(url.toString(), options);
    const json = await res.json();
    if (!json.ok && json.error) throw new Error(json.error);
    return json.data;
}

// ── PUBLIC API ────────────────────────────────────────────────────────

/** Load an itinerary record by ID. Returns null if not found. */
async function dbLoad(id) {
    const result = await apiCall('load', { id });
    return result ? result.data : null;
}

/** Save an itinerary record. */
async function dbSave(id, data) {
    return apiCall('save', {}, { id, data });
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
