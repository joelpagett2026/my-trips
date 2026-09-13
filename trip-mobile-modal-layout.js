// Authenticated itinerary: final mobile Add/Edit modal layout compatibility rules.
(function () {
  if (!window.matchMedia || !window.matchMedia('(max-width: 768px)').matches) return;
  const style = document.createElement('style');
  style.id = 'mobile-entry-modal-layout-fix';
  style.textContent = `
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
