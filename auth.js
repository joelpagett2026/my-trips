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

void bootstrapAuth();

// ══════════════════════════════════════════════════════════════════════
// SECTION COLOUR THEMES
// Theme Park Tracker uses the same muted green as Attractions in Trip Planning.
// The recolour is intentionally runtime-scoped to /parks/ so the shared Holiday
// Allowance stylesheet can stay shared without leaking green into other sections.
// ══════════════════════════════════════════════════════════════════════
(function installSectionColourSchemes() {
    const rawPath = window.location.pathname || '/';
    const path = rawPath.replace(/\/+$/, '') || '/';

    const PARK_GREEN = '#6c8966';
    const PARK_GREEN_MID = '#7f9d77';
    const PARK_GREEN_DARK = '#55704f';

    function replaceParksColour(value) {
        if (typeof value !== 'string' || !value) return value;
        return value
            .replace(/#0e7a87/gi, PARK_GREEN)
            .replace(/#12a0af/gi, PARK_GREEN_MID)
            .replace(/#0a6570/gi, PARK_GREEN_DARK)
            .replace(/#0e3a3f/gi, '#40513c')
            .replace(/#1a2a2a/gi, '#2d382b')
            .replace(/#f4fafb/gi, '#f4f7f3')
            .replace(/#e6f9f7/gi, '#edf3eb')
            .replace(/#dfe5e5/gi, '#e4e9e2')
            .replace(/rgba\(\s*14\s*,\s*122\s*,\s*135\s*,/gi, 'rgba(108,137,102,')
            .replace(/rgb\(\s*14\s*,\s*122\s*,\s*135\s*\)/gi, 'rgb(108,137,102)')
            .replace(/rgba\(\s*18\s*,\s*160\s*,\s*175\s*,/gi, 'rgba(127,157,119,')
            .replace(/rgb\(\s*18\s*,\s*160\s*,\s*175\s*\)/gi, 'rgb(127,157,119)')
            .replace(/rgba\(\s*10\s*,\s*101\s*,\s*112\s*,/gi, 'rgba(85,112,79,')
            .replace(/rgb\(\s*10\s*,\s*101\s*,\s*112\s*\)/gi, 'rgb(85,112,79)');
    }

    // Give the Theme Park Tracker tile on the main dashboard its own green identity
    // without recolouring the other dashboard sections.
    if (path === '/') {
        const style = document.createElement('style');
        style.id = 'parks-dashboard-colour-theme';
        style.textContent = `
          a.dash-card[href="/parks/"] .card-head-icon {
            color: ${PARK_GREEN} !important;
            background: #edf1ed !important;
          }
          a.dash-card[href="/parks/"] .card-arrow,
          a.dash-card[href="/parks/"] .stat-val.teal,
          a.dash-card[href="/parks/"] .stat-val.green,
          a.dash-card[href="/parks/"] .wide-value,
          a.dash-card[href="/parks/"] .wide-stat strong {
            color: ${PARK_GREEN} !important;
          }
          a.dash-card[href="/parks/"] .pill {
            color: ${PARK_GREEN} !important;
            background: #edf1ed !important;
          }
          a.dash-card[href="/parks/"] .media-placeholder.park {
            background: linear-gradient(135deg, #849b7f, #4f684b 75%) !important;
          }
        `;
        document.head.appendChild(style);
        return;
    }

    if (!(path === '/parks' || path.startsWith('/parks/'))) return;
    document.documentElement.classList.add('theme-parks-green');

    function transformStyleDeclaration(style) {
        if (!style) return;
        for (const property of Array.from(style)) {
            const current = style.getPropertyValue(property);
            const themed = replaceParksColour(current);
            if (themed !== current) {
                style.setProperty(property, themed, style.getPropertyPriority(property));
            }
        }
    }

    function transformCssRules(rules) {
        if (!rules) return;
        for (const rule of Array.from(rules)) {
            if (rule.style) transformStyleDeclaration(rule.style);
            if (rule.cssRules) {
                try { transformCssRules(rule.cssRules); } catch {}
            }
        }
    }

    function transformStyleSheet(sheet) {
        if (!sheet) return;
        try { transformCssRules(sheet.cssRules); } catch {}
    }

    function transformAttributes(element) {
        if (!element || element.nodeType !== 1) return;
        if (element.closest && element.closest('#pin-overlay')) return;
        for (const attribute of ['style', 'fill', 'stroke']) {
            if (!element.hasAttribute || !element.hasAttribute(attribute)) continue;
            const current = element.getAttribute(attribute);
            const themed = replaceParksColour(current);
            if (themed !== current) element.setAttribute(attribute, themed);
        }
    }

    function transformNode(node) {
        if (!node || node.nodeType !== 1) return;
        const element = node;
        if (element.closest && element.closest('#pin-overlay')) return;

        if (element.tagName === 'STYLE') {
            if (element.parentElement === document.head) {
                queueMicrotask(() => transformStyleSheet(element.sheet));
            }
            return;
        }

        if (element.tagName === 'LINK' && /(?:^|\s)stylesheet(?:\s|$)/i.test(element.rel || '')) {
            const apply = () => transformStyleSheet(element.sheet);
            if (element.sheet) queueMicrotask(apply);
            element.addEventListener('load', apply, { once: true });
            return;
        }

        transformAttributes(element);
        if (element.querySelectorAll) {
            element.querySelectorAll('[style],[fill],[stroke]').forEach(transformAttributes);
        }
    }

    // Start watching immediately so page-specific style blocks that appear after
    // auth.js are themed as the HTML parser adds them.
    const themeObserver = new MutationObserver(records => {
        records.forEach(record => {
            record.addedNodes.forEach(transformNode);
        });
    });
    themeObserver.observe(document.documentElement, { childList: true, subtree: true });

    // Catch anything that was already present, plus the shared stylesheet once it
    // has loaded. This keeps the whole /parks/ section on one palette without
    // changing Holiday Allowance, Concerts, Shows, Trips or Private Area.
    const applyParksTheme = () => {
        Array.from(document.styleSheets).forEach(transformStyleSheet);
        if (document.body) transformNode(document.body);
    };
    applyParksTheme();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyParksTheme, { once: true });
    }

    // parks/map.html draws the park pins with Google Maps' JS symbol API, so those
    // colours never pass through CSS. Wrap its callback before the page assigns it
    // and swap the old teal marker fill for the new Attractions green.
    if (path === '/parks/map.html') {
        let mapsReady = null;

        function patchGoogleMarkerColour() {
            try {
                const maps = window.google && window.google.maps;
                const OriginalMarker = maps && maps.Marker;
                if (!OriginalMarker || OriginalMarker.__parksGreenPatched) return;

                function GreenMarker(options) {
                    let themedOptions = options;
                    if (options && options.icon && typeof options.icon === 'object') {
                        const currentFill = String(options.icon.fillColor || '');
                        const themedFill = replaceParksColour(currentFill);
                        if (themedFill !== currentFill) {
                            themedOptions = Object.assign({}, options, {
                                icon: Object.assign({}, options.icon, { fillColor: themedFill })
                            });
                        }
                    }
                    return new OriginalMarker(themedOptions);
                }

                GreenMarker.prototype = OriginalMarker.prototype;
                Object.setPrototypeOf(GreenMarker, OriginalMarker);
                Object.defineProperty(GreenMarker, '__parksGreenPatched', { value: true });
                maps.Marker = GreenMarker;
            } catch {}
        }

        try {
            Object.defineProperty(window, 'gmReady', {
                configurable: true,
                enumerable: true,
                get() { return mapsReady; },
                set(fn) {
                    mapsReady = (typeof fn === 'function')
                        ? function (...args) {
                            patchGoogleMarkerColour();
                            return fn.apply(this, args);
                        }
                        : fn;
                }
            });
        } catch {}
    }
})();
