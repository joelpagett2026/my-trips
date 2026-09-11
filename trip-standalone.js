// Authenticated itinerary: iOS Home Screen mode detection and stale-page refresh.
(function () {
  const standalone = window.navigator.standalone === true;
  if (standalone) document.documentElement.classList.add('ios-standalone');

  // iOS Home Screen apps can restore a previously suspended document without
  // requesting it from the server again. If that happens, force one real
  // navigation so newly deployed itinerary code is actually loaded.
  if (standalone) {
    window.addEventListener('pageshow', function (event) {
      if (!event.persisted) return;
      const url = new URL(window.location.href);
      url.searchParams.set('_appfresh', Date.now().toString());
      window.location.replace(url.toString());
    });
  }
})();
