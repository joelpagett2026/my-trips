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

    // Refresh the no-keyboard baseline only when the viewport is essentially full.
    const currentInner = window.innerHeight || height;
    if (height >= currentInner - 80) baselineHeight = Math.max(height, currentInner);

    const keyboardOpen = baselineHeight - height > 140;
    overlay.classList.toggle('keyboard-open', keyboardOpen);
    overlay.style.setProperty('--entry-visual-height', height + 'px');
    overlay.style.setProperty('--entry-visual-top', top + 'px');

    // Override the older height variable too. itinerary-completion.js still
    // writes it during viewport events; this handler is registered later and
    // keeps both systems on the same visual-viewport measurement.
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

// The edit modal's Delete button historically called deleteCurrentItem(), but
// that function only looked at drawerItem. When an item is opened directly in
// the edit modal, editItem is populated while drawerItem can be null, so Delete
// silently returned without doing anything. Resolve either edit context.
(function () {
  if (typeof window === 'undefined') return;

  window.deleteCurrentItem = function deleteCurrentItemFixed() {
    let dayIdx = null;
    let itemIdx = -1;

    try {
      if (typeof editItem !== 'undefined' && editItem && editItem.item) {
        dayIdx = Number(editItem.dayIdx);
        const items = STATE.days?.[dayIdx]?.items || [];
        itemIdx = items.indexOf(editItem.item);
        if (itemIdx < 0 && Number.isInteger(Number(editItem.itemIdx))) itemIdx = Number(editItem.itemIdx);
      }
    } catch (_) {}

    try {
      if ((dayIdx === null || itemIdx < 0) && typeof drawerItem !== 'undefined' && drawerItem) {
        dayIdx = Number(drawerItem.dayIdx);
        const items = STATE.days?.[dayIdx]?.items || [];
        itemIdx = Number.isInteger(Number(drawerItem.itemIdx))
          ? Number(drawerItem.itemIdx)
          : items.indexOf(drawerItem.item);
      }
    } catch (_) {}

    if (!Number.isInteger(dayIdx) || dayIdx < 0 || !Number.isInteger(itemIdx) || itemIdx < 0) {
      console.warn('Delete activity: no valid item target');
      return;
    }

    const items = STATE.days?.[dayIdx]?.items;
    if (!Array.isArray(items) || itemIdx >= items.length) return;
    if (!window.confirm('Delete this activity?')) return;

    try { if (typeof takeSnapshot === 'function') takeSnapshot(); } catch (_) {}
    items.splice(itemIdx, 1);

    try { if (typeof closeDrawer === 'function') closeDrawer(); } catch (_) {}
    try { if (typeof closeModal === 'function') closeModal(); } catch (_) {}
    try { if (typeof scheduleSave === 'function') scheduleSave(); } catch (_) {}
    try { if (typeof render === 'function') render(); } catch (_) {}
  };
})();