// Authenticated itinerary helper.
// The same immutable file is served under two explicit trip.php derivative names:
// - trip-json-bootstrap: read inert per-trip JSON before the external core runs.
// - trip-standalone: preserve iOS Home Screen detection/refresh behavior and
//   install delegated owner-navigation controls without inline HTML handlers.
(function () {
  const current = document.currentScript;
  const currentUrl = current?.src ? new URL(current.src, window.location.href) : null;
  const derivative = currentUrl?.searchParams.get('asset') || '';

  if (derivative === 'trip-json-bootstrap') {
    const dataElement = document.getElementById('trip-runtime-data');
    if (!dataElement) throw new Error('Trip runtime data is unavailable');

    let data;
    try {
      data = JSON.parse(dataElement.textContent || '{}');
    } catch (_) {
      throw new Error('Trip runtime data is invalid');
    }

    const nextSlug = String(data.slug || '');
    if (!/^[a-z0-9-]+$/.test(nextSlug)) throw new Error('Trip runtime slug is invalid');

    // The legacy inline bootstrap exposed these names to the following classic
    // script. Global object properties preserve that lookup contract without
    // executing per-trip values as JavaScript source.
    window.dest = String(data.dest || 'Trip');
    window.dep = String(data.dep || '');
    window.ret = String(data.ret || '');
    window.trav = String(data.trav || '2');
    window.status = String(data.status || 'upcoming');
    window.slug = nextSlug;
    window.RECORD_ID = nextSlug;
    return;
  }

  function installOwnerNavigationHandlers() {
    if (window.__ownerNavigationHandlersInstalled) return;
    window.__ownerNavigationHandlersInstalled = true;

    const call = (name, ...args) => {
      const fn = window[name];
      if (typeof fn === 'function') return fn(...args);
      console.warn(`Owner navigation action is unavailable: ${name}`);
      return undefined;
    };

    document.addEventListener('click', event => {
      const control = event.target.closest?.('[data-owner-action]');
      if (!control) return;

      const action = control.dataset.ownerAction || '';
      if (action === 'toggle-days') {
        event.preventDefault();
        event.stopPropagation();
        call('toggleDaysCollapse');
        return;
      }

      if (control.dataset.ownerCloseMenu === '1') call('closeMobMenu');

      switch (action) {
        case 'view':
          event.preventDefault();
          call('setView', control.dataset.ownerView || 'itinerary');
          break;
        case 'share':
          event.preventDefault();
          // itinerary-ui.js deliberately assigns the desktop Share button a
          // function-valued onclick property after installing privacy controls.
          // That programmatic listener is CSP-safe; avoid opening it twice when
          // it has already handled the target phase.
          if (typeof control.onclick !== 'function') call('openShareModal');
          break;
        case 'settings':
          event.preventDefault();
          call('openTripSettings');
          break;
        case 'all-trips':
          event.preventDefault();
          window.location.href = '/trips/';
          break;
        case 'toggle-menu':
          event.preventDefault();
          call('toggleMobMenu');
          break;
        case 'close-menu':
          event.preventDefault();
          call('closeMobMenu');
          break;
      }
    });
  }

  installOwnerNavigationHandlers();

  const standalone = window.navigator.standalone === true;
  if (standalone) document.documentElement.classList.add('ios-standalone');

  // iOS Home Screen apps can keep the same document alive for a long time.
  // Refresh once per app foreground session, not only on BFCache restoration,
  // so newly deployed itinerary/modal code is actually picked up.
  if (standalone) {
    const freshKey = 'mytrips-app-fresh-url';
    const currentUrl = new URL(window.location.href);
    const currentFresh = currentUrl.searchParams.get('_appfresh') || '';
    let sessionFresh = '';
    try { sessionFresh = sessionStorage.getItem(freshKey) || ''; } catch (_) {}

    function forceFreshNavigation() {
      const url = new URL(window.location.href);
      const token = Date.now().toString();
      try { sessionStorage.setItem(freshKey, token); } catch (_) {}
      url.searchParams.set('_appfresh', token);
      window.location.replace(url.toString());
    }

    window.addEventListener('pageshow', function (event) {
      if (event.persisted) {
        forceFreshNavigation();
        return;
      }
      if (!currentFresh || currentFresh !== sessionFresh) forceFreshNavigation();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      // A suspended Home Screen app may resume without pageshow. A fresh
      // navigation here is deliberately limited to once per foreground session.
      const url = new URL(window.location.href);
      const token = url.searchParams.get('_appfresh') || '';
      let remembered = '';
      try { remembered = sessionStorage.getItem(freshKey) || ''; } catch (_) {}
      if (!token || token !== remembered) forceFreshNavigation();
    });
  }
})();