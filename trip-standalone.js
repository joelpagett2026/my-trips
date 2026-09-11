// Authenticated itinerary helper.
// The same immutable file is served under two explicit trip.php derivative names:
// - trip-json-bootstrap: read inert per-trip JSON before the external core runs.
// - trip-standalone: preserve iOS Home Screen detection/refresh behavior.
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