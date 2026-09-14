(() => {
  const originalDbLoad = typeof window.dbLoad === 'function' ? window.dbLoad.bind(window) : null;
  const originalDbLoadRegistry = typeof window.dbLoadRegistry === 'function' ? window.dbLoadRegistry.bind(window) : null;
  const homepageRecords = new Set(['trip-registry', 'concerts', 'shows', 'parks']);
  let summaryPromise = null;

  async function getSummary() {
    if (summaryPromise) return summaryPromise;
    summaryPromise = (async () => {
      let token = '';
      if (typeof window.waitForToken === 'function') token = await window.waitForToken();
      else if (typeof window.getToken === 'function') token = window.getToken();
      if (!token) throw new Error('Authentication unavailable');

      const res = await fetch('/home-summary.php', {
        headers: { 'X-Auth-Token': token },
        credentials: 'same-origin'
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || json.ok === false || !json.data) {
        if (res.status === 401 && typeof window.signalAuthExpired === 'function') window.signalAuthExpired();
        throw new Error((json && json.error) || `Homepage summary failed (${res.status})`);
      }
      return json.data;
    })();

    try { return await summaryPromise; }
    catch (err) { summaryPromise = null; throw err; }
  }

  // Replace four large record downloads with one compact response. The returned
  // objects keep all statistics data but only retain the image used on each card.
  window.dbLoad = async function(id) {
    if (homepageRecords.has(id)) {
      try {
        const summary = await getSummary();
        if (Object.prototype.hasOwnProperty.call(summary, id)) return summary[id];
      } catch (err) {
        if (!originalDbLoad) throw err;
      }
    }
    return originalDbLoad ? originalDbLoad(id) : null;
  };
  try { dbLoad = window.dbLoad; } catch {}

  window.dbLoadRegistry = async function() {
    try {
      const summary = await getSummary();
      return summary['trip-registry']?.trips || [];
    } catch (err) {
      if (originalDbLoadRegistry) return originalDbLoadRegistry();
      throw err;
    }
  };
  try { dbLoadRegistry = window.dbLoadRegistry; } catch {}

  // Do not remove the coloured placeholder until the image really has loaded.
  // If decoding or loading fails, the fallback remains visible instead of a blank box.
  window.setImg = function(id, src) {
    const img = typeof window.$ === 'function' ? window.$(id) : document.getElementById(id);
    if (!img || !src) return;
    const placeholder = img.previousElementSibling;
    let settled = false;

    img.hidden = true;
    img.decoding = 'async';
    if (placeholder) placeholder.style.display = '';

    const reveal = () => {
      if (settled) return;
      settled = true;
      img.hidden = false;
      if (placeholder) placeholder.style.display = 'none';
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      img.hidden = true;
      if (placeholder) placeholder.style.display = '';
    };

    img.onload = reveal;
    img.onerror = fail;
    img.src = src;
    if (img.complete && img.naturalWidth > 0) queueMicrotask(reveal);
  };
  try { setImg = window.setImg; } catch {}
})();
