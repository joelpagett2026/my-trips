// ══════════════════════════════════════════════════════════════════════
//  MY TRIPS — Auth (PIN gate)
//  Uses pure-JS SHA-256 so it works on HTTP and HTTPS
// ══════════════════════════════════════════════════════════════════════

const SESSION_KEY = 'jh_auth';
const SESSION_TTL = 12 * 60 * 60 * 1000;

// Pure JS SHA-256 — no crypto.subtle needed, works on HTTP
function sha256(str) {
    function rightRotate(value, amount) {
        return (value >>> amount) | (value << (32 - amount));
    }
    var mathPow = Math.pow;
    var maxWord = mathPow(2, 32);
    var lengthProperty = 'length';
    var i, j;
    var result = '';
    var words = [];
    var asciiBitLength = str[lengthProperty] * 8;
    var hash = sha256.h = sha256.h || [];
    var k = sha256.k = sha256.k || [];
    var primeCounter = k[lengthProperty];
    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
        if (!isComposite[candidate]) {
            for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
            hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
            k[primeCounter++] = (mathPow(candidate, 1/3) * maxWord) | 0;
        }
    }
    str += '\x80';
    while (str[lengthProperty] % 64 - 56) str += '\x00';
    for (i = 0; i < str[lengthProperty]; i++) {
        j = str.charCodeAt(i);
        if (j >> 8) return;
        words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
    words[words[lengthProperty]] = (asciiBitLength);
    for (j = 0; j < words[lengthProperty];) {
        var w = words.slice(j, j += 16);
        var oldHash = hash.slice(0);
        hash = hash.slice(0, 8);
        for (i = 0; i < 64; i++) {
            var i2 = i + j - 16;
            var w15 = w[i - 15], w2 = w[i - 2];
            var a = hash[0], e = hash[4];
            var temp1 = hash[7]
                + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
                + ((e & hash[5]) ^ (~e & hash[6]))
                + k[i]
                + (w[i] = (i < 16) ? w[i] : (
                    w[i - 16]
                    + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
                    + w[i - 7]
                    + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
                ) | 0);
            var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
                + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
            hash = [(temp1 + temp2) | 0].concat(hash);
            hash[4] = (hash[4] + temp1) | 0;
        }
        for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) {
        for (j = 3; j + 1; j--) {
            var b = (hash[i] >> (j * 8)) & 255;
            result += ((b < 16) ? 0 : '') + b.toString(16);
        }
    }
    return result;
}

function getStoredSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
}

function isAuthed() {
    const s = getStoredSession();
    return s && s.token && (Date.now() - s.ts) < SESSION_TTL;
}

function storeSession(token) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token, ts: Date.now() }));
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

// Block page immediately if not authed
if (!isAuthed()) {
    document.documentElement.style.visibility = 'hidden';
}

function showPinOverlay() {
    document.documentElement.style.visibility = 'visible';

    const overlay = document.createElement('div');
    overlay.id = 'pin-overlay';
    overlay.innerHTML = `
    <style>
      #pin-overlay{position:fixed;inset:0;z-index:9999;background:#e8e8e8;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Montserrat',sans-serif;}
      #pin-logo{width:64px;height:64px;background:linear-gradient(135deg,#0a6570,#0e7a87);border-radius:18px;display:flex;align-items:center;justify-content:center;margin-bottom:20px;box-shadow:0 4px 20px rgba(10,124,110,0.3);}
      #pin-title{font-size:22px;font-weight:700;color:#444444;letter-spacing:-0.4px;margin-bottom:6px;}
      #pin-sub{font-size:14px;color:#666666;opacity:0.5;font-weight:500;margin-bottom:36px;}
      #pin-dots{display:flex;gap:14px;margin-bottom:36px;}
      .pin-dot{width:14px;height:14px;border-radius:50%;background:#b8b8b8;transition:background 0.15s;}
      .pin-dot.filled{background:#0e7a87;}.pin-dot.error{background:#ff3b30;}
      #pin-grid{display:grid;grid-template-columns:repeat(3,72px);gap:12px;}
      .pin-btn{width:72px;height:72px;border-radius:50%;background:#fff;border:none;cursor:pointer;font-family:'Montserrat',sans-serif;font-size:22px;font-weight:500;color:#444444;box-shadow:0 1px 3px rgba(0,0,0,0.1),0 0 0 0.5px rgba(0,0,0,0.06);transition:background 0.1s,transform 0.08s;display:flex;align-items:center;justify-content:center;}
      .pin-btn:active{background:#e5e5ea;transform:scale(0.94);}
      .pin-btn.del{background:transparent;box-shadow:none;}
      #pin-error{margin-top:20px;font-size:13px;font-weight:600;color:#ff3b30;opacity:0;transition:opacity 0.2s;}
      #pin-error.show{opacity:1;}
    </style>
    <div id="pin-logo">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l9-4 9 4v13l-9 4-9-4z"/><path d="M12 3v18"/><path d="M3 7l9 4 9-4"/></svg>
    </div>
    <div id="pin-title">My Trips</div>
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

    async function checkPin() {
        const hash = sha256(entered);
        try {
            const res = await fetch('/api.php?action=auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin_hash: hash })
            });
            const json = await res.json();
            if (json.ok && json.data && json.data.token) {
                storeSession(json.data.token);
                document.querySelectorAll('#pin-overlay .pin-dot').forEach(d => { d.style.background='#34c759'; });
                setTimeout(() => { overlay.remove(); document.documentElement.style.visibility = 'visible'; }, 350);
            } else {
                throw new Error('bad pin');
            }
        } catch {
            document.querySelectorAll('#pin-overlay .pin-dot').forEach(d => d.classList.add('error'));
            document.getElementById('pin-error').classList.add('show');
            setTimeout(() => {
                entered = ''; updateDots();
                document.querySelectorAll('#pin-overlay .pin-dot').forEach(d => d.classList.remove('error'));
                document.getElementById('pin-error').classList.remove('show');
            }, 800);
        }
    }

    overlay.querySelectorAll('.pin-btn[data-n]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (entered.length >= 4) return;
            entered += btn.dataset.n; updateDots();
            if (entered.length === 4) setTimeout(checkPin, 80);
        });
    });
    document.getElementById('pin-del').addEventListener('click', () => { entered = entered.slice(0,-1); updateDots(); });
    document.addEventListener('keydown', function h(e) {
        if (!document.getElementById('pin-overlay')) { document.removeEventListener('keydown',h); return; }
        if (e.key>='0'&&e.key<='9'&&entered.length<4) { entered+=e.key; updateDots(); if(entered.length===4) setTimeout(checkPin,80); }
        else if (e.key==='Backspace') { entered=entered.slice(0,-1); updateDots(); }
    });
}

if (isAuthed()) {
    document.documentElement.style.visibility = 'visible';
} else {
    document.addEventListener('DOMContentLoaded', showPinOverlay);
}
