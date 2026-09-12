// MY TRIPS — safe dashboard trip creation
// Replaces the legacy two-step "create itinerary, then save registry" flow with
// one atomic server transaction so partial failures cannot create orphaned data.
(function () {
  if (typeof window === 'undefined') return;

  function installMobileScrollToBottom() {
    const isMobileBrowser = window.matchMedia('(max-width: 700px)').matches;
    const isStandalone = window.navigator.standalone === true
      || window.matchMedia('(display-mode: standalone)').matches;
    if (!isMobileBrowser && !(isStandalone && window.innerWidth <= 900)) return;
    if (document.getElementById('mobile-scroll-bottom')) return;

    const style = document.createElement('style');
    style.id = 'mobile-scroll-bottom-style';
    style.textContent = `
      #mobile-scroll-bottom {
        position: fixed;
        right: 18px;
        bottom: calc(18px + env(safe-area-inset-bottom));
        width: 48px;
        height: 48px;
        border: 0;
        border-radius: 50%;
        background: #0e7a87;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 7px 22px rgba(0,0,0,0.22), 0 1px 4px rgba(0,0,0,0.18);
        z-index: 460;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: opacity .18s ease, transform .18s ease;
      }
      #mobile-scroll-bottom:active { transform: scale(.94); }
      #mobile-scroll-bottom.is-hidden { opacity: 0; pointer-events: none; transform: translateY(8px); }
      #mobile-scroll-bottom svg { width: 22px; height: 22px; }
    `;
    document.head.appendChild(style);

    const button = document.createElement('button');
    button.id = 'mobile-scroll-bottom';
    button.type = 'button';
    button.setAttribute('aria-label', 'Scroll to bottom');
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

    const syncVisibility = () => {
      const scroller = document.scrollingElement || document.documentElement;
      const maxScroll = Math.max(0, scroller.scrollHeight - window.innerHeight);
      button.classList.toggle('is-hidden', window.scrollY >= maxScroll - 28 || maxScroll < 80);
    };

    button.addEventListener('click', () => {
      const scroller = document.scrollingElement || document.documentElement;
      window.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
    });
    window.addEventListener('scroll', syncVisibility, { passive: true });
    window.addEventListener('resize', syncVisibility, { passive: true });
    document.body.appendChild(button);
    requestAnimationFrame(syncVisibility);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installMobileScrollToBottom, { once: true });
  } else {
    installMobileScrollToBottom();
  }

  function currentPhoto() {
    const preview = document.getElementById('m-photo-preview');
    const img = document.getElementById('m-photo-img');
    if (!preview || !img || preview.style.display === 'none') return '';
    const src = img.getAttribute('src') || '';
    return src.startsWith('data:image/') ? src : '';
  }

  async function parseResponse(res) {
    const text = await res.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; }
    catch { throw new Error(`Server returned an invalid response (${res.status})`); }
    if (res.status === 401) document.dispatchEvent(new Event('mytrips:auth-expired'));
    if (!res.ok || json.ok === false) {
      const err = new Error(json.error || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return json.data || {};
  }

  function destinationParts(dest) {
    const parts = String(dest || '')
      .split(/\s*(?:&|\/|\+|,|\band\b)\s*/i)
      .map(part => part.trim())
      .filter(Boolean);
    return parts.length > 1 ? parts : [dest];
  }

  async function geocodeDestination(dest) {
    const points = [];
    const flags = [];
    if (typeof window.geocode !== 'function') return { points, flags };

    const addGeo = geo => {
      if (!geo) return;
      const point = [geo.lat, geo.lon];
      if (!points.some(p => p[0] === point[0] && p[1] === point[1])) points.push(point);
      const cc = String(geo.cc || '').trim().toLowerCase();
      if (cc && !flags.includes(cc)) flags.push(cc);
    };

    const parts = destinationParts(dest);
    for (const part of parts) {
      try { addGeo(await window.geocode(part)); }
      catch { /* one failed place should not block the trip */ }
    }

    // If splitting produced no useful result, retain the original whole-name fallback.
    if (!points.length) {
      try { addGeo(await window.geocode(dest)); }
      catch { /* geocoding is optional */ }
    }

    return { points, flags };
  }

  window.createTrip = async function createTrip() {
    const btn = document.getElementById('create-btn');
    const destEl = document.getElementById('m-dest');
    const dest = (destEl?.value || '').trim();
    if (!dest) { destEl?.focus(); return; }

    const dep = (document.getElementById('m-dep')?.value || '').trim();
    const ret = (document.getElementById('m-ret')?.value || '').trim();
    const trav = (document.getElementById('m-trav')?.value || '').trim() || '2';
    const status = document.getElementById('m-status')?.value || 'upcoming';
    const year = dep ? dep.split('/')[2] : new Date().getFullYear();
    const slugBase = dest.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const slug = `${slugBase}-${year}`;

    if (!btn) return;
    btn.textContent = 'Creating…';
    btn.disabled = true;

    try {
      let points = [];
      let flags = [];
      const cities = destinationParts(dest);
      try {
        const geo = await geocodeDestination(dest);
        points = geo.points;
        flags = geo.flags;
      } catch { /* geocoding is optional */ }

      const token = typeof window.getToken === 'function' ? await window.waitForToken?.() || window.getToken() : '';
      const res = await fetch('/trip-create.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': token,
        },
        body: JSON.stringify({
          slug, dest, dep, ret, trav, status,
          photo: currentPhoto(),
          points, flags, cities,
        }),
      });
      const data = await parseResponse(res);
      window.location.href = data.url || `/${slug}`;
    } catch (e) {
      console.error('createTrip error:', e);
      btn.textContent = 'Create itinerary →';
      btn.disabled = false;
      if (e && e.status === 409) {
        alert('A trip with this destination and year already exists. Open the existing trip or use a different destination name.');
      } else {
        alert('Could not create itinerary. No partial trip was saved. Please try again.');
      }
    }
  };
})();
