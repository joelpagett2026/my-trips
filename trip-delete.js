// MY TRIPS — safe itinerary deletion
// Replaces the legacy delete-record-then-best-effort-registry-cleanup flow with
// one atomic server transaction.
(function () {
  if (typeof window === 'undefined') return;

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

  window.confirmDeleteTrip = async function confirmDeleteTrip() {
    const btn = document.getElementById('dt-confirm-btn');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = 'Deleting…';

    try {
      const token = typeof window.waitForToken === 'function'
        ? await window.waitForToken()
        : (typeof window.getToken === 'function' ? window.getToken() : '');
      const res = await fetch('/trip-delete.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': token,
        },
        body: JSON.stringify({ id: RECORD_ID }),
      });
      await parseResponse(res);
      window.location.href = '/trips/';
    } catch (e) {
      console.error('Delete trip failed:', e);
      btn.disabled = false;
      btn.textContent = 'Delete permanently';
      alert('Could not delete trip. Nothing was partially deleted; please try again.');
    }
  };
})();
