// Live Budget dashboard enhancement for the V2 itinerary.
// Loaded only on pages that contain #budget-main (see auth.js).
(function () {
  'use strict';

  const css = `
  /* ══ LIVE BUDGET REDESIGN ═══════════════════════════════════════ */
  #view-budget { background:#eef0f1; }
  #budget-main { background:#eef0f1; }
  #budget-main .bv-hero {
    position:relative; overflow:hidden; color:#fff;
    background:linear-gradient(125deg,#155f6c 0%,#0e7a87 52%,#15958e 100%);
    padding:28px 30px 26px; border-radius:0; box-shadow:none;
    min-height:205px;
  }
  #budget-main .bv-hero::after {
    content:''; position:absolute; inset:auto -8% -65% 42%; height:210px;
    background:radial-gradient(circle,rgba(255,255,255,.11),transparent 68%);
    pointer-events:none;
  }
  #budget-main .bv-hero-label { font-size:11px; text-transform:uppercase; letter-spacing:.09em; font-weight:800; color:rgba(255,255,255,.75); }
  #budget-main .bv-hero-amount { font-size:48px; line-height:1; margin-top:8px; font-weight:800; letter-spacing:-.045em; color:#fff; }
  #budget-main .bv-hero-sub { margin-top:9px; font-size:12.5px; font-weight:500; color:rgba(255,255,255,.78); }
  #budget-main .bv-hero-badges { display:flex; gap:9px; flex-wrap:wrap; margin-top:21px; position:relative; z-index:2; }
  #budget-main .bv-hero-badge { display:inline-flex; align-items:center; gap:6px; padding:7px 12px; border:1px solid rgba(255,255,255,.13); border-radius:999px; background:rgba(255,255,255,.11); color:#fff; font-size:11px; font-weight:700; backdrop-filter:blur(5px); }
  #budget-main .bv-hero-badge svg { width:13px; height:13px; }

  .bv-live-stats { position:absolute; top:52px; right:30px; display:flex; align-items:stretch; z-index:2; }
  .bv-live-stat { min-width:128px; padding:8px 22px; border-left:1px solid rgba(255,255,255,.18); display:flex; gap:10px; align-items:center; }
  .bv-live-stat:first-child { border-left:1px solid rgba(255,255,255,.18); }
  .bv-live-stat-ico { width:28px; height:28px; display:grid; place-items:center; color:rgba(255,255,255,.7); }
  .bv-live-stat-ico svg { width:21px; height:21px; fill:none; stroke:currentColor; stroke-width:1.8; }
  .bv-live-stat b { display:block; color:#fff; font-size:18px; line-height:1.1; font-weight:800; white-space:nowrap; }
  .bv-live-stat span { display:block; margin-top:3px; color:rgba(255,255,255,.72); font-size:10.5px; font-weight:500; white-space:nowrap; }

  #budget-main .bv-tiles { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:0; background:#fff; border-bottom:1px solid rgba(0,0,0,.07); box-shadow:0 2px 12px rgba(0,0,0,.06); }
  #budget-main .bv-tile { position:relative; min-height:112px; padding:17px 18px 14px 62px; border-right:1px solid rgba(0,0,0,.06); background:#fff; border-radius:0; box-shadow:none; }
  #budget-main .bv-tile:last-child { border-right:0; }
  #budget-main .bv-tile-icon { position:absolute; left:18px; top:17px; width:29px; height:29px; border-radius:8px; display:grid; place-items:center; }
  #budget-main .bv-tile-icon svg { width:15px; height:15px; }
  #budget-main .bv-tile-label { margin-top:32px; font-size:9.5px; text-transform:uppercase; letter-spacing:.07em; font-weight:800; color:#8a999f; }
  #budget-main .bv-tile-val { margin-top:3px; font-size:18px; font-weight:800; color:#17242a; }
  #budget-main .bv-tile-count { margin-top:2px; font-size:10px; color:#93a0a6; }
  #budget-main .bv-tile-bar-wrap { position:absolute; left:18px; right:18px; bottom:12px; height:3px; background:#edf0f1; border-radius:4px; overflow:hidden; }
  #budget-main .bv-tile-bar { height:100%; border-radius:4px; }

  #budget-main .bv-breakdown { padding:20px 20px 0; }
  #budget-main .bv-breakdown-title { margin:0 3px 11px; font-size:10px; text-transform:uppercase; letter-spacing:.08em; font-weight:800; color:#7c898f; }
  #budget-main .bv-grid { display:grid; grid-template-columns:1.05fr 1.18fr 1fr; gap:14px; align-items:start; }
  #budget-main .bv-panel { background:#fff; border-radius:14px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.065); border:1px solid rgba(0,0,0,.025); }
  #budget-main .bv-panel-head { min-height:49px; padding:10px 13px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #edf0f1; }
  #budget-main .bv-panel-head-left { display:flex; align-items:center; gap:9px; min-width:0; }
  #budget-main .bv-panel-head-ico { width:30px; height:30px; border-radius:8px; display:grid; place-items:center; flex:0 0 auto; background:rgba(14,122,135,.10)!important; color:#0e7a87!important; }
  #budget-main .bv-panel-head-ico svg { width:15px; height:15px; }
  #budget-main .bv-panel-title { font-size:11px; text-transform:uppercase; letter-spacing:.055em; font-weight:800; color:#40555e; }
  #budget-main .bv-panel-subcount { margin-left:6px; font-size:9px; font-weight:500; text-transform:none; letter-spacing:0; color:#93a0a6; }
  #budget-main .bv-panel-total { font-size:13.5px; font-weight:800; color:#0f6671; }
  #budget-main .bv-panel-body { background:#fff; }
  #budget-main .bv-row { min-height:58px; padding:10px 13px; display:flex; align-items:flex-start; gap:10px; border-bottom:1px solid #edf0f1; }
  #budget-main .bv-row:last-child { border-bottom:0; }
  #budget-main .bv-row-ico-wrap { width:29px; height:29px; border-radius:8px; flex:0 0 auto; display:grid; place-items:center; margin-top:1px; }
  #budget-main .bv-row-ico-wrap svg { width:14px; height:14px; }
  #budget-main .bv-row-info { min-width:0; flex:1; }
  #budget-main .bv-row-name { font-size:11.5px; line-height:1.3; font-weight:700; color:#15232a; }
  #budget-main .bv-row-meta { margin-top:3px; font-size:9.5px; line-height:1.4; color:#8d9ba1; }
  #budget-main .bv-row-tag { display:inline-block; margin-top:3px; font-size:8.5px; text-transform:uppercase; letter-spacing:.035em; color:#74858c; }
  #budget-main .bv-row-right { text-align:right; flex:0 0 auto; padding-left:5px; }
  #budget-main .bv-row-cost { font-size:11.5px; font-weight:800; color:#14242b; white-space:nowrap; }
  #budget-main .bv-row-sub { margin-top:2px; font-size:8.5px; color:#a1adb1; }
  #budget-main .bv-row-avios { margin-top:3px; font-size:8.5px; color:#526B82; font-weight:700; }
  #budget-main .bv-avios-input { width:75px; max-width:100%; font:inherit; font-size:8.5px; border:0; border-bottom:1px solid #d9e0e2; outline:0; background:transparent; }
  #budget-main .bv-panel-foot { padding:10px 13px; border-top:1px solid #e9edef; background:#fbfcfc; }
  #budget-main .bv-foot-row { display:flex; justify-content:space-between; gap:12px; padding:2px 0; font-size:10px; font-weight:700; color:#5b6d75; }
  #budget-main .bv-foot-row span:last-child { color:#0f6671; }

  .bv-live-hotel-row .bv-row-ico-wrap { display:none!important; }
  .bv-live-hotel-photo { width:64px; height:52px; border-radius:9px; background:#e4e9ea center/cover no-repeat; flex:0 0 auto; }
  .bv-live-hotel-tags { display:flex; gap:5px; flex-wrap:wrap; margin-top:6px; }
  .bv-live-chip { padding:3px 7px; border-radius:999px; border:1px solid #d9e3e5; background:#fff; color:#587078; font-size:8px; font-weight:600; }
  .bv-live-chip.confirmed { border-color:#b8dec1; background:#f0faf2; color:#28763c; }

  .bv-live-group { padding:7px 13px; display:flex; align-items:center; gap:7px; background:#f5f7f8; border-top:1px solid #edf0f1; border-bottom:1px solid #edf0f1; font-size:8.5px; text-transform:uppercase; letter-spacing:.07em; font-weight:800; color:#526B82; }
  .bv-live-group:first-child { border-top:0; }
  .bv-live-group-count { margin-left:auto; color:#9aa7ac; font-weight:600; text-transform:none; letter-spacing:0; }

  .bv-live-grand { margin:14px 20px 20px; background:#fff; border-radius:14px; min-height:70px; padding:14px 18px; display:flex; align-items:center; justify-content:space-between; gap:16px; box-shadow:0 2px 12px rgba(0,0,0,.06); }
  .bv-live-grand-left { display:flex; align-items:center; gap:12px; }
  .bv-live-grand-icon { width:40px; height:40px; border-radius:10px; display:grid; place-items:center; background:rgba(14,122,135,.10); color:#0e7a87; font-size:22px; font-weight:800; }
  .bv-live-grand-title { font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.045em; color:#42565e; }
  .bv-live-grand-sub { margin-top:3px; font-size:9.5px; color:#8b999f; }
  .bv-live-grand-price { text-align:right; }
  .bv-live-grand-price strong { display:block; color:#0f6671; font-size:25px; font-weight:800; letter-spacing:-.025em; }
  .bv-live-grand-price span { display:block; margin-top:2px; font-size:9.5px; color:#89979d; }

  #budget-main .bv-footer { margin:0 20px 12px; padding:12px 14px; border-radius:12px; background:rgba(255,255,255,.65); box-shadow:none; color:#718087; }
  #budget-main .bv-footer-ico { color:#0e7a87; }
  #budget-main .bv-export-bar { padding:0 20px 22px; }
  #budget-main .bv-export-btn { border-radius:9px; background:#0e7a87; font-size:10px; padding:8px 13px; }

  @media (max-width:1180px) {
    .bv-live-stats { position:static; margin-top:18px; }
    #budget-main .bv-hero { min-height:auto; }
    #budget-main .bv-grid { grid-template-columns:1fr 1fr; }
    #budget-main .bv-grid .bv-panel:last-child { grid-column:1/-1; }
  }
  @media (max-width:820px) {
    #budget-main .bv-tiles { grid-template-columns:1fr 1fr; }
    #budget-main .bv-tile:nth-child(2) { border-right:0; }
    #budget-main .bv-grid { grid-template-columns:1fr; }
    #budget-main .bv-grid .bv-panel:last-child { grid-column:auto; }
    .bv-live-stats { flex-wrap:wrap; gap:8px; }
    .bv-live-stat { padding:5px 14px; min-width:105px; }
  }
  @media (max-width:560px) {
    #budget-main .bv-hero { padding:21px 17px; }
    #budget-main .bv-hero-amount { font-size:39px; }
    #budget-main .bv-breakdown { padding:14px 10px 0; }
    #budget-main .bv-tiles { grid-template-columns:1fr; }
    #budget-main .bv-tile { border-right:0; border-bottom:1px solid #edf0f1; }
    .bv-live-grand { margin:12px 10px 16px; }
    #budget-main .bv-footer { margin-left:10px; margin-right:10px; }
    #budget-main .bv-export-bar { padding-left:10px; padding-right:10px; }
  }
  `;

  function injectStyles() {
    if (document.getElementById('budget-live-redesign-style')) return;
    const s = document.createElement('style');
    s.id = 'budget-live-redesign-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function svgUsers(){return '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>';}
  function svgCalendar(){return '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';}
  function svgWallet(){return '<svg viewBox="0 0 24 24"><path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v10a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V6"/><path d="M16 13h4"/></svg>';}

  function moneyNumber(text) {
    const n = parseFloat(String(text||'').replace(/[^0-9.]/g,''));
    return isFinite(n) ? n : 0;
  }

  function addHeroStats(root) {
    const hero = root.querySelector('.bv-hero');
    if (!hero || hero.querySelector('.bv-live-stats')) return;
    const amount = moneyNumber(root.querySelector('.bv-hero-amount')?.textContent);
    const tripState = typeof STATE !== 'undefined' ? STATE : null;
    const travellers = Number((tripState && tripState.meta && tripState.meta.trav) || new URLSearchParams(location.search).get('trav') || 1) || 1;
    const days = (tripState && Array.isArray(tripState.days)) ? tripState.days.length : 0;
    const daily = days ? amount / days : 0;
    const stats = document.createElement('div');
    stats.className = 'bv-live-stats';
    stats.innerHTML = `
      <div class="bv-live-stat"><div class="bv-live-stat-ico">${svgUsers()}</div><div><b>${travellers}</b><span>Traveller${travellers===1?'':'s'}</span></div></div>
      <div class="bv-live-stat"><div class="bv-live-stat-ico">${svgCalendar()}</div><div><b>${days || '—'}</b><span>Days</span></div></div>
      <div class="bv-live-stat"><div class="bv-live-stat-ico">${svgWallet()}</div><div><b>${daily ? '£'+daily.toFixed(2) : '—'}</b><span>Daily average</span></div></div>`;
    hero.appendChild(stats);
    hero.querySelectorAll('.bv-hero-badge').forEach(b => {
      if (/\bTravel\b/.test(b.textContent)) b.childNodes[b.childNodes.length-1].textContent = b.childNodes[b.childNodes.length-1].textContent.replace('Travel','Transport');
    });
  }

  function enhanceHotels(root) {
    const panel = root.querySelector('.bv-grid .bv-panel:nth-child(1)');
    if (!panel) return;
    const rows = [...panel.querySelectorAll('.bv-panel-body > .bv-row')];
    const tripState = typeof STATE !== 'undefined' ? STATE : null;
    const hotels = (tripState && tripState.meta && Array.isArray(tripState.meta.hotels)) ? tripState.meta.hotels : [];
    rows.forEach((row, i) => {
      if (row.classList.contains('bv-live-hotel-row')) return;
      row.classList.add('bv-live-hotel-row');
      const h = hotels[i] || {};
      const pic = document.createElement('div');
      pic.className = 'bv-live-hotel-photo';
      if (h.photo) pic.style.backgroundImage = `url('${String(h.photo).replace(/'/g,"\\'")}')`;
      row.insertBefore(pic, row.firstChild);
      const info = row.querySelector('.bv-row-info');
      if (info) {
        const chips = document.createElement('div');
        chips.className = 'bv-live-hotel-tags';
        chips.innerHTML = `<span class="bv-live-chip confirmed">Confirmed</span>${h.nights ? `<span class="bv-live-chip">${h.nights} night${Number(h.nights)===1?'':'s'}</span>` : ''}${h.breakfast==='included' ? '<span class="bv-live-chip">Breakfast incl.</span>' : ''}`;
        info.appendChild(chips);
      }
    });
  }

  function addGrandTotal(root) {
    if (root.querySelector('.bv-live-grand')) return;
    const amount = root.querySelector('.bv-hero-amount')?.textContent || '—';
    const sub = root.querySelector('.bv-hero-sub')?.textContent || '';
    const grand = document.createElement('div');
    grand.className = 'bv-live-grand';
    grand.innerHTML = `<div class="bv-live-grand-left"><div class="bv-live-grand-icon">£</div><div><div class="bv-live-grand-title">Total Trip Cost</div><div class="bv-live-grand-sub">All costs for your trip</div></div></div><div class="bv-live-grand-price"><strong>${amount}</strong><span>${sub.split('·')[0].trim()}</span></div>`;
    const footer = root.querySelector('.bv-footer');
    if (footer) root.insertBefore(grand, footer); else root.appendChild(grand);
  }

  function enhanceBudget() {
    injectStyles();
    const root = document.getElementById('budget-main');
    if (!root || !root.querySelector('.bv-hero')) return;
    addHeroStats(root);
    enhanceHotels(root);
    addGrandTotal(root);
  }

  function patchRenderer() {
    if (window.__budgetLivePatched) return;
    if (typeof window.renderBudgetView !== 'function') { setTimeout(patchRenderer, 50); return; }
    window.__budgetLivePatched = true;
    const original = window.renderBudgetView;
    window.renderBudgetView = function () {
      const result = original.apply(this, arguments);
      requestAnimationFrame(enhanceBudget);
      return result;
    };
    enhanceBudget();
  }

  injectStyles();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', patchRenderer, {once:true});
  else patchRenderer();
})();
