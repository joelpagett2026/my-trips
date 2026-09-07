// MY TRIPS — safe dashboard trip creation
// Replaces the legacy two-step "create itinerary, then save registry" flow with
// one atomic server transaction so partial failures cannot create orphaned data.
(function () {
  if (typeof window === 'undefined') return;

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
