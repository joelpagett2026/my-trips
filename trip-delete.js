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

// Mobile activity editor shell.
//
// The add/edit form is a true full-screen surface on mobile. iOS Safari already
// positions fixed elements in the visual viewport while the keyboard is open.
// Applying visualViewport.offsetTop to another fixed element therefore moves it
// twice — exactly the failure where the itinerary becomes visible above the
// editor and only the bottom of the form remains above the keyboard.
//
// Keep the editor pinned to top:0 and use only visualViewport.height to size the
// visible shell. The body scrolls independently while the header and Save bar
// stay inside the visible screen. Save closes on success; X is the only manual
// dismiss action on mobile.
(function () {
  if (typeof window === 'undefined' || !window.matchMedia || !window.matchMedia('(max-width: 768px)').matches) return;
  if (window.__mobileEntryFullscreenV4) return;
  window.__mobileEntryFullscreenV4 = true;

  const style = document.createElement('style');
  style.id = 'mobile-entry-fullscreen-v4';
  style.textContent = `
    @media (max-width:768px) {
      #modal-overlay {
        position:fixed !important;
        left:0 !important;
        right:0 !important;
        top:0 !important;
        bottom:auto !important;
        width:100% !important;
        height:var(--entry-fullscreen-height, 100dvh) !important;
        min-height:0 !important;
        padding:0 !important;
        margin:0 !important;
        align-items:stretch !important;
        justify-content:stretch !important;
        overflow:hidden !important;
        background:#fff !important;
        transform:none !important;
        overscroll-behavior:none !important;
        touch-action:pan-y !important;
      }

      #modal-overlay .modal {
        position:relative !important;
        left:auto !important;
        right:auto !important;
        top:auto !important;
        bottom:auto !important;
        width:100% !important;
        max-width:none !important;
        min-width:0 !important;
        height:100% !important;
        max-height:none !important;
        margin:0 !important;
        border-radius:0 !important;
        box-shadow:none !important;
        transform:none !important;
        contain:none !important;
        overflow:hidden !important;
        background:#fff !important;
        display:flex !important;
        flex-direction:column !important;
      }

      #modal-overlay .modal::before { display:none !important; }

      #modal-overlay .modal-head {
        flex:0 0 auto !important;
        border-radius:0 !important;
        padding-top:calc(10px + env(safe-area-inset-top, 0px)) !important;
        background:#fff !important;
      }

      #modal-overlay .modal-body,
      #modal-overlay #modal-body-single,
      #modal-overlay #modal-body-bulk {
        flex:1 1 0 !important;
        min-height:0 !important;
        overflow-y:auto !important;
        overflow-x:hidden !important;
        -webkit-overflow-scrolling:touch !important;
        overscroll-behavior-y:contain !important;
        background:#fff !important;
      }

      #modal-overlay .modal-foot {
        flex:0 0 auto !important;
        display:flex !important;
        align-items:center !important;
        gap:10px !important;
        width:100% !important;
        padding:12px 14px calc(12px + env(safe-area-inset-bottom, 0px)) !important;
        background:#fff !important;
      }

      #modal-overlay .modal-foot .modal-btn.secondary { display:none !important; }
      #modal-overlay #modal-save-btn { flex:1 1 auto !important; width:auto !important; }
      #modal-overlay #modal-delete-btn { flex:0 0 auto !important; }
    }
  `;
  document.head.appendChild(style);

  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;

  let raf = 0;

  function syncVisibleViewport() {
    raf = 0;
    if (!overlay.classList.contains('open')) return;

    const vv = window.visualViewport;
    const height = Math.max(300, Math.round(vv?.height || window.innerHeight || 640));
    overlay.style.setProperty('--entry-fullscreen-height', height + 'px');
  }

  function queueSync() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(syncVisibleViewport);
  }

  function releaseViewportState() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    overlay.style.removeProperty('--entry-fullscreen-height');
    const active = document.activeElement;
    if (active && active.closest?.('#modal-overlay') && typeof active.blur === 'function') active.blur();
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', queueSync, { passive:true });
  }
  window.addEventListener('resize', queueSync, { passive:true });
  window.addEventListener('orientationchange', () => window.setTimeout(queueSync, 120), { passive:true });

  document.addEventListener('focusin', event => {
    if (!event.target?.closest?.('#modal-overlay input, #modal-overlay textarea, #modal-overlay select')) return;
    queueSync();
    window.setTimeout(queueSync, 80);
    window.setTimeout(queueSync, 220);
  }, true);

  new MutationObserver(() => {
    if (overlay.classList.contains('open')) {
      queueSync();
      window.setTimeout(queueSync, 80);
    } else {
      releaseViewportState();
    }
  }).observe(overlay, { attributes:true, attributeFilter:['class'] });

  if (overlay.classList.contains('open')) queueSync();
})();
