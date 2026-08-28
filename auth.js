// MY TRIPS — TEMPORARY AUTH BYPASS
// The PIN gate is deliberately disabled while the owner resets the PIN from
// Settings. Normal API calls still use a random server session; the browser
// obtains that temporary session automatically from auth-v2.php.

const IS_SHARE_VIEW = new URLSearchParams(window.location.search).has('share');
const SESSION_KEY = 'jh_auth';

function getStoredSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY) || 'null';
        return JSON.parse(raw);
    } catch { return null; }
}

function storeSession(sessionToken) {
    const payload = JSON.stringify({ sessionToken: sessionToken || '', ts: Date.now() });
    try { localStorage.setItem(SESSION_KEY, payload); } catch {}
    try { sessionStorage.setItem(SESSION_KEY, payload); } catch {}
}

function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}

function isAuthed() {
    const s = getStoredSession();
    return !!(s && s.sessionToken && /^[a-f0-9]{64}$/i.test(s.sessionToken));
}

function announceAuthed() {
    document.documentElement.style.visibility = 'visible';
    window._mytripsAuthed = true;
    document.dispatchEvent(new Event('mytrips:authed'));
}

async function establishTemporaryAccess(attempt = 0) {
    if (IS_SHARE_VIEW) {
        announceAuthed();
        return;
    }

    try {
        const res = await fetch('/auth-v2.php?action=temporary_access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            credentials: 'same-origin',
            body: '{}',
        });
        const json = await res.json();
        if (!res.ok || !json?.ok || !json?.data?.session_token) {
            throw new Error(json?.error || `Temporary access failed (${res.status})`);
        }
        storeSession(json.data.session_token);
        announceAuthed();
    } catch (err) {
        // There is intentionally NO PIN fallback here. Keep the site visible and
        // retry the temporary session path so a transient request cannot put the
        // user back behind the broken PIN screen.
        document.documentElement.style.visibility = 'visible';
        window._mytripsAuthed = false;
        if (attempt < 4) {
            setTimeout(() => establishTemporaryAccess(attempt + 1), 500 * (attempt + 1));
            return;
        }
        console.error('Temporary access could not be established', err);
        document.dispatchEvent(new CustomEvent('mytrips:temporary-auth-failed', {
            detail: { message: err?.message || 'Temporary access failed' }
        }));
    }
}

// Never hide the page and never render a PIN overlay while temporary bypass mode
// is active. Clear any stale session first so db.js waits for the fresh token.
document.documentElement.style.visibility = 'visible';
if (!IS_SHARE_VIEW) clearSession();

// If an API later reports an expired session, automatically obtain another
// temporary session rather than relocking the UI.
document.addEventListener('mytrips:auth-expired', () => {
    if (IS_SHARE_VIEW) return;
    clearSession();
    establishTemporaryAccess();
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => establishTemporaryAccess(), { once: true });
} else {
    establishTemporaryAccess();
}
