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

// Keep the activity editor inside iOS Safari's *visual* viewport while the
// keyboard opens. Important: move/size the overlay as one unit, rather than
// positioning the fixed modal itself. A fixed child plus visualViewport.offsetTop
// causes iOS's own viewport pan and our offset to be applied at the same time.
(function () {
  if (typeof window === 'undefined' || !window.matchMedia || !window.matchMedia('(max-width: 768px)').matches) return;
  if (window.__mobileEntryKeyboardStableV2) return;
  window.__mobileEntryKeyboardStableV2 = true;

  const style = document.createElement('style');
  style.id = 'mobile-entry-keyboard-stability-v2';
  style.textContent = `
    @media (max-width:768px) {
      #modal-overlay {
        position:fixed !important;
        left:0 !important;
        right:0 !important;
        top:0 !important;
        bottom:auto !important;
        width:100% !important;
        height:var(--entry-visual-height, 100dvh) !important;
        min-height:0 !important;
        transform:translate3d(0,var(--entry-visual-top, 0px),0) !important;
        align-items:flex-end !important;
        overflow:hidden !important;
      }
      #modal-overlay .modal {
        position:relative !important;
        left:auto !important;
        right:auto !important;
        top:auto !important;
        bottom:auto !important;
        width:100% !important;
        height:min(94dvh,var(--entry-visual-height, 100dvh)) !important;
        max-height:var(--entry-visual-height, 100dvh) !important;
        transform:none !important;
      }
      #modal-overlay.keyboard-open .modal {
        height:var(--entry-visual-height, 100dvh) !important;
        max-height:var(--entry-visual-height, 100dvh) !important;
        border-radius:18px 18px 0 0 !important;
      }
      #modal-overlay.keyboard-open .modal-foot {
        padding-bottom:12px !important;
      }
    }
  `;
  document.head.appendChild(style);

  let baselineHeight = Math.max(window.innerHeight || 0, window.visualViewport?.height || 0);
  let raf = 0;

  function syncEntryViewport() {
    raf = 0;
    const overlay = document.getElementById('modal-overlay');
    if (!overlay || !overlay.classList.contains('open')) return;

    const vv = window.visualViewport;
    const height = Math.max(280, Math.round(vv?.height || window.innerHeight || 640));
    const top = Math.max(0, Math.round(vv?.offsetTop || 0));

    const currentInner = window.innerHeight || height;
    if (height >= currentInner - 80) baselineHeight = Math.max(height, currentInner);

    const keyboardOpen = baselineHeight - height > 140;
    overlay.classList.toggle('keyboard-open', keyboardOpen);
    overlay.style.setProperty('--entry-visual-height', height + 'px');
    overlay.style.setProperty('--entry-visual-top', top + 'px');

    const modal = overlay.querySelector('.modal');
    if (modal) modal.style.setProperty('--entry-viewport-height', height + 'px');
  }

  function queueSync() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(syncEntryViewport);
  }

  document.addEventListener('focusin', event => {
    if (!event.target?.closest?.('#modal-overlay input, #modal-overlay textarea, #modal-overlay select')) return;
    queueSync();
    window.setTimeout(syncEntryViewport, 60);
    window.setTimeout(syncEntryViewport, 180);
    window.setTimeout(syncEntryViewport, 360);
  }, true);

  document.addEventListener('focusout', event => {
    if (!event.target?.closest?.('#modal-overlay input, #modal-overlay textarea, #modal-overlay select')) return;
    window.setTimeout(syncEntryViewport, 80);
    window.setTimeout(syncEntryViewport, 260);
    window.setTimeout(syncEntryViewport, 420);
  }, true);

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', queueSync, { passive:true });
    window.visualViewport.addEventListener('scroll', queueSync, { passive:true });
  }
  window.addEventListener('resize', queueSync, { passive:true });
  window.addEventListener('orientationchange', () => {
    window.setTimeout(() => {
      baselineHeight = Math.max(window.innerHeight || 0, window.visualViewport?.height || 0);
      syncEntryViewport();
    }, 220);
  }, { passive:true });

  const overlay = document.getElementById('modal-overlay');
  if (overlay) {
    new MutationObserver(() => {
      if (overlay.classList.contains('open')) {
        baselineHeight = Math.max(window.innerHeight || 0, window.visualViewport?.height || 0);
        queueSync();
      } else {
        overlay.classList.remove('keyboard-open');
        overlay.style.removeProperty('--entry-visual-height');
        overlay.style.removeProperty('--entry-visual-top');
      }
    }).observe(overlay, { attributes:true, attributeFilter:['class'] });
  }
})();
