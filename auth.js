// ══════════════════════════════════════════════════════════════════════
//  MY TRIPS — Auth (PIN gate)
//  The PIN is submitted only to the same-origin HTTPS auth endpoint. Hashing
//  and credential comparison happen server-side; no PIN hash is a browser token.
// ══════════════════════════════════════════════════════════════════════

// Read-only share links bypass the PIN entirely — the itinerary page
// itself loads read-only data via a token instead.
const IS_SHARE_VIEW = new URLSearchParams(window.location.search).has('share');
if (IS_SHARE_VIEW) document.documentElement.style.visibility = 'visible';

const SESSION_KEY = 'jh_auth';
const SESSION_TTL = 12 * 60 * 60 * 1000;

function getStoredSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
}

function isAuthed() {
    const s = getStoredSession();
    return !!(s && s.sessionToken && s.ts && (Date.now() - s.ts) < SESSION_TTL);
}

function storeSession(sessionToken) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
        sessionToken: sessionToken || '',
        ts: Date.now(),
    }));
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

if (!isAuthed() && !IS_SHARE_VIEW) {
    document.documentElement.style.visibility = 'hidden';
}

function showPinOverlay() {
    if (IS_SHARE_VIEW || document.getElementById('pin-overlay')) return;
    document.documentElement.style.visibility = 'visible';

    const overlay = document.createElement('div');
    overlay.id = 'pin-overlay';
    overlay.innerHTML = `
    <style>
      #pin-overlay{position:fixed;inset:0;z-index:9999;background:#e8e8e8;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Montserrat',sans-serif;touch-action:manipulation;}
      #pin-logo{width:64px;height:64px;background:linear-gradient(135deg,#0a6570,#0e7a87);border-radius:18px;display:flex;align-items:center;justify-content:center;margin-bottom:20px;box-shadow:0 4px 20px rgba(10,124,110,0.3);}
      #pin-title{font-size:19px;font-weight:700;color:#444444;letter-spacing:-0.3px;margin-bottom:6px;text-align:center;max-width:300px;line-height:1.25;}
      #pin-sub{font-size:14px;color:#666666;opacity:0.5;font-weight:500;margin-bottom:36px;}
      #pin-dots{display:flex;gap:14px;margin-bottom:36px;}
      .pin-dot{width:14px;height:14px;border-radius:50%;background:#b8b8b8;transition:background 0.15s;}
      .pin-dot.filled{background:#0e7a87;}.pin-dot.error{background:#ff3b30;}
      #pin-grid{display:grid;grid-template-columns:repeat(3,72px);gap:12px;touch-action:manipulation;}
      .pin-btn{width:72px;height:72px;border-radius:50%;background:#fff;border:none;cursor:pointer;font-family:'Montserrat',sans-serif;font-size:22px;font-weight:500;color:#444444;box-shadow:0 1px 3px rgba(0,0,0,0.1),0 0 0 0.5px rgba(0,0,0,0.06);transition:background 0.1s,transform 0.08s;display:flex;align-items:center;justify-content:center;touch-action:manipulation;-webkit-user-select:none;user-select:none;}
      .pin-btn:active{background:#e5e5ea;transform:scale(0.94);}
      .pin-btn.del{background:transparent;box-shadow:none;}
      #pin-error{margin-top:20px;font-size:13px;font-weight:600;color:#ff3b30;opacity:0;transition:opacity 0.2s;max-width:320px;text-align:center;line-height:1.35;}
      #pin-error.show{opacity:1;}
    </style>
    <div id="pin-logo">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l9-4 9 4v13l-9 4-9-4z"/><path d="M12 3v18"/><path d="M3 7l9 4 9-4"/></svg>
    </div>
    <div id="pin-title">Joel Pagett's Tracker &amp; Tools</div>
    <div id="pin-sub">Enter your PIN to continue</div>
    <div id="pin-dots">
      <div class="pin-dot" id="d0"></div><div class="pin-dot" id="d1"></div>
      <div class="pin-dot" id="d2"></div><div class="pin-dot" id="d3"></div>
    </div>
    <div id="pin-grid">
      ${[1,2,3,4,5,6,7,8,9].map(n=>`<button class="pin-btn" data-n="${n}">${n}</button>`).join('')}
      <div></div>
      <button class="pin-btn" data-n="0">0</button>
      <button class="pin-btn del" id="pin-del">
        <svg width="22" height="16" viewBox="0 0 24 18" fill="none" stroke="#000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-6-6 6-6z"/><line x1="13" y1="7" x2="17" y2="11"/><line x1="17" y1="7" x2="13" y2="11"/></svg>
      </button>
    </div>
    <div id="pin-error">Incorrect PIN — try again</div>`;

    document.body.appendChild(overlay);
    let entered = '';

    function updateDots() {
        for (let i = 0; i < 4; i++) {
            document.getElementById('d'+i).className = 'pin-dot' + (i < entered.length ? ' filled' : '');
        }
    }

    function showPinError(message) {
        document.querySelectorAll('#pin-overlay .pin-dot').forEach(d => d.classList.add('error'));
        const errorEl = document.getElementById('pin-error');
        errorEl.textContent = message || 'Authentication failed';
        errorEl.classList.add('show');
        setTimeout(() => {
            entered = '';
            updateDots();
            document.querySelectorAll('#pin-overlay .pin-dot').forEach(d => d.classList.remove('error'));
            errorEl.classList.remove('show');
        }, 1800);
    }

    async function checkPin() {
        try {
            const res = await fetch('/auth-v2.php?action=login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin: entered })
            });
            let json;
            try { json = await res.json(); }
            catch { throw new Error(`Authentication service returned HTTP ${res.status}`); }
            if (json.ok && json.data && json.data.session_token) {
                storeSession(json.data.session_token);
                document.querySelectorAll('#pin-overlay .pin-dot').forEach(d => { d.style.background='#34c759'; });
                setTimeout(() => {
                    overlay.remove();
                    document.documentElement.style.visibility = 'visible';
                    window._mytripsAuthed = true;
                    document.dispatchEvent(new Event('mytrips:authed'));
                }, 350);
            } else {
                throw new Error(json.error || `Authentication failed (HTTP ${res.status})`);
            }
        } catch (err) {
            showPinError(err && err.message ? err.message : 'Authentication failed');
        }
    }

    overlay.querySelectorAll('.pin-btn[data-n]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (entered.length >= 4) return;
            entered += btn.dataset.n;
            updateDots();
            if (entered.length === 4) setTimeout(checkPin, 80);
        });
    });
    document.getElementById('pin-del').addEventListener('click', () => {
        entered = entered.slice(0,-1);
        updateDots();
    });
    document.addEventListener('keydown', function h(e) {
        if (!document.getElementById('pin-overlay')) {
            document.removeEventListener('keydown',h);
            return;
        }
        if (e.key>='0'&&e.key<='9'&&entered.length<4) {
            entered+=e.key;
            updateDots();
            if(entered.length===4) setTimeout(checkPin,80);
        } else if (e.key==='Backspace') {
            entered=entered.slice(0,-1);
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
    document.documentElement.style.visibility = 'visible';
} else if (isAuthed()) {
    document.documentElement.style.visibility = 'visible';
    window._mytripsAuthed = true;
    document.addEventListener('DOMContentLoaded', () => document.dispatchEvent(new Event('mytrips:authed')));
} else {
    // Older cached sessions stored the PIN hash in `token` instead of a random
    // server session. Clear them and require one fresh PIN entry after rollout.
    clearSession();
    document.addEventListener('DOMContentLoaded', showPinOverlay);
}
