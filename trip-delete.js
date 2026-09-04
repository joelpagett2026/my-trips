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
// IMPORTANT: itinerary-completion.js injects its mobile modal CSS from its init
// routine. Depending on parser/DOMContentLoaded timing, that CSS can be appended
// after scripts that appear later in the document. Earlier fullscreen overrides
// were therefore being silently overwritten and the editor reverted to the old
// bottom-sheet geometry as soon as a field received focus.
//
// This installer deliberately runs after DOMContentLoaded when necessary and
// also applies the shell geometry as inline !important styles. That makes the
// fullscreen contract independent of stylesheet insertion order. iOS is allowed
// to change only the visible height; the editor always remains pinned to top:0.
(function () {
  if (typeof window === 'undefined') return;
  const MOBILE_QUERY = '(max-width: 768px)';
  const isMobile = () => !!(window.matchMedia && window.matchMedia(MOBILE_QUERY).matches);
  let raf = 0;
  let overlayObserver = null;
  let resizeBound = false;

  function setImportant(el, property, value) {
    if (el) el.style.setProperty(property, value, 'important');
  }

  function ensureFinalStyle() {
    if (!document.head || document.getElementById('mobile-entry-fullscreen-v5')) return;
    ['mobile-entry-fullscreen-v3', 'mobile-entry-fullscreen-v4'].forEach(id => {
      document.getElementById(id)?.remove();
    });

    const style = document.createElement('style');
    style.id = 'mobile-entry-fullscreen-v5';
    style.textContent = `
      @media (max-width:768px) {
        #modal-overlay .modal::before { display:none !important; content:none !important; }

        #modal-overlay .modal-head {
          flex:0 0 auto !important;
          display:grid !important;
          grid-template-columns:minmax(102px,.72fr) minmax(0,1.18fr) 42px !important;
          align-items:center !important;
          gap:6px !important;
          padding:calc(10px + env(safe-area-inset-top,0px)) 12px 10px !important;
          border-radius:0 !important;
          background:#fff !important;
        }
        #modal-overlay .modal-title {
          min-width:0 !important;
          margin:0 !important;
          padding:0 !important;
          white-space:nowrap !important;
        }
        #modal-overlay .modal-tabs {
          grid-column:auto !important;
          width:100% !important;
          min-width:0 !important;
          margin:0 !important;
        }
        #modal-overlay .modal-close {
          position:static !important;
          justify-self:end !important;
          margin:0 !important;
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
          scroll-padding-bottom:96px !important;
        }

        #modal-overlay .modal-foot {
          position:relative !important;
          flex:0 0 auto !important;
          display:flex !important;
          align-items:center !important;
          gap:10px !important;
          width:100% !important;
          grid-template-columns:none !important;
          padding:12px 14px calc(12px + env(safe-area-inset-bottom,0px)) !important;
          background:#fff !important;
          border-top:1px solid rgba(100,120,128,.13) !important;
          box-shadow:0 -8px 20px rgba(20,35,45,.055) !important;
        }
        #modal-overlay .modal-foot .modal-btn.secondary { display:none !important; }
        #modal-overlay #modal-save-btn {
          display:block !important;
          flex:1 1 auto !important;
          width:auto !important;
          min-width:0 !important;
        }
        #modal-overlay #modal-delete-btn { flex:0 0 auto !important; }
      }

      @media (max-width:390px) {
        #modal-overlay .modal-head {
          grid-template-columns:minmax(96px,.7fr) minmax(0,1.1fr) 38px !important;
          padding-left:10px !important;
          padding-right:10px !important;
          gap:5px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function releaseShell() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;
    overlay.style.removeProperty('--entry-fullscreen-height');
    const active = document.activeElement;
    if (active && active.closest?.('#modal-overlay') && typeof active.blur === 'function') active.blur();
  }

  function applyShell() {
    raf = 0;
    if (!isMobile()) return;
    const overlay = document.getElementById('modal-overlay');
    const modal = overlay?.querySelector('.modal');
    if (!overlay || !modal) return;

    ensureFinalStyle();
    overlay.dataset.fullscreenShell = 'v5';

    const vv = window.visualViewport;
    const height = Math.max(320, Math.round(vv?.height || window.innerHeight || 640));

    // Inline !important geometry is intentional. It prevents the legacy mobile
    // bottom-sheet CSS from winning later due to stylesheet insertion order.
    setImportant(overlay, 'position', 'fixed');
    setImportant(overlay, 'left', '0');
    setImportant(overlay, 'right', '0');
    setImportant(overlay, 'top', '0');
    setImportant(overlay, 'bottom', 'auto');
    setImportant(overlay, 'width', '100%');
    setImportant(overlay, 'height', height + 'px');
    setImportant(overlay, 'min-height', '0');
    setImportant(overlay, 'padding', '0');
    setImportant(overlay, 'margin', '0');
    setImportant(overlay, 'align-items', 'stretch');
    setImportant(overlay, 'justify-content', 'stretch');
    setImportant(overlay, 'overflow', 'hidden');
    setImportant(overlay, 'background', '#fff');
    setImportant(overlay, 'transform', 'none');
    setImportant(overlay, 'overscroll-behavior', 'none');

    setImportant(modal, 'position', 'relative');
    setImportant(modal, 'left', 'auto');
    setImportant(modal, 'right', 'auto');
    setImportant(modal, 'top', 'auto');
    setImportant(modal, 'bottom', 'auto');
    setImportant(modal, 'width', '100%');
    setImportant(modal, 'max-width', 'none');
    setImportant(modal, 'min-width', '0');
    setImportant(modal, 'height', '100%');
    setImportant(modal, 'max-height', 'none');
    setImportant(modal, 'margin', '0');
    setImportant(modal, 'padding', '0');
    setImportant(modal, 'border-radius', '0');
    setImportant(modal, 'box-shadow', 'none');
    setImportant(modal, 'transform', 'none');
    setImportant(modal, 'contain', 'none');
    setImportant(modal, 'overflow', 'hidden');
    setImportant(modal, 'background', '#fff');
    setImportant(modal, 'display', 'flex');
    setImportant(modal, 'flex-direction', 'column');

    const head = modal.querySelector('.modal-head');
    const tabs = modal.querySelector('.modal-tabs');
    const foot = modal.querySelector('.modal-foot');
    const save = modal.querySelector('#modal-save-btn');
    const secondary = foot?.querySelector('.modal-btn.secondary');

    setImportant(head, 'display', 'grid');
    setImportant(head, 'grid-template-columns', window.matchMedia('(max-width:390px)').matches
      ? 'minmax(96px,.7fr) minmax(0,1.1fr) 38px'
      : 'minmax(102px,.72fr) minmax(0,1.18fr) 42px');
    setImportant(tabs, 'grid-column', 'auto');
    setImportant(foot, 'display', 'flex');
    setImportant(foot, 'grid-template-columns', 'none');
    setImportant(secondary, 'display', 'none');
    setImportant(save, 'display', 'block');
    setImportant(save, 'flex', '1 1 auto');
    setImportant(save, 'width', 'auto');
  }

  function queueApply() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(applyShell);
  }

  function observeOverlay() {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay || overlay.dataset.fullscreenObserver === 'v5') return;
    overlay.dataset.fullscreenObserver = 'v5';

    overlayObserver?.disconnect();
    overlayObserver = new MutationObserver(() => {
      if (overlay.classList.contains('open')) {
        queueApply();
        window.setTimeout(queueApply, 40);
        window.setTimeout(queueApply, 160);
      } else {
        releaseShell();
      }
    });
    overlayObserver.observe(overlay, { attributes:true, attributeFilter:['class'] });
  }

  function bindViewportEvents() {
    if (resizeBound) return;
    resizeBound = true;
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', queueApply, { passive:true });
    }
    window.addEventListener('resize', queueApply, { passive:true });
    window.addEventListener('orientationchange', () => window.setTimeout(queueApply, 120), { passive:true });
    document.addEventListener('focusin', event => {
      if (!event.target?.closest?.('#modal-overlay input, #modal-overlay textarea, #modal-overlay select')) return;
      queueApply();
      window.setTimeout(queueApply, 60);
      window.setTimeout(queueApply, 180);
      window.setTimeout(queueApply, 320);
    }, true);
  }

  function install() {
    if (!isMobile()) return;
    if (window.__mobileEntryFullscreenV5) {
      queueApply();
      return;
    }
    window.__mobileEntryFullscreenV5 = true;
    ensureFinalStyle();
    observeOverlay();
    bindViewportEvents();
    queueApply();
  }

  // itinerary-completion.js may append its stylesheet during DOMContentLoaded.
  // Register after it so our fullscreen contract is appended afterwards too.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      install();
      window.setTimeout(install, 0);
    }, { once:true });
  } else {
    install();
    window.setTimeout(install, 0);
  }
})();
