// ══════════════════════════════════════════════════════════════════════
// MY TRIPS — Auth (PIN gate)
// The browser submits only the four PIN digits to the same-origin HTTPS auth
// endpoint. The real session credential lives only in a Secure/HttpOnly cookie;
// browser storage contains a fixed non-secret compatibility marker only.
// ══════════════════════════════════════════════════════════════════════

const IS_SHARE_VIEW = new URLSearchParams(window.location.search).has('share');
const SESSION_KEY = 'jh_auth';
const SESSION_MARKER = 'cookie-session';
// Deliberately public/non-secret. This is 64 hex characters only so older cached
// auth.js builds (which expected a legacy 64-hex token shape) recognise the local
// browser as already unlocked while the real authority remains the HttpOnly cookie.
const STORAGE_COMPAT_MARKER = 'c00c1e5ec00c1e5ec00c1e5ec00c1e5ec00c1e5ec00c1e5ec00c1e5ec00c1e5e';
const SESSION_TTL = 12 * 60 * 60 * 1000;

function getStoredSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY) || 'null';
        return JSON.parse(raw);
    } catch { return null; }
}

// Never persist a server credential. The stored value is deliberately non-secret:
// it only keeps older callers that expect a legacy-shaped `sessionToken` working.
// The server validates the HttpOnly cookie on every protected request.
function storeSession() {
    const payload = JSON.stringify({ sessionToken: STORAGE_COMPAT_MARKER, ts: Date.now() });
    try { localStorage.setItem(SESSION_KEY, payload); } catch {}
    try { sessionStorage.setItem(SESSION_KEY, payload); } catch {}
}

function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}

function storedLegacyHeaderToken() {
    const s = getStoredSession();
    if (!s || !Number.isFinite(Number(s.ts)) || (Date.now() - Number(s.ts)) >= SESSION_TTL) return '';
    const value = String(s.sessionToken || '');
    // A valid pre-cookie raw token (or the fixed non-secret cache marker) is sent
    // only to /check; cookie-first server validation remains authoritative.
    if (/^[a-f0-9]{64}$/i.test(value) || value === SESSION_MARKER) return value;
    return '';
}

function isAuthed() {
    return IS_SHARE_VIEW || window._mytripsAuthed === true;
}

function announceAuthed() {
    document.documentElement.style.visibility = 'visible';
    window._mytripsAuthed = true;
    document.dispatchEvent(new Event('mytrips:authed'));
}

if (IS_SHARE_VIEW) document.documentElement.style.visibility = 'visible';
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
            if (!res.ok || !json.ok || !json.data || json.data.session_token !== SESSION_MARKER) {
                throw new Error(json.error || `Authentication failed (HTTP ${res.status})`);
            }
            storeSession();
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

function showPinWhenReady() {
    if (document.body) showPinOverlay();
    else document.addEventListener('DOMContentLoaded', showPinOverlay, { once: true });
}

function relockForExpiredSession() {
    if (IS_SHARE_VIEW) return;
    clearSession();
    window._mytripsAuthed = false;
    showPinWhenReady();
}

document.addEventListener('mytrips:auth-expired', relockForExpiredSession);

async function validateCurrentSession() {
    const legacyOrMarker = storedLegacyHeaderToken();
    const headers = { 'Content-Type': 'application/json' };
    if (legacyOrMarker) headers['X-Auth-Token'] = legacyOrMarker;

    try {
        const res = await fetch('/auth-v2.php?action=check', {
            method: 'POST',
            headers,
            cache: 'no-store',
            credentials: 'same-origin',
            body: '{}'
        });
        let json = null;
        try { json = await res.json(); } catch {}
        if (!res.ok || !json?.ok || !json?.data?.valid || json.data.session_token !== SESSION_MARKER) {
            clearSession();
            return false;
        }

        // This overwrites any still-valid legacy raw token or old text marker with
        // the fixed cache-compatible non-secret marker after cookie validation.
        storeSession();
        announceAuthed();
        return true;
    } catch {
        // A transient network failure must not treat a browser marker as authority.
        // Keep the page locked and offer PIN entry rather than exposing private UI.
        clearSession();
        return false;
    }
}

async function bootstrapAuth() {
    if (IS_SHARE_VIEW) {
        announceAuthed();
        return;
    }
    if (await validateCurrentSession()) return;
    window._mytripsAuthed = false;
    showPinWhenReady();
}

function isHomepage() {
    return ['/', '/home.php', '/index.html'].includes(window.location.pathname);
}

function applyHomepageTrackerLayout() {
    if (!isHomepage()) return;

    const tripCard = document.querySelector('.main-grid > a.dash-card[href="/trips/"]');
    const statsRow = tripCard?.querySelector('.stats-row');
    if (statsRow) {
        statsRow.classList.add('travel-stats-row');
        statsRow.innerHTML = `
          <div class="travel-stat">
            <span class="travel-stat-icon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg></span>
            <span class="travel-stat-copy"><span class="travel-stat-label">Trips taken</span><strong class="travel-stat-value" id="hp-stat-trips">59</strong></span>
          </div>
          <div class="travel-stat">
            <span class="travel-stat-icon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2C8 6 8 18 12 22"/><path d="M12 2c4 4 4 16 0 20"/><path d="M2 12h20"/><path d="M3.5 7h17M3.5 17h17"/></svg></span>
            <span class="travel-stat-copy"><span class="travel-stat-label">Countries visited</span><strong class="travel-stat-value" id="hp-stat-countries">34</strong></span>
          </div>
          <div class="travel-stat">
            <span class="travel-stat-icon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 12l4.5-4.5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><path d="M2 12h2M12 2v2M20.5 5.5l-1.4 1.4"/></svg></span>
            <span class="travel-stat-copy"><span class="travel-stat-label">Miles travelled</span><strong class="travel-stat-value" id="hp-stat-miles">206,825</strong></span>
          </div>`;
    }

    const style = document.createElement('style');
    style.id = 'homepage-tracker-grid-layout';
    style.textContent = `
      .main-grid > a.dash-card[href="/trips/"] .travel-stats-row{
        display:grid!important;
        grid-template-columns:repeat(3,minmax(0,1fr))!important;
        gap:10px!important;
        margin:14px 16px 16px!important;
        padding:0!important;
        border-top:0!important;
      }
      .main-grid > a.dash-card[href="/trips/"] .travel-stat{
        min-width:0;
        display:flex;
        align-items:center;
        gap:10px;
        padding:11px 12px;
        border-radius:13px;
        background:#f2f5f5;
      }
      .main-grid > a.dash-card[href="/trips/"] .travel-stat-icon{
        width:34px;
        height:34px;
        border-radius:10px;
        flex:0 0 34px;
        display:grid;
        place-items:center;
        color:#0e7a87;
        background:#e5f1f2;
      }
      .main-grid > a.dash-card[href="/trips/"] .travel-stat-copy{min-width:0;display:block;}
      .main-grid > a.dash-card[href="/trips/"] .travel-stat-label{
        display:block;
        color:#7d898d;
        font-size:8.5px;
        line-height:1.2;
        font-weight:700;
        text-transform:uppercase;
        letter-spacing:.035em;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .main-grid > a.dash-card[href="/trips/"] .travel-stat-value{
        display:block;
        margin-top:3px;
        color:#0e7a87;
        font-size:17px;
        line-height:1;
        font-weight:800;
        letter-spacing:-.03em;
        white-space:nowrap;
      }

      @media (min-width:1251px) {
        .main-grid > a.dash-card[href="/trips/"] { grid-column: span 4!important; }
        .main-grid > a.dash-card[href="/holidays/"] { grid-column: span 2!important; }

        .main-grid > a.dash-card[href="/trips/"] .trip-hero{
          min-height:190px!important;
        }
        .main-grid > a.dash-card[href="/trips/"] .trip-name{font-size:22px!important;}
        .main-grid > a.dash-card[href="/trips/"] .trip-date{font-size:11px!important;}
        .main-grid > a.dash-card[href="/trips/"] .trip-countdown{
          min-width:102px!important;
          padding:11px 13px!important;
        }
        .main-grid > a.dash-card[href="/trips/"] .trip-countdown strong{font-size:22px!important;}

        .main-grid > a.dash-card[href="/concerts/"],
        .main-grid > a.dash-card[href="/shows/"],
        .main-grid > a.dash-card[href="/parks/"] { grid-column: span 2; }

        .main-grid > a.dash-card[href="/shows/"] .wide-preview,
        .main-grid > a.dash-card[href="/parks/"] .wide-preview {
          grid-template-columns: 42% minmax(0,1fr);
          gap: 13px;
          align-items: stretch;
        }
        .main-grid > a.dash-card[href="/shows/"] .wide-preview .event-media,
        .main-grid > a.dash-card[href="/parks/"] .wide-preview .event-media {
          height: auto;
          min-height: 116px;
        }
        .main-grid > a.dash-card[href="/shows/"] .wide-stats,
        .main-grid > a.dash-card[href="/parks/"] .wide-stats {
          grid-column: 1 / -1;
          min-width: 0;
          border-top: 1px solid var(--line);
          padding-top: 13px;
          margin-top: 1px;
        }
      }

      @media (max-width:640px) {
        .main-grid > a.dash-card[href="/trips/"] .travel-stats-row{
          grid-template-columns:1fr!important;
          gap:8px!important;
          margin:14px 18px 18px!important;
        }
        .main-grid > a.dash-card[href="/trips/"] .travel-stat{padding:10px 12px;}
        .main-grid > a.dash-card[href="/trips/"] .travel-stat-copy{
          width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;
        }
        .main-grid > a.dash-card[href="/trips/"] .travel-stat-value{margin-top:0;font-size:18px;}
        .main-grid > a.dash-card[href="/trips/"] .trip-hero{min-height:165px!important;}
      }
    `;
    document.head.appendChild(style);
}

async function updateHomepageTravelStats() {
    if (!isHomepage() || typeof window.dbLoadRegistry !== 'function') return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const planned = {
        'china-2026':      { endDate:'2026-04-17', countries:['cn'],      estimatedMiles:12790, addToStats:false },
        'dubai-2025':      { endDate:'2026-01-09', countries:['ae','fr'], estimatedMiles:7012,  addToStats:false },
        'costa-rica-2025': { endDate:'2025-04-21', countries:['es','cr'], estimatedMiles:11911, addToStats:false },
        'canada-2027':     { endDate:'2027-10-10', countries:['ca'],      estimatedMiles:7820,  addToStats:true  },
        'hk-taiwan-2027':  { endDate:'2027-04-12', countries:['hk','tw'], estimatedMiles:12802, addToStats:true  },
    };

    const countries = new Set(['ae','at','be','ca','ch','cn','cr','cy','cz','de','dk','es','fi','fr','gb','gr','hr','hu','id','ie','it','je','jp','kr','lu','mc','my','nl','se','sg','tr','us','za']);
    let miles = 206825;
    let tripCount = 58;

    Object.values(planned).forEach(trip => {
        if (!trip.addToStats || new Date(trip.endDate) > today) return;
        trip.countries.forEach(cc => countries.add(cc));
        miles += trip.estimatedMiles;
        tripCount++;
    });

    const london = [51.5074, -0.1278];
    const coords = {
        ae:[25.2048,55.2708], at:[48.2082,16.3738], au:[-33.8688,151.2093], be:[50.8503,4.3517],
        ca:[43.7001,-79.4163], ch:[46.9481,7.4474], cn:[39.9042,116.4074], cr:[9.9281,-84.0907],
        cy:[35.1856,33.3823], cz:[50.0755,14.4378], de:[52.5200,13.4050], dk:[55.6761,12.5683],
        es:[40.4168,-3.7038], fi:[60.1699,24.9384], fr:[48.8566,2.3522], gb:[51.5074,-0.1278],
        gr:[37.9838,23.7275], hk:[22.3193,114.1694], hr:[45.8150,15.9819], hu:[47.4979,19.0402],
        id:[-6.2088,106.8456], ie:[53.3498,-6.2603], it:[41.9028,12.4964], je:[49.2144,-2.1313],
        jp:[35.6762,139.6503], kr:[37.5665,126.9780], lu:[49.8153,6.1296], mc:[43.7384,7.4246],
        my:[3.1390,101.6869], nl:[52.3676,4.9041], nz:[-36.8485,174.7633], pl:[52.2297,21.0122],
        pt:[38.7169,-9.1395], ro:[44.4268,26.1025], se:[59.3293,18.0686], sg:[1.3521,103.8198],
        th:[13.7563,100.5018], tr:[41.0082,28.9784], tw:[25.0330,121.5654], us:[40.7128,-74.0060],
        za:[-33.9249,18.4241],
    };

    const haversineKm = ([lat1, lon1], [lat2, lon2]) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const estimateMiles = flags => {
        let maxKm = 0;
        flags.forEach(cc => {
            if (!coords[cc]) return;
            maxKm = Math.max(maxKm, haversineKm(london, coords[cc]));
        });
        return Math.round(maxKm * 2 * 0.6214 * 1.15);
    };

    const parseDate = value => {
        const s = String(value || '').trim();
        let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
        m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
        m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
        if (m) {
            const months = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
            if (months[m[2]] !== undefined) return new Date(+m[3], months[m[2]], +m[1]);
        }
        return null;
    };

    const alreadyCounted = new Set([
        'china-2026', 'dubai-2025', 'costa-rica-2025',
        ...Object.entries(planned).filter(([, trip]) => trip.addToStats).map(([slug]) => slug),
    ]);

    try {
        const raw = await window.dbLoadRegistry();
        const trips = (Array.isArray(raw) ? raw : Object.values(raw || {})).filter(t => t && !t.deleted);
        trips.forEach(t => {
            if (alreadyCounted.has(t.slug)) return;
            const dep = parseDate(t.dep || t.startDate || t.start || t.date);
            if (!dep || dep > today) return;

            const flags = Array.from(new Set((Array.isArray(t.flags) ? t.flags : [])
              .map(cc => String(cc || '').trim().toLowerCase())
              .filter(cc => /^[a-z]{2}$/.test(cc))));
            flags.forEach(cc => countries.add(cc));
            if (flags.length && !['porto-2026', 'porto-2026-v2'].includes(t.slug)) {
                miles += estimateMiles(flags);
            }
            tripCount++;
        });
    } catch {
        // Keep the known baseline values already rendered in the card.
        return;
    }

    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    setValue('hp-stat-trips', tripCount.toLocaleString('en-GB'));
    setValue('hp-stat-countries', countries.size.toLocaleString('en-GB'));
    setValue('hp-stat-miles', miles.toLocaleString('en-GB'));
}

function scheduleHomepageTravelStats() {
    if (!isHomepage()) return;
    const run = () => void updateHomepageTravelStats();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
    else run();
}

applyHomepageTrackerLayout();
scheduleHomepageTravelStats();
void bootstrapAuth();