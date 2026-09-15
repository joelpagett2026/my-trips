// Authenticated itinerary: final mobile Add/Edit modal layout compatibility rules.
(function () {
  // Trip Planning Overview polish applies at every viewport size.
  const overviewStyle = document.createElement('style');
  overviewStyle.id = 'trip-planning-overview-polish';
  overviewStyle.textContent = `
    #rp-readiness .tpo-icon { border-radius:50% !important; }
    #rp-readiness .tpo-cat--things .tpo-icon { border-radius:50% !important; }
    .rp2-section-head:has(+ #rp-readiness) { position:relative !important; padding-right:82px !important; }
    .rp2-section-head .tpo-progress-pct {
      position:absolute !important;
      right:12px !important;
      top:50% !important;
      transform:translateY(-50%) !important;
      width:max-content !important;
      min-width:48px !important;
      height:24px !important;
      margin:0 !important;
      padding:0 10px !important;
      display:flex !important;
      align-items:center !important;
      justify-content:center !important;
      border:1px solid rgba(255,255,255,.28) !important;
      border-radius:999px !important;
      background:rgba(255,255,255,.94) !important;
      box-shadow:0 1px 4px rgba(0,0,0,.12) !important;
      font-size:10px !important;
      line-height:1 !important;
      font-weight:800 !important;
      letter-spacing:.02em !important;
      color:#0e7a87 !important;
      z-index:3 !important;
    }
  `;
  document.head.appendChild(overviewStyle);

  function placeOverviewPercentage() {
    const root = document.getElementById('rp-readiness');
    const pill = root?.querySelector('.tpo-progress-pct');
    const header = root?.previousElementSibling;
    if (!pill || !header || !header.classList.contains('rp2-section-head')) return;
    if (pill.parentElement !== header) header.appendChild(pill);
  }

  const overviewRoot = document.getElementById('rp-readiness');
  if (overviewRoot) {
    const overviewObserver = new MutationObserver(placeOverviewPercentage);
    overviewObserver.observe(overviewRoot, { childList:true, subtree:true });
    placeOverviewPercentage();
  }

  if (!window.matchMedia || !window.matchMedia('(max-width: 768px)').matches) return;

  // Production kill-switch for the temporary Activity Editor touch diagnostics.
  // This lives in the filemtime-versioned mobile runtime so iOS cannot keep using
  // an older cached copy of activity-editor.js that still paints the debug panel.
  if (!window.__activityTouchDiagnostics) {
    window.__activityTouchDiagnostics = {
      version: 'disabled-production',
      enabled: false,
      snapshot() { return { enabled: false }; }
    };
  }

  function removeActivityDiagnostic() {
    const panel = document.getElementById('activity-touch-diagnostic');
    if (panel) panel.remove();
  }

  // Defence in depth: remove a panel if a previously cached diagnostic script
  // somehow executes before/alongside this runtime.
  const diagnosticObserver = new MutationObserver(removeActivityDiagnostic);
  diagnosticObserver.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(() => diagnosticObserver.disconnect(), 10000);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', removeActivityDiagnostic, { once: true });
  } else {
    removeActivityDiagnostic();
  }

  const style = document.createElement('style');
  style.id = 'mobile-entry-modal-layout-fix';
  style.textContent = `
    #activity-touch-diagnostic {
      display:none !important;
      visibility:hidden !important;
    }

    @media (max-width:768px) {
      /* Match the 18px Concert/mobile content rhythm across itinerary drawers. */
      .drawer .dr-head {
        padding-left:18px !important;
        padding-right:18px !important;
      }
      .drawer .dr-body {
        padding-left:18px !important;
        padding-right:18px !important;
        padding-bottom:calc(28px + env(safe-area-inset-bottom,0px)) !important;
      }
      .drawer .dr-title {
        line-height:1.24 !important;
      }
      .drawer .dr-kicker {
        margin-bottom:8px !important;
      }
      .drawer .dr-section-h {
        margin-bottom:12px !important;
      }

      #modal-overlay .modal-head {
        display:grid !important;
        grid-template-columns:minmax(104px,.72fr) minmax(170px,1.18fr) 40px !important;
        align-items:center !important;
        gap:6px !important;
        position:relative !important;
        padding:10px 18px 10px !important;
        min-height:0 !important;
      }
      #modal-overlay .modal-title {
        padding:0 !important;
        min-height:40px !important;
        display:flex !important;
        align-items:center !important;
        font-size:16px !important;
        line-height:1.24 !important;
        white-space:nowrap !important;
      }
      #modal-overlay .modal-tabs {
        grid-column:auto !important;
        display:flex !important;
        width:100% !important;
        min-width:0 !important;
        min-height:38px !important;
        margin:0 !important;
        padding:3px !important;
      }
      #modal-overlay .modal-tab {
        min-width:0 !important;
        min-height:32px !important;
        padding:6px 8px !important;
        font-size:10.5px !important;
        white-space:nowrap !important;
      }
      #modal-overlay .modal-close {
        position:static !important;
        width:40px !important;
        height:40px !important;
        min-width:40px !important;
        margin:0 !important;
        justify-self:end !important;
        z-index:5 !important;
      }
      html.ios-standalone #modal-overlay .modal-head {
        padding-top:calc(10px + env(safe-area-inset-top, 0px)) !important;
      }
      #modal-overlay .modal-body,
      #modal-overlay #modal-body-single,
      #modal-overlay #modal-body-bulk {
        min-height:0 !important;
        flex:1 1 0 !important;
        overflow-y:auto !important;
        padding:16px 18px 28px !important;
        scroll-padding-bottom:92px !important;
      }
      #modal-overlay .field-textarea {
        box-sizing:border-box !important;
        min-height:112px !important;
        max-height:180px !important;
        height:112px !important;
        padding:13px 14px !important;
        line-height:22px !important;
        overflow-y:auto !important;
        transform:none !important;
        -webkit-transform:none !important;
      }
      #modal-overlay .modal-foot {
        flex:0 0 auto !important;
        display:grid !important;
        grid-template-columns:minmax(110px,.42fr) minmax(0,1fr) !important;
        gap:10px !important;
        padding:10px 18px calc(10px + env(safe-area-inset-bottom,0px)) !important;
      }
      #modal-overlay .modal-foot .modal-btn {
        min-height:48px !important;
      }
    }
    @media (max-width:390px) {
      #modal-overlay .modal-head {
        grid-template-columns:minmax(96px,.68fr) minmax(154px,1.12fr) 38px !important;
        gap:5px !important;
        padding-left:18px !important;
        padding-right:18px !important;
      }
      #modal-overlay .modal-title { font-size:15px !important; }
      #modal-overlay .modal-close {
        width:38px !important;
        height:38px !important;
        min-width:38px !important;
      }
      #modal-overlay .modal-tab {
        padding-left:5px !important;
        padding-right:5px !important;
        font-size:10px !important;
      }
    }
  `;
  document.head.appendChild(style);
})();
