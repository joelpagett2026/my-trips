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

// iOS Safari's visual viewport shrinks and pans when the keyboard opens. The
// activity editor used to shrink its height while remaining anchored to the
// layout viewport's bottom edge, which pushed the whole sheet downward and
// produced the large blank/overlapping areas seen while typing. Keep the sheet
// explicitly aligned to the currently visible viewport instead.
(function () {
  if (typeof window === 'undefined' || !window.matchMedia || !window.matchMedia('(max-width: 768px)').matches) return;
  if (window.__mobileEntryKeyboardStable) return;
  window.__mobileEntryKeyboardStable = true;

  const style = document.createElement('style');
  style.id = 'mobile-entry-keyboard-stability';
  style.textContent = `
    @media (max-width:768px) {
      #modal-overlay .modal {
        top:var(--entry-viewport-top, 0px) !important;
        bottom:auto !important;
        height:var(--entry-viewport-height, 94dvh) !important;
        max-height:var(--entry-viewport-height, 94dvh) !important;
      }
    }
  `;
  document.head.appendChild(style);

  function syncEntryViewport() {
    const overlay = document.getElementById('modal-overlay');
    const modal = overlay?.querySelector('.modal');
    if (!overlay || !modal || !overlay.classList.contains('open')) return;

    const vv = window.visualViewport;
    const height = Math.max(320, Math.round(vv?.height || window.innerHeight || 640));
    const top = Math.max(0, Math.round(vv?.offsetTop || 0));
    modal.style.setProperty('--entry-viewport-height', height + 'px');
    modal.style.setProperty('--entry-viewport-top', top + 'px');
  }

  const queueSync = () => requestAnimationFrame(syncEntryViewport);

  document.addEventListener('focusin', event => {
    if (!event.target?.closest?.('#modal-overlay input, #modal-overlay textarea, #modal-overlay select')) return;
    queueSync();
    window.setTimeout(syncEntryViewport, 80);
    window.setTimeout(syncEntryViewport, 260);
  }, true);

  document.addEventListener('focusout', event => {
    if (!event.target?.closest?.('#modal-overlay input, #modal-overlay textarea, #modal-overlay select')) return;
    window.setTimeout(syncEntryViewport, 80);
    window.setTimeout(syncEntryViewport, 300);
  }, true);

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', queueSync, { passive:true });
    window.visualViewport.addEventListener('scroll', queueSync, { passive:true });
  }
  window.addEventListener('orientationchange', () => window.setTimeout(syncEntryViewport, 180), { passive:true });

  const overlay = document.getElementById('modal-overlay');
  if (overlay) {
    new MutationObserver(() => {
      if (overlay.classList.contains('open')) queueSync();
    }).observe(overlay, { attributes:true, attributeFilter:['class'] });
  }
})();
