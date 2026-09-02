// MY TRIPS — restaurant metadata + add/edit modal UX enhancements
// Keeps the large shared template stable while improving desktop/mobile entry flows.
(function () {
  'use strict';

  if (new URLSearchParams(window.location.search).has('share')) return;
  if (window.__restaurantModalEnhancementsInstalled) return;
  window.__restaurantModalEnhancementsInstalled = true;

  const authToken = () => {
    try { if (typeof getToken === 'function') return getToken() || ''; } catch (_) {}
    return '';
  };

  function currentCity(dayIdx) {
    try {
      const day = typeof STATE !== 'undefined' ? STATE.days?.[dayIdx] : null;
      return String(day?.loc || STATE?.meta?.dest || '').trim();
    } catch (_) { return ''; }
  }

  function injectStyles() {
    if (document.getElementById('itinerary-entry-modal-style')) return;
    const style = document.createElement('style');
    style.id = 'itinerary-entry-modal-style';
    style.textContent = `
      /* Desktop + tablet: make the add/edit form feel like one deliberate editor. */
      #modal-overlay { padding:24px !important; }
      #modal-overlay .modal {
        width:min(720px,calc(100vw - 48px)) !important;
        max-width:720px !important;
        max-height:min(880px,calc(100dvh - 48px)) !important;
        display:flex !important;
        flex-direction:column !important;
        overflow:hidden !important;
        border-radius:18px !important;
        box-shadow:0 24px 70px rgba(27,42,51,.22) !important;
      }
      #modal-overlay .modal-head {
        flex:0 0 auto !important;
        padding:18px 20px 14px !important;
        border-bottom:1px solid var(--line) !important;
        background:var(--surface,#fff) !important;
      }
      #modal-overlay .modal-title { font-size:18px !important; line-height:1.25 !important; }
      #modal-overlay .modal-tabs {
        margin-top:12px !important;
        padding:3px !important;
        background:rgba(102,117,125,.08) !important;
        border-radius:10px !important;
        gap:3px !important;
      }
      #modal-overlay .modal-tab {
        min-height:36px !important;
        padding:8px 14px !important;
        border-radius:8px !important;
      }
      #modal-overlay .modal-body,
      #modal-overlay #modal-body-single,
      #modal-overlay #modal-body-bulk {
        flex:1 1 auto !important;
        min-height:0 !important;
        overflow-y:auto !important;
        overflow-x:hidden !important;
        overscroll-behavior:contain !important;
        padding:18px 20px 24px !important;
        scroll-padding:24px 0 120px !important;
      }
      #modal-overlay .field-group { min-width:0 !important; }
      #modal-overlay .field-label {
        display:block !important;
        margin-bottom:6px !important;
        font-size:11px !important;
        font-weight:700 !important;
        letter-spacing:.02em !important;
        color:var(--text2,#66757d) !important;
      }
      #modal-overlay .field-input,
      #modal-overlay .field-select,
      #modal-overlay .field-textarea {
        width:100% !important;
        min-width:0 !important;
        box-sizing:border-box !important;
        line-height:1.35 !important;
        caret-color:#0e7a87 !important;
        text-rendering:auto !important;
      }
      #modal-overlay .field-input,
      #modal-overlay .field-select { min-height:44px !important; }
      #modal-overlay .field-textarea { min-height:92px !important; resize:vertical !important; }
      #modal-overlay .field-input:focus,
      #modal-overlay .field-select:focus,
      #modal-overlay .field-textarea:focus {
        outline:none !important;
        border-color:#0e7a87 !important;
        box-shadow:0 0 0 3px rgba(14,122,135,.12) !important;
      }
      #modal-overlay #f-category-row {
        display:grid !important;
        grid-template-columns:repeat(5,minmax(0,1fr)) !important;
        gap:6px !important;
        width:100% !important;
      }
      #modal-overlay #f-category-row .tt-btn {
        min-width:0 !important;
        min-height:40px !important;
        padding:8px 7px !important;
        border-radius:10px !important;
        white-space:normal !important;
        line-height:1.15 !important;
      }
      #modal-overlay .modal-foot {
        flex:0 0 auto !important;
        padding:12px 20px 14px !important;
        background:var(--surface,#fff) !important;
        border-top:1px solid var(--line) !important;
        box-shadow:0 -7px 20px rgba(20,35,45,.055) !important;
      }
      #modal-overlay .modal-btn { min-height:44px !important; border-radius:10px !important; }
      #modal-overlay .places-ac-wrap { position:relative !important; }
      #modal-overlay .places-ac-list {
        z-index:320 !important;
        left:0 !important;
        right:0 !important;
        width:auto !important;
        max-height:260px !important;
        overflow:auto !important;
        border-radius:12px !important;
        box-shadow:0 14px 30px rgba(28,43,51,.16) !important;
      }
      #modal-overlay .places-ac-item {
        min-height:46px !important;
        padding:10px 12px !important;
        line-height:1.3 !important;
        cursor:pointer !important;
      }

      @media (max-width:768px) {
        #modal-overlay {
          align-items:flex-end !important;
          padding:0 !important;
          overflow:hidden !important;
          background:rgba(24,35,40,.42) !important;
        }
        #modal-overlay .modal {
          position:fixed !important;
          left:0 !important; right:0 !important; bottom:0 !important; top:auto !important;
          width:100% !important; max-width:100% !important; min-width:0 !important;
          height:min(92dvh,860px) !important;
          max-height:calc(100dvh - max(env(safe-area-inset-top,0px),8px)) !important;
          border-radius:22px 22px 0 0 !important;
          overflow:hidden !important;
          transform:translateZ(0) !important;
        }
        #modal-overlay .modal::before {
          content:'';
          width:42px; height:4px;
          border-radius:99px;
          background:rgba(80,96,104,.24);
          margin:8px auto 0;
          flex:0 0 auto;
        }
        #modal-overlay .modal-head {
          display:grid !important;
          grid-template-columns:minmax(0,1fr) 44px !important;
          align-items:center !important;
          gap:8px 10px !important;
          padding:9px 14px 11px !important;
        }
        #modal-overlay .modal-title {
          min-width:0 !important;
          font-size:17px !important;
          line-height:1.2 !important;
        }
        #modal-overlay .modal-close {
          position:static !important;
          width:44px !important; height:44px !important; min-width:44px !important;
          border-radius:12px !important;
          display:inline-flex !important;
          align-items:center !important;
          justify-content:center !important;
          justify-self:end !important;
        }
        #modal-overlay .modal-tabs {
          grid-column:1 / -1 !important;
          width:100% !important;
          margin-top:1px !important;
        }
        #modal-overlay .modal-tab { flex:1 1 0 !important; min-width:0 !important; }
        #modal-overlay .modal-body,
        #modal-overlay #modal-body-single,
        #modal-overlay #modal-body-bulk {
          padding:14px 14px 28px !important;
          -webkit-overflow-scrolling:touch !important;
          scroll-padding-top:18px !important;
          scroll-padding-bottom:150px !important;
        }
        #modal-overlay .field-row {
          grid-template-columns:minmax(0,1fr) !important;
          gap:12px !important;
        }
        #modal-overlay .field-input,
        #modal-overlay .field-select,
        #modal-overlay .field-textarea {
          font-size:16px !important;
          -webkit-text-size-adjust:100% !important;
        }
        #modal-overlay .field-input,
        #modal-overlay .field-select { min-height:48px !important; }
        #modal-overlay .field-textarea { min-height:100px !important; }
        #modal-overlay #f-category-row {
          grid-template-columns:repeat(3,minmax(0,1fr)) !important;
          gap:7px !important;
        }
        #modal-overlay #f-category-row .tt-btn {
          min-height:44px !important;
          padding:8px 5px !important;
          font-size:11px !important;
        }
        #modal-overlay .modal-foot {
          display:grid !important;
          grid-template-columns:auto minmax(0,1fr) minmax(0,1fr) !important;
          gap:8px !important;
          padding:10px 14px calc(10px + env(safe-area-inset-bottom,0px)) !important;
        }
        #modal-overlay .modal-btn {
          min-width:0 !important;
          min-height:46px !important;
          padding:10px 9px !important;
          font-size:12px !important;
        }
        #modal-overlay .places-ac-list {
          max-height:min(250px,32dvh) !important;
          -webkit-overflow-scrolling:touch !important;
        }
        #modal-overlay .places-ac-item { min-height:52px !important; padding:11px 12px !important; }
      }

      @media (max-width:390px) {
        #modal-overlay #f-category-row { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
        #modal-overlay .modal-foot { grid-template-columns:auto 1fr !important; }
        #modal-overlay .modal-foot .modal-btn:last-child { grid-column:2; }
      }
    `;
    document.head.appendChild(style);
  }

  function setGroupVisible(inputId, visible) {
    const input = document.getElementById(inputId);
    const group = input?.closest('.field-group');
    if (!group) return;
    if (!group.dataset.poiOriginalDisplay) group.dataset.poiOriginalDisplay = group.style.display || '__empty__';
    group.style.display = visible
      ? (group.dataset.poiOriginalDisplay === '__empty__' ? '' : group.dataset.poiOriginalDisplay)
      : 'none';
  }

  function syncPoiFields() {
    const type = document.getElementById('f-type')?.value || '';
    const isPoi = type === 'place' || type === 'poi';
    setGroupVisible('f-move-cost-flight', !isPoi);
    setGroupVisible('f-avios', !isPoi);
    setGroupVisible('f-move-notes-flight', !isPoi);
    if (isPoi) {
      setGroupVisible('f-place-notes', true);
      setGroupVisible('f-place-website', true);
    }
  }

  function ensureAutocompleteList(input) {
    if (!input) return null;
    const group = input.closest('.field-group');
    if (!group) return null;
    group.classList.add('places-ac-wrap');
    input.classList.add('places-ac-input');
    input.setAttribute('autocomplete','off');
    input.setAttribute('autocorrect','off');
    input.setAttribute('autocapitalize','words');
    input.setAttribute('spellcheck','false');
    let list = document.getElementById(input.id + '-list');
    if (!list) {
      list = document.createElement('div');
      list.id = input.id + '-list';
      list.className = 'places-ac-list';
      group.appendChild(list);
    }
    return list;
  }

  // Replaces the old single global autocomplete timer. Each field now owns its
  // request sequence, so a slow response for older text can never overwrite the
  // suggestions for what the user is currently typing. This also handles iOS
  // composition/predictive text without fighting the visible input value.
  function installAutocompleteFix() {
    window.attachPlacesAutocomplete = function attachPlacesAutocompleteStable(inputId) {
      const input = document.getElementById(inputId);
      const list = ensureAutocompleteList(input);
      if (!input || !list || input.dataset.acStable === '1') return;
      input.dataset.acStable = '1';
      input._acAttached = true;

      let timer = null;
      let sequence = 0;
      let composing = false;

      const hide = () => {
        list.style.display = 'none';
        list.innerHTML = '';
      };

      async function requestSuggestions() {
        if (composing) return;
        const q = input.value.trim();
        const requestId = ++sequence;
        if (q.length < 3) { hide(); return; }
        try {
          const preds = await dbPlacesAutocomplete(q);
          if (requestId !== sequence || input.value.trim() !== q) return;
          if (!Array.isArray(preds) || !preds.length) { hide(); return; }
          list.replaceChildren(...preds.slice(0,6).map(p => {
            const row = document.createElement('div');
            row.className = 'places-ac-item';
            row.dataset.placeId = String(p.place_id || '');
            row.dataset.mainText = String(p.main_text || p.description || '');
            row.textContent = String(p.description || p.main_text || '');
            return row;
          }));
          list.style.display = 'block';
        } catch (_) {
          if (requestId === sequence) hide();
        }
      }

      function schedule() {
        delete input.dataset.placeId;
        delete input.dataset.lat;
        delete input.dataset.lng;
        if (input.id === 'f-meal-name') delete input.dataset.restaurantPhoto;
        try { if (typeof updateCarHireMapsLinks === 'function') updateCarHireMapsLinks(); } catch (_) {}
        clearTimeout(timer);
        sequence++;
        timer = setTimeout(requestSuggestions, 220);
      }

      input.addEventListener('compositionstart', () => { composing = true; clearTimeout(timer); });
      input.addEventListener('compositionend', () => { composing = false; schedule(); });
      input.addEventListener('input', schedule);
      input.addEventListener('focus', () => { if (input.value.trim().length >= 3 && list.childElementCount) list.style.display = 'block'; });
      input.addEventListener('blur', () => setTimeout(hide, 160));

      async function choose(event) {
        const row = event.target.closest('.places-ac-item');
        if (!row) return;
        event.preventDefault();
        event.stopPropagation();
        sequence++;
        clearTimeout(timer);
        const placeId = row.dataset.placeId || '';
        const chosenText = row.dataset.mainText || row.textContent || '';
        input.value = chosenText;
        input.dataset.placeId = placeId;
        hide();
        try {
          const details = placeId ? await dbPlaceDetails(placeId) : null;
          if (details && input.dataset.placeId === placeId) {
            if (Number.isFinite(Number(details.lat))) input.dataset.lat = String(details.lat);
            if (Number.isFinite(Number(details.lng))) input.dataset.lng = String(details.lng);
            if (details.address) input.dataset.address = String(details.address);
          }
        } catch (_) {}
        input.dispatchEvent(new Event('change', { bubbles:true }));
        try { if (typeof updateCarHireMapsLinks === 'function') updateCarHireMapsLinks(); } catch (_) {}
      }

      list.addEventListener('pointerdown', choose);
      // Older iOS versions may not emit PointerEvent reliably inside fixed sheets.
      list.addEventListener('touchstart', choose, { passive:false });
    };
  }

  function ensureEntryAutocomplete() {
    ['f-place-location','f-att-name','f-meal-name'].forEach(id => {
      const input = document.getElementById(id);
      if (!input) return;
      ensureAutocompleteList(input);
      try { window.attachPlacesAutocomplete(id); } catch (_) {}
    });
  }

  async function lookupPhoto(title, placeId, city) {
    const query = new URLSearchParams();
    if (title) query.set('q', title);
    if (city) query.set('city', city);
    if (placeId) query.set('place_id', placeId);
    if (!query.has('q') && !query.has('place_id')) return null;
    try {
      const response = await fetch('/place-photo.php?' + query.toString(), {
        cache:'no-store', credentials:'same-origin', headers:{ 'X-Auth-Token':authToken() }
      });
      if (!response.ok) return null;
      const json = await response.json();
      return json?.data?.photo || json?.photo || null;
    } catch (_) { return null; }
  }

  function restaurantInput() { return document.getElementById('f-meal-name'); }

  function restoreRestaurantMeta(item) {
    const input = restaurantInput();
    if (!input) return;
    ['restaurantPhoto','placeId','lat','lng'].forEach(k => delete input.dataset[k]);
    if (item?._geo?.place_id) input.dataset.placeId = String(item._geo.place_id);
    if (Number.isFinite(Number(item?._geo?.lat))) input.dataset.lat = String(item._geo.lat);
    if (Number.isFinite(Number(item?._geo?.lng))) input.dataset.lng = String(item._geo.lng);
    if (item?._photo) input.dataset.restaurantPhoto = String(item._photo);
  }

  function ensureRestaurantAutocomplete(item) {
    const input = restaurantInput();
    if (!input) return;
    ensureAutocompleteList(input);
    restoreRestaurantMeta(item || null);
    try { window.attachPlacesAutocomplete('f-meal-name'); } catch (_) {}

    if (input.dataset.restaurantObserver === '1') return;
    input.dataset.restaurantObserver = '1';
    new MutationObserver(async mutations => {
      if (!mutations.some(m => m.attributeName === 'data-place-id')) return;
      const placeId = input.dataset.placeId || '';
      const title = input.value.trim();
      if (!placeId || !title) return;
      const city = currentCity(typeof activeDay === 'number' ? activeDay : 0);
      const photo = await lookupPhoto(title, placeId, city);
      if (photo && input.dataset.placeId === placeId) input.dataset.restaurantPhoto = photo;
    }).observe(input, { attributes:true, attributeFilter:['data-place-id'] });
  }

  function captureRestaurantMeta() {
    const input = restaurantInput();
    if (!input || !input.value.trim()) return null;
    const lat = Number(input.dataset.lat), lng = Number(input.dataset.lng);
    return {
      title:input.value.trim(),
      placeId:String(input.dataset.placeId || '').trim(),
      lat:Number.isFinite(lat) ? lat : null,
      lng:Number.isFinite(lng) ? lng : null,
      photo:String(input.dataset.restaurantPhoto || '').trim()
    };
  }

  function applyRestaurantMeta(item, meta, dayIdx) {
    if (!item || item.type !== 'meal' || !meta) return;
    if (meta.placeId) {
      item._geo = { place_id:meta.placeId };
      if (meta.lat !== null) item._geo.lat = meta.lat;
      if (meta.lng !== null) item._geo.lng = meta.lng;
    }
    if (meta.photo) item._photo = meta.photo;
    if (!item._photo && meta.placeId) {
      lookupPhoto(item.title || meta.title, meta.placeId, currentCity(dayIdx)).then(photo => {
        if (!photo || item._geo?.place_id !== meta.placeId) return;
        item._photo = photo;
        if (typeof scheduleSave === 'function') scheduleSave();
      });
    }
  }

  function improveKeyboardBehaviour() {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;

    overlay.addEventListener('focusin', event => {
      const field = event.target.closest('input,textarea,select');
      if (!field || !window.matchMedia('(max-width:768px)').matches) return;
      setTimeout(() => field.scrollIntoView({ block:'center', behavior:'smooth' }), 180);
    });

    if (window.visualViewport) {
      const adjust = () => {
        if (!overlay.classList.contains('open') || !window.matchMedia('(max-width:768px)').matches) return;
        const modal = overlay.querySelector('.modal');
        if (!modal) return;
        const available = Math.max(320, Math.round(window.visualViewport.height - 8));
        modal.style.setProperty('--entry-viewport-height', available + 'px');
        modal.style.maxHeight = 'var(--entry-viewport-height)';
      };
      window.visualViewport.addEventListener('resize', adjust, { passive:true });
      window.visualViewport.addEventListener('scroll', adjust, { passive:true });
    }
  }

  function installHooks() {
    if (typeof window.openAddItem === 'function' && !window.openAddItem.__entryEnhanced) {
      const original = window.openAddItem;
      const wrapped = function (...args) {
        const result = original.apply(this,args);
        setTimeout(() => {
          ensureEntryAutocomplete();
          ensureRestaurantAutocomplete(null);
          syncPoiFields();
        },0);
        return result;
      };
      wrapped.__entryEnhanced = true;
      window.openAddItem = wrapped;
    }

    if (typeof window.openEditItem === 'function' && !window.openEditItem.__entryEnhanced) {
      const original = window.openEditItem;
      const wrapped = function (dayIdx,itemIdx,...rest) {
        let item = null;
        try { item = STATE.days?.[dayIdx]?.items?.[itemIdx] || null; } catch (_) {}
        const result = original.call(this,dayIdx,itemIdx,...rest);
        setTimeout(() => {
          ensureEntryAutocomplete();
          if (item?.type === 'meal') ensureRestaurantAutocomplete(item);
          syncPoiFields();
        },0);
        return result;
      };
      wrapped.__entryEnhanced = true;
      window.openEditItem = wrapped;
    }

    if (typeof window.setCategory === 'function' && !window.setCategory.__entryEnhanced) {
      const original = window.setCategory;
      const wrapped = function (...args) {
        const result = original.apply(this,args);
        setTimeout(() => { syncPoiFields(); ensureEntryAutocomplete(); },0);
        return result;
      };
      wrapped.__entryEnhanced = true;
      window.setCategory = wrapped;
    }

    if (typeof window.onCategoryChange === 'function' && !window.onCategoryChange.__entryEnhanced) {
      const original = window.onCategoryChange;
      const wrapped = function (...args) {
        const result = original.apply(this,args);
        setTimeout(() => { syncPoiFields(); ensureEntryAutocomplete(); },0);
        return result;
      };
      wrapped.__entryEnhanced = true;
      window.onCategoryChange = wrapped;
    }

    if (typeof window.saveItem === 'function' && !window.saveItem.__restaurantEnhanced) {
      const original = window.saveItem;
      const wrapped = function (...args) {
        const type = document.getElementById('f-type')?.value || '';
        if (type !== 'meal') return original.apply(this,args);
        const meta = captureRestaurantMeta();
        const dayIdx = typeof activeDay === 'number' ? activeDay : 0;
        const before = new Set(STATE.days?.[dayIdx]?.items || []);
        const result = original.apply(this,args);
        try {
          const items = STATE.days?.[dayIdx]?.items || [];
          const saved = items.find(it => !before.has(it) && it?.type === 'meal' && (!meta?.title || it.title === meta.title))
            || [...items].reverse().find(it => it?.type === 'meal' && (!meta?.title || it.title === meta.title));
          if (saved) {
            applyRestaurantMeta(saved,meta,dayIdx);
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
        if (!item || item.type !== 'meal' || item._photo || !item._geo?.place_id) return original.apply(this,arguments);
        const dayIdx = typeof activeDay === 'number' ? activeDay : 0;
        const photo = await lookupPhoto(item.title || '',String(item._geo.place_id),currentCity(dayIdx));
        if (!photo) return original.apply(this,arguments);
        item._photo = photo;
        if (typeof scheduleSave === 'function') scheduleSave();
        return photo;
      };
      wrapped.__restaurantEnhanced = true;
      window.fetchMealPhoto = wrapped;
    }
  }

  function init() {
    injectStyles();
    installAutocompleteFix();
    installHooks();
    improveKeyboardBehaviour();
    syncPoiFields();

    document.addEventListener('click', event => {
      if (event.target.closest('#f-category-row .tt-btn')) setTimeout(() => {
        syncPoiFields();
        ensureEntryAutocomplete();
      },0);
    }, true);

    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
      new MutationObserver(() => {
        if (overlay.classList.contains('open')) setTimeout(() => {
          syncPoiFields();
          ensureEntryAutocomplete();
        },0);
      }).observe(overlay,{ attributes:true, attributeFilter:['class'] });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{ once:true });
  else init();
})();
