// ══════════════════════════════════════════════════════════════════════
// MY TRIPS — Auth (PIN gate)
// The browser submits only the four PIN digits to the same-origin HTTPS auth
// endpoint. The server hashes the PIN and issues a random expiring session token.
// ══════════════════════════════════════════════════════════════════════

const IS_SHARE_VIEW = new URLSearchParams(window.location.search).has('share');
const SESSION_KEY = 'jh_auth';
const SESSION_TTL = 12 * 60 * 60 * 1000;

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
    return !!(
        s &&
        /^[a-f0-9]{64}$/i.test(String(s.sessionToken || '')) &&
        Number.isFinite(Number(s.ts)) &&
        (Date.now() - Number(s.ts)) < SESSION_TTL
    );
}

function announceAuthed() {
    document.documentElement.style.visibility = 'visible';
    window._mytripsAuthed = true;
    document.dispatchEvent(new Event('mytrips:authed'));
}

if (IS_SHARE_VIEW || isAuthed()) document.documentElement.style.visibility = 'visible';
else document.documentElement.style.visibility = 'hidden';

function showPinOverlay() {
    if (IS_SHARE_VIEW || document.getElementById('pin-overlay')) return;
    document.documentElement.style.visibility = 'visible';

    const overlay = document.createElement('div');
    overlay.id = 'pin-overlay';
    overlay.innerHTML = `
    <style>
      #pin-overlay{position:fixed;inset:0;z-index:9999;background:#e8e8e8;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Montserrat',sans-serif;touch-action:manipulation}
      #pin-logo{width:64px;height:64px;background:linear-gradient(135deg,#0a6570,#0e7a87);border-radius:18px;display:flex;align-items:center;justify-content:center;margin-bottom:20px;box-shadow:0 4px 20px rgba(10,124,110,.3)}
      #pin-title{font-size:19px;font-weight:700;color:#444;letter-spacing:-.3px;margin-bottom:6px;text-align:center;max-width:300px;line-height:1.25}
      #pin-sub{font-size:14px;color:#666;opacity:.5;font-weight:500;margin-bottom:36px}
      #pin-dots{display:flex;gap:14px;margin-bottom:36px}.pin-dot{width:14px;height:14px;border-radius:50%;background:#b8b8b8}.pin-dot.filled{background:#0e7a87}.pin-dot.error{background:#ff3b30}
      #pin-grid{display:grid;grid-template-columns:repeat(3,72px);gap:12px}.pin-btn{width:72px;height:72px;border-radius:50%;background:#fff;border:0;cursor:pointer;font:500 22px 'Montserrat',sans-serif;color:#444;box-shadow:0 1px 3px rgba(0,0,0,.1);display:flex;align-items:center;justify-content:center}.pin-btn:active{background:#e5e5ea;transform:scale(.94)}.pin-btn.del{background:transparent;box-shadow:none}
      #pin-error{margin-top:20px;font-size:13px;font-weight:600;color:#ff3b30;opacity:0;max-width:320px;text-align:center;line-height:1.35}#pin-error.show{opacity:1}
    </style>
    <div id="pin-logo"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l9-4 9 4v13l-9 4-9-4z"/><path d="M12 3v18"/><path d="M3 7l9 4 9-4"/></svg></div>
    <div id="pin-title">Joel Pagett's Tracker &amp; Tools</div>
    <div id="pin-sub">Enter your PIN to continue</div>
    <div id="pin-dots"><div class="pin-dot" id="d0"></div><div class="pin-dot" id="d1"></div><div class="pin-dot" id="d2"></div><div class="pin-dot" id="d3"></div></div>
    <div id="pin-grid">${[1,2,3,4,5,6,7,8,9].map(n=>`<button class="pin-btn" data-n="${n}">${n}</button>`).join('')}<div></div><button class="pin-btn" data-n="0">0</button><button class="pin-btn del" id="pin-del" aria-label="Delete">⌫</button></div>
    <div id="pin-error">Incorrect PIN</div>`;

    document.body.appendChild(overlay);
    let entered = '';
    let busy = false;

    function updateDots() {
        for (let i = 0; i < 4; i++) {
            document.getElementById('d' + i).className = 'pin-dot' + (i < entered.length ? ' filled' : '');
        }
    }

    function showPinError(message) {
        overlay.querySelectorAll('.pin-dot').forEach(d => d.classList.add('error'));
        const el = document.getElementById('pin-error');
        el.textContent = message || 'Authentication failed';
        el.classList.add('show');
        setTimeout(() => {
            entered = '';
            busy = false;
            updateDots();
            overlay.querySelectorAll('.pin-dot').forEach(d => d.classList.remove('error'));
            el.classList.remove('show');
        }, 1600);
    }

    async function checkPin() {
        if (busy || entered.length !== 4) return;
        busy = true;
        try {
            const res = await fetch('/auth-v2.php?action=login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-store',
                credentials: 'same-origin',
                body: JSON.stringify({ pin: entered })
            });
            let json;
            try { json = await res.json(); }
            catch { throw new Error(`Authentication service returned HTTP ${res.status}`); }
            if (!res.ok || !json.ok || !json.data || !json.data.session_token) {
                throw new Error(json.error || `Authentication failed (HTTP ${res.status})`);
            }
            storeSession(json.data.session_token);
            overlay.querySelectorAll('.pin-dot').forEach(d => { d.style.background = '#34c759'; });
            setTimeout(() => {
                overlay.remove();
                announceAuthed();
            }, 250);
        } catch (err) {
            showPinError(err && err.message ? err.message : 'Authentication failed');
        }
    }

    function addDigit(n) {
        if (busy || entered.length >= 4) return;
        entered += String(n);
        updateDots();
        if (entered.length === 4) setTimeout(checkPin, 50);
    }

    overlay.querySelectorAll('.pin-btn[data-n]').forEach(btn => btn.addEventListener('click', () => addDigit(btn.dataset.n)));
    document.getElementById('pin-del').addEventListener('click', () => {
        if (!busy) {
            entered = entered.slice(0, -1);
            updateDots();
        }
    });
    document.addEventListener('keydown', function h(e) {
        if (!document.getElementById('pin-overlay')) {
            document.removeEventListener('keydown', h);
            return;
        }
        if (/^[0-9]$/.test(e.key)) addDigit(e.key);
        else if (e.key === 'Backspace' && !busy) {
            entered = entered.slice(0, -1);
            updateDots();
        }
    });
}

function relockForExpiredSession() {
    if (IS_SHARE_VIEW) return;
    clearSession();
    window._mytripsAuthed = false;
    if (document.body) showPinOverlay();
    else document.addEventListener('DOMContentLoaded', showPinOverlay, { once: true });
}

document.addEventListener('mytrips:auth-expired', relockForExpiredSession);

if (IS_SHARE_VIEW) {
    announceAuthed();
} else if (isAuthed()) {
    window._mytripsAuthed = true;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => document.dispatchEvent(new Event('mytrips:authed')), { once: true });
    } else {
        document.dispatchEvent(new Event('mytrips:authed'));
    }
} else {
    clearSession();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showPinOverlay, { once: true });
    else showPinOverlay();
}
