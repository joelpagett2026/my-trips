// MY TRIPS — restaurant drawer + mobile add/edit modal enhancements
// Reuses the retired completion runtime slot; completion ticks now live in itinerary-ui.js.
(function () {
  'use strict';

  if (new URLSearchParams(window.location.search).has('share')) return;
  if (window.__restaurantModalEnhancementsInstalled) return;
  window.__restaurantModalEnhancementsInstalled = true;

  const isMobile = () => !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
  const authToken = () => {
    try {
      if (typeof AUTH_TOKEN !== 'undefined' && AUTH_TOKEN) return AUTH_TOKEN;
    } catch (_) {}
    try {
      if (typeof getToken === 'function') return getToken() || '';
    } catch (_) {}
    return '';
  };

  function currentCity(dayIdx) {
    try {
      const day = typeof STATE !== 'undefined' ? STATE.days?.[dayIdx] : null;
      return String(day?.loc || STATE?.meta?.dest || '').trim();
    } catch (_) {
      return '';
    }
  }

  function injectStyles() {
    if (document.getElementById('restaurant-mobile-modal-style')) return;
    const style = document.createElement('style');
    style.id = 'restaurant-mobile-modal-style';
    style.textContent = `
      #f-meal-name-list { z-index: 160 !important; }
      #f-meal-name-list .places-ac-item { cursor: pointer; }

      @media (max-width: 768px) {
        #modal-overlay {
          align-items: flex-end !important;
          padding: 0 !important;
          overflow: hidden !important;
        }
        #modal-overlay .modal {
          position: fixed !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          top: auto !important;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          height: auto !important;
          max-height: calc(100dvh - max(env(safe-area-inset-top, 0px), 10px)) !important;
          border-radius: 20px 20px 0 0 !important;
          overflow: hidden !important;
          display: flex !important;
          flex-direction: column !important;
        }
        #modal-overlay .modal::before {
          content: '';
          width: 42px;
          height: 4px;
          border-radius: 99px;
          background: rgba(80, 96, 104, .24);
          margin: 8px auto 0;
          flex: 0 0 auto;
        }
        #modal-overlay .modal-head {
          flex: 0 0 auto !important;
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) 44px !important;
          align-items: center !important;
          gap: 8px 10px !important;
          padding: 10px 14px 12px !important;
          background: var(--surface, #fff) !important;
          border-bottom: 1px solid var(--line) !important;
          position: relative !important;
          z-index: 5 !important;
        }
        #modal-overlay .modal-title {
          min-width: 0 !important;
          font-size: 16px !important;
          line-height: 1.25 !important;
        }
        #modal-overlay .modal-close {
          position: static !important;
          width: 44px !important;
          height: 44px !important;
          min-width: 44px !important;
          border-radius: 12px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          justify-self: end !important;
        }
        #modal-overlay .modal-tabs {
          grid-column: 1 / -1 !important;
          width: 100% !important;
          min-width: 0 !important;
          overflow-x: auto !important;
          overflow-y: hidden !important;
          -webkit-overflow-scrolling: touch !important;
          scrollbar-width: none !important;
          padding-bottom: 1px !important;
        }
        #modal-overlay .modal-tabs::-webkit-scrollbar { display: none !important; }
        #modal-overlay .modal-body,
        #modal-overlay #modal-body-single,
        #modal-overlay #modal-body-bulk {
          flex: 1 1 auto !important;
          min-height: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
          overflow-x: hidden !important;
          overflow-y: auto !important;
          -webkit-overflow-scrolling: touch !important;
          overscroll-behavior: contain !important;
          padding: 14px 14px 22px !important;
          scroll-padding-top: 18px !important;
          scroll-padding-bottom: 120px !important;
        }
        #modal-overlay .field-row {
          grid-template-columns: minmax(0, 1fr) !important;
          gap: 12px !important;
        }
        #modal-overlay .field-group { min-width: 0 !important; }
        #modal-overlay .field-input,
        #modal-overlay .field-select {
          width: 100% !important;
          min-width: 0 !important;
          min-height: 46px !important;
          font-size: 16px !important;
          border-radius: 10px !important;
        }
        #modal-overlay .field-textarea {
          width: 100% !important;
          min-width: 0 !important;
          min-height: 94px !important;
          font-size: 16px !important;
          border-radius: 10px !important;
        }
        #modal-overlay .modal-foot {
          flex: 0 0 auto !important;
          display: grid !important;
          grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr) !important;
          gap: 8px !important;
          padding: 11px 14px calc(11px + env(safe-area-inset-bottom, 0px)) !important;
          background: var(--surface, #fff) !important;
          border-top: 1px solid var(--line) !important;
          box-shadow: 0 -8px 22px rgba(20, 35, 45, .07) !important;
          position: relative !important;
          z-index: 6 !important;
        }
        #modal-overlay .modal-btn {
          min-height: 44px !important;
          min-width: 0 !important;
          padding: 10px 12px !important;
        }
        #f-meal-name-list {
          max-height: min(240px, 34dvh) !important;
          overflow-y: auto !important;
          -webkit-overflow-scrolling: touch !important;
          z-index: 180 !important;
          border-radius: 12px !important;
        }
        #f-meal-name-list .places-ac-item {
          min-height: 50px !important;
          padding: 10px 12px !important;
          display: flex !important;
          align-items: center !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  async function lookupPhoto(title, placeId, city) {
    const query = new URLSearchParams();
    if (title) query.set('q', title);
    if (city) query.set('city', city);
    if (placeId) query.set('place_id', placeId);
    if (!query.has('q') && !query.has('place_id')) return null;

    try {
      const response = await fetch('/place-photo.php?' + query.toString(), {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'X-Auth-Token': authToken() },
      });
      if (!response.ok) return null;
      const json = await response.json();
      return json?.data?.photo || json?.photo || null;
    } catch (_) {
      return null;
    }
  }

  function restaurantInput() {
    return document.getElementById('f-meal-name');
  }

  function ensureAutocompleteList(input) {
    if (!input) return null;
    const group = input.closest('.field-group');
    if (!group) return null;
    group.classList.add('places-ac-wrap');
    input.classList.add('places-ac-input');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');

    let list = document.getElementById('f-meal-name-list');
    if (!list) {
      list = document.createElement('div');
      list.id = 'f-meal-name-list';
      list.className = 'places-ac-list';
      group.appendChild(list);
    }
    return list;
  }

  function restoreRestaurantMeta(item) {
    const input = restaurantInput();
    if (!input) return;
    delete input.dataset.restaurantPhoto;
    delete input.dataset.placeId;
    delete input.dataset.lat;
    delete input.dataset.lng;

    if (item?._geo?.place_id) input.dataset.placeId = String(item._geo.place_id);
    if (Number.isFinite(Number(item?._geo?.lat))) input.dataset.lat = String(item._geo.lat);
    if (Number.isFinite(Number(item?._geo?.lng))) input.dataset.lng = String(item._geo.lng);
    if (item?._photo) input.dataset.restaurantPhoto = String(item._photo);
  }

  function ensureRestaurantAutocomplete(item) {
    const input = restaurantInput();
    if (!input) return;
    const list = ensureAutocompleteList(input);
    restoreRestaurantMeta(item || null);

    if (input.dataset.restaurantAutocomplete !== '1') {
      input.dataset.restaurantAutocomplete = '1';
      try {
        if (typeof attachPlacesAutocomplete === 'function') attachPlacesAutocomplete('f-meal-name');
      } catch (_) {}

      input.addEventListener('input', () => {
        delete input.dataset.placeId;
        delete input.dataset.lat;
        delete input.dataset.lng;
        delete input.dataset.restaurantPhoto;
      });

      const observer = new MutationObserver(async mutations => {
        if (!mutations.some(m => m.attributeName === 'data-place-id')) return;
        const placeId = input.dataset.placeId || '';
        const title = input.value.trim();
        if (!placeId || !title) return;
        const city = currentCity(typeof activeDay === 'number' ? activeDay : 0);
        const photo = await lookupPhoto(title, placeId, city);
        if (photo && input.dataset.placeId === placeId) input.dataset.restaurantPhoto = photo;
      });
      observer.observe(input, { attributes: true, attributeFilter: ['data-place-id'] });
    }

    if (list) list.style.zIndex = '180';
  }

  function captureRestaurantMeta() {
    const input = restaurantInput();
    if (!input) return null;
    const placeId = String(input.dataset.placeId || '').trim();
    const title = input.value.trim();
    if (!title) return null;
    const lat = Number(input.dataset.lat);
    const lng = Number(input.dataset.lng);
    return {
      title,
      placeId,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      photo: String(input.dataset.restaurantPhoto || '').trim(),
    };
  }

  function saveMetaOnItem(item, meta, dayIdx) {
    if (!item || item.type !== 'meal' || !meta) return;
    if (meta.placeId) {
      item._geo = { place_id: meta.placeId };
      if (meta.lat !== null) item._geo.lat = meta.lat;
      if (meta.lng !== null) item._geo.lng = meta.lng;
    } else if (item._geo?.place_id && item.title !== meta.title) {
      delete item._geo;
    }
    if (meta.photo) item._photo = meta.photo;

    if (!item._photo && meta.placeId) {
      const title = item.title || meta.title;
      const placeId = meta.placeId;
      lookupPhoto(title, placeId, currentCity(dayIdx)).then(photo => {
        if (!photo || item._geo?.place_id !== placeId) return;
        item._photo = photo;
        if (typeof scheduleSave === 'function') scheduleSave();
      });
    }
  }

  function installFunctionHooks() {
    if (typeof window.openAddItem === 'function' && !window.openAddItem.__restaurantEnhanced) {
      const original = window.openAddItem;
      const wrapped = function (...args) {
        const result = original.apply(this, args);
        window.setTimeout(() => ensureRestaurantAutocomplete(null), 0);
        return result;
      };
      wrapped.__restaurantEnhanced = true;
      window.openAddItem = wrapped;
    }

    if (typeof window.openEditItem === 'function' && !window.openEditItem.__restaurantEnhanced) {
      const original = window.openEditItem;
      const wrapped = function (dayIdx, itemIdx, ...rest) {
        let item = null;
        try { item = STATE.days?.[dayIdx]?.items?.[itemIdx] || null; } catch (_) {}
        const result = original.call(this, dayIdx, itemIdx, ...rest);
        if (item?.type === 'meal') window.setTimeout(() => ensureRestaurantAutocomplete(item), 0);
        return result;
      };
      wrapped.__restaurantEnhanced = true;
      window.openEditItem = wrapped;
    }

    if (typeof window.saveItem === 'function' && !window.saveItem.__restaurantEnhanced) {
      const original = window.saveItem;
      const wrapped = function (...args) {
        let type = '';
        try { type = document.getElementById('f-type')?.value || ''; } catch (_) {}
        if (type !== 'meal') return original.apply(this, args);

        const meta = captureRestaurantMeta();
        let dayIdx = 0;
        let editDayIdx = null;
        let editItemIdx = null;
        let before = new Set();
        try {
          dayIdx = typeof activeDay === 'number' ? activeDay : 0;
          if (typeof editItem !== 'undefined' && editItem) {
            editDayIdx = Number(editItem.dayIdx);
            editItemIdx = Number(editItem.itemIdx);
          }
          before = new Set(STATE.days?.[dayIdx]?.items || []);
        } catch (_) {}

        const result = original.apply(this, args);

        try {
          let saved = null;
          let savedDay = dayIdx;
          if (Number.isInteger(editDayIdx) && Number.isInteger(editItemIdx)) {
            savedDay = editDayIdx;
            saved = STATE.days?.[editDayIdx]?.items?.[editItemIdx] || null;
          }
          if (!saved) {
            const items = STATE.days?.[dayIdx]?.items || [];
            saved = items.find(item => !before.has(item) && item?.type === 'meal' && (!meta?.title || item.title === meta.title))
              || [...items].reverse().find(item => item?.type === 'meal' && (!meta?.title || item.title === meta.title));
          }
          if (saved) {
            saveMetaOnItem(saved, meta, savedDay);
            if (typeof scheduleSave === 'function') scheduleSave();
          }
        } catch (_) {}
        return result;
      };
      wrapped.__restaurantEnhanced = true;
      window.saveItem = wrapped;
    }

    if (typeof window.fetchMealPhoto === 'function' && !window.fetchMealPhoto.__restaurantEnhanced) {
      const original = window.fetchMealPhoto;
      const wrapped = async function (item) {
        if (!item || item.type !== 'meal' || item._photo || !item._geo?.place_id) {
          return original.apply(this, arguments);
        }

        let dayIdx = 0;
        try {
          dayIdx = typeof drawerItem !== 'undefined' && drawerItem ? drawerItem.dayIdx : (typeof activeDay === 'number' ? activeDay : 0);
        } catch (_) {}
        const photo = await lookupPhoto(item.title || '', String(item._geo.place_id), currentCity(dayIdx));
        if (!photo) return original.apply(this, arguments);

        item._photo = photo;
        if (typeof scheduleSave === 'function') scheduleSave();
        const slot = document.getElementById('dr-photo-slot');
        const img = document.getElementById('dr-photo-img');
        if (img) {
          img.onload = () => { if (slot) slot.style.display = 'block'; };
          img.onerror = () => { if (slot) slot.style.display = 'none'; };
          img.src = photo;
        }
        return photo;
      };
      wrapped.__restaurantEnhanced = true;
      window.fetchMealPhoto = wrapped;
    }
  }

  function installMobileFocusAssist() {
    document.addEventListener('focusin', event => {
      if (!isMobile()) return;
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('#modal-overlay')) return;
      if (!target.matches('input, select, textarea')) return;
      window.setTimeout(() => {
        try { target.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (_) {}
      }, 280);
    });
  }

  function init() {
    injectStyles();
    installFunctionHooks();
    installMobileFocusAssist();
    ensureRestaurantAutocomplete(null);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
