// MY TRIPS — mobile map presentation layer
// Keeps the existing Google Maps/data logic intact while giving the map view a
// mobile-first layout: day tabs are the source of truth, category controls are
// compact, the location list is hidden, and one selected-place card floats over
// the bottom of the map.
(function () {
  const MOBILE = '(max-width: 768px)';

  function isMobile() {
    return window.matchMedia && window.matchMedia(MOBILE).matches;
  }

  function mapVisible() {
    const view = document.getElementById('view-map');
    return !!view && getComputedStyle(view).display !== 'none';
  }

  function injectStyles() {
    if (document.getElementById('map-mobile-redesign-style')) return;
    const style = document.createElement('style');
    style.id = 'map-mobile-redesign-style';
    style.textContent = `
      @media (max-width: 768px) {
        #view-map {
          flex-direction: column !important;
          position: relative !important;
          overflow: hidden !important;
          background: #fff !important;
        }

        /* The day strip already controls the day. Remove the duplicate dropdown. */
        #view-map .mf-select { display: none !important; }

        /* Controls become a single lightweight strip above the map. */
        #view-map .map-sidebar {
          width: 100% !important;
          height: 84px !important;
          min-height: 84px !important;
          flex: 0 0 84px !important;
          border-right: 0 !important;
          border-bottom: 1px solid var(--line) !important;
          background: #fff !important;
          overflow: hidden !important;
          z-index: 4;
        }
        #view-map .map-filters {
          padding: 8px 12px 7px !important;
          height: 100% !important;
          box-sizing: border-box !important;
          display: flex !important;
          align-items: center !important;
        }
        #view-map .mf-row-icons {
          width: 100% !important;
          margin: 0 !important;
          display: flex !important;
          align-items: flex-start !important;
          justify-content: space-between !important;
          gap: 4px !important;
          flex-wrap: nowrap !important;
        }
        #view-map .mf-icon-wrap {
          min-width: 48px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          color: var(--text3);
          font-size: 9px;
          line-height: 1;
          font-weight: 700;
          white-space: nowrap;
        }
        #view-map .mf-icon-btn {
          width: 42px !important;
          height: 42px !important;
          flex: 0 0 42px !important;
          border-width: 1.5px !important;
          background: #fff !important;
          box-shadow: none !important;
        }
        #view-map .mf-icon-btn svg { width: 18px !important; height: 18px !important; }
        #view-map .mf-icon-btn.active {
          background: var(--mf-c) !important;
          color: #fff !important;
          border-color: var(--mf-c) !important;
        }
        #view-map .mf-icon-wrap:has(.mf-icon-btn.active) { color: var(--mf-c); }

        /* The old permanent card carousel is no longer part of the mobile layout. */
        #view-map .map-list { display: none !important; }

        /* The map gets all remaining space. */
        #view-map #map-canvas {
          flex: 1 1 auto !important;
          min-height: 0 !important;
          width: 100% !important;
          height: auto !important;
        }

        /* Single selected-place bottom sheet. */
        #map-mobile-place-card {
          position: absolute;
          left: 12px;
          right: 12px;
          bottom: calc(12px + env(safe-area-inset-bottom, 0px));
          z-index: 20;
          display: none;
          align-items: center;
          gap: 11px;
          min-height: 78px;
          padding: 11px 12px;
          box-sizing: border-box;
          background: rgba(255,255,255,.97);
          border: 1px solid rgba(25,45,55,.10);
          border-radius: 16px;
          box-shadow: 0 8px 28px rgba(21,45,55,.18);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }
        #map-mobile-place-card.is-visible { display: flex; }
        .mmc-accent {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 42px;
          color: #fff;
          background: #0e7a87;
        }
        .mmc-accent svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2.1; stroke-linecap: round; stroke-linejoin: round; }
        .mmc-copy { min-width: 0; flex: 1; }
        .mmc-type {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .07em;
          text-transform: uppercase;
          color: #0e7a87;
          margin-bottom: 3px;
        }
        .mmc-name {
          font-size: 14px;
          line-height: 1.18;
          font-weight: 800;
          color: var(--text);
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .mmc-meta {
          margin-top: 3px;
          font-size: 10.5px;
          line-height: 1.2;
          color: var(--text3);
          font-weight: 500;
        }
        .mmc-close {
          width: 34px;
          height: 34px;
          flex: 0 0 34px;
          border: 0;
          border-radius: 50%;
          background: var(--teal-xdim, rgba(14,122,135,.10));
          color: var(--teal, #0e7a87);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .mmc-close svg { width: 16px; height: 16px; }
      }
    `;
    document.head.appendChild(style);
  }

  function labelForButton(button) {
    if (button.classList.contains('cat-all')) return 'All';
    if (button.classList.contains('cat-meal')) return 'Food';
    if (button.classList.contains('cat-ticket')) return 'Attractions';
    if (button.classList.contains('cat-hotel')) return 'Hotels';
    if (button.classList.contains('cat-act')) return 'Places';
    return button.getAttribute('aria-label') || button.title || '';
  }

  function decorateFilters() {
    if (!isMobile()) return;
    const row = document.querySelector('#view-map .mf-row-icons');
    if (!row) return;

    [...row.children].forEach(child => {
      const button = child.matches?.('.mf-icon-btn') ? child : child.querySelector?.('.mf-icon-btn');
      if (!button) return;
      if (button.parentElement?.classList.contains('mf-icon-wrap')) return;

      const wrap = document.createElement('div');
      wrap.className = 'mf-icon-wrap';
      const label = document.createElement('span');
      label.className = 'mf-icon-label';
      label.textContent = labelForButton(button);
      button.parentNode.insertBefore(wrap, button);
      wrap.appendChild(button);
      wrap.appendChild(label);
    });
  }

  function ensureCard() {
    const view = document.getElementById('view-map');
    if (!view) return null;
    let card = document.getElementById('map-mobile-place-card');
    if (card) return card;

    card = document.createElement('div');
    card.id = 'map-mobile-place-card';
    card.setAttribute('role', 'status');
    card.innerHTML = `
      <div class="mmc-accent" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"></path><circle cx="12" cy="10" r="2.2"></circle></svg>
      </div>
      <div class="mmc-copy">
        <div class="mmc-type">Location</div>
        <div class="mmc-name"></div>
        <div class="mmc-meta"></div>
      </div>
      <button class="mmc-close" type="button" aria-label="Close location card">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m9 6 6 6-6 6"/></svg>
      </button>`;
    card.querySelector('.mmc-close').addEventListener('click', () => card.classList.remove('is-visible'));
    view.appendChild(card);
    return card;
  }

  function typeFromItem(item) {
    const dot = item.querySelector('.ml-dot');
    const color = dot ? getComputedStyle(dot).backgroundColor : '';
    const text = (item.querySelector('.ml-meta')?.textContent || '').toLowerCase();
    if (/food|meal|coffee|restaurant|breakfast|lunch|dinner/.test(text)) return ['Food', '#d97b0a'];
    if (/hotel|stay|accommodation/.test(text)) return ['Hotel', '#6b4b8e'];
    if (/ticket|attraction/.test(text)) return ['Attraction', '#5A8968'];
    if (/flight|train|car|transport|airport/.test(text)) return ['Transport', '#24599a'];
    return ['Location', color || '#0e7a87'];
  }

  function showCardFromItem(item) {
    if (!isMobile() || !item) return;
    const card = ensureCard();
    if (!card) return;
    const name = item.querySelector('.ml-name')?.textContent?.trim();
    if (!name) return;
    const meta = item.querySelector('.ml-meta')?.textContent?.trim() || '';
    const [type, color] = typeFromItem(item);
    card.querySelector('.mmc-name').textContent = name;
    card.querySelector('.mmc-meta').textContent = meta;
    card.querySelector('.mmc-type').textContent = type;
    card.querySelector('.mmc-type').style.color = color;
    card.querySelector('.mmc-accent').style.background = color;
    card.classList.add('is-visible');
  }

  function syncSelectedCard() {
    const active = document.querySelector('#view-map .map-list .ml-item.active');
    if (active) showCardFromItem(active);
  }

  function currentDayIndex() {
    try {
      if (typeof activeDay !== 'undefined' && Number.isInteger(Number(activeDay))) return Number(activeDay);
    } catch (_) {}
    const buttons = [...document.querySelectorAll('#mob-nav-days > *')];
    const active = buttons.findIndex(el => el.classList.contains('active'));
    return active >= 0 ? active : 0;
  }

  function syncMapToDay() {
    if (!isMobile() || !mapVisible()) return;
    if (typeof window.setMapFilter !== 'function' && typeof setMapFilter !== 'function') return;
    const day = currentDayIndex();
    try { (window.setMapFilter || setMapFilter)('day', String(day)); } catch (_) {}
    const card = document.getElementById('map-mobile-place-card');
    card?.classList.remove('is-visible');
  }

  function installObservers() {
    const filters = document.getElementById('map-filters');
    if (filters) {
      new MutationObserver(() => {
        decorateFilters();
        requestAnimationFrame(syncSelectedCard);
      }).observe(filters, { childList: true, subtree: true });
    }

    const list = document.getElementById('map-list');
    if (list) {
      new MutationObserver(() => requestAnimationFrame(syncSelectedCard))
        .observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
      list.addEventListener('click', event => {
        const item = event.target.closest('.ml-item');
        if (item) showCardFromItem(item);
      }, true);
    }

    const view = document.getElementById('view-map');
    if (view) {
      new MutationObserver(() => {
        if (mapVisible()) {
          decorateFilters();
          ensureCard();
          setTimeout(syncMapToDay, 0);
        }
      }).observe(view, { attributes: true, attributeFilter: ['style', 'class'] });
    }
  }

  function installDaySync() {
    document.addEventListener('click', event => {
      if (!isMobile()) return;
      const dayBar = event.target.closest('#mob-nav-days');
      if (dayBar) setTimeout(syncMapToDay, 0);

      const mapButton = event.target.closest('#sb-btn-map, [onclick*="setView(\'map\')"], [onclick*="setView(&quot;map&quot;)"]');
      if (mapButton) setTimeout(syncMapToDay, 60);
    }, true);
  }

  function boot() {
    injectStyles();
    ensureCard();
    decorateFilters();
    installObservers();
    installDaySync();
    if (mapVisible()) setTimeout(syncMapToDay, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
