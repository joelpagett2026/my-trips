<?php
// Shared sanitising/injection for HTML templates that are stored in Git but
// rendered through PHP. No private credential is ever copied into browser HTML.
@include_once __DIR__ . '/secrets.php';

function runtimeConfigValue(string $name): string {
    if (defined($name)) return trim((string)constant($name));
    $env = getenv($name);
    return $env !== false ? trim((string)$env) : '';
}

function browserMapsKey(): string {
    // This key is intentionally a browser key: it will be visible to visitors.
    // Restrict it in Google Cloud by HTTP referrer and to Maps JavaScript API.
    return runtimeConfigValue('MAPS_BROWSER_KEY');
}

/**
 * Remove legacy credentials from the shared itinerary source, apply the known
 * hotel compatibility correction, and inject only the explicitly public browser
 * Maps key. Returns [html, diagnostics].
 */
function applyItineraryRuntimeSafety(string $html): array {
    $diagnostics = [];

    $html = preg_replace(
        "/const AUTH_TOKEN = '[a-f0-9]{64}';/",
        "const AUTH_TOKEN = ''; // legacy constant intentionally disabled",
        $html,
        1,
        $authConstCount
    );
    $diagnostics['auth_const_removed'] = $authConstCount;

    $html = str_replace(
        "'X-Auth-Token': AUTH_TOKEN",
        "'X-Auth-Token': (typeof getToken === 'function' ? getToken() : '')",
        $html,
        $authHeaderCount
    );
    $diagnostics['auth_headers_rewritten'] = $authHeaderCount;

    $mapsKey = browserMapsKey();
    $replacement = 'const MAPS_API_KEY = ' . json_encode($mapsKey, JSON_UNESCAPED_SLASHES) . ';';
    $html = preg_replace(
        "/const MAPS_API_KEY = 'AIza[0-9A-Za-z_-]+';/",
        $replacement,
        $html,
        1,
        $mapsCount
    );
    $diagnostics['maps_key_rewritten'] = $mapsCount;

    $html = str_replace(
        "return location.origin + '/new-trip-v2.html?share=1&t=' + token;",
        "return location.origin + '/share.php?share=1&t=' + token;",
        $html,
        $shareUrlCount
    );
    $diagnostics['share_url_rewritten'] = $shareUrlCount;

    $oldHotelLookup = <<<'JS'
// Find the hotel covering the active day (checkin <= day <= checkout)
function hotelForDay(dayIdx) {
  if (STATE.days[dayIdx]?.noAccommodation) return null; // explicitly marked — staying with family/friends, or flying that day
  const hotels = STATE.meta.hotels || (STATE.meta.hotel ? [STATE.meta.hotel] : []);
  if (!hotels.length) return null;
  const dayDate = parseDate(STATE.days[dayIdx]?.date);
  if (!dayDate) return hotels[0]; // no date — show first
  for (const h of hotels) {
    const ci = parseDate(h.checkin);
    const co = parseDate(h.checkout);
    if (ci && co && dayDate >= ci && dayDate <= co) return h;
  }
  // Fallback: closest upcoming
  return hotels.find(h => parseDate(h.checkin) >= dayDate) || hotels[hotels.length-1];
}
JS;
    $newHotelLookup = <<<'JS'
// Find the hotel covering the selected NIGHT (checkin <= day < checkout)
function hotelForDay(dayIdx) {
  if (STATE.days[dayIdx]?.noAccommodation) return null;
  const hotels = STATE.meta.hotels || (STATE.meta.hotel ? [STATE.meta.hotel] : []);
  if (!hotels.length) return null;
  const dayDate = parseDate(STATE.days[dayIdx]?.date);
  if (!dayDate) return null;
  for (const h of hotels) {
    const ci = parseDate(h.checkin);
    const co = parseDate(h.checkout);
    if (ci && co && dayDate >= ci && dayDate < co) return h;
  }
  return null;
}
JS;
    $html = str_replace($oldHotelLookup, $newHotelLookup, $html, $hotelLookupCount);
    $diagnostics['hotel_lookup_rewritten'] = $hotelLookupCount;

    return [$html, $diagnostics];
}

function applyTripsDashboardRuntimeSafety(string $html): array {
    $key = browserMapsKey();
    $replacement = 'const GOOGLE_MAPS_API_KEY = ' . json_encode($key, JSON_UNESCAPED_SLASHES) . ';';
    $html = preg_replace(
        "/const GOOGLE_MAPS_API_KEY = 'AIza[0-9A-Za-z_-]+';/",
        $replacement,
        $html,
        1,
        $mapsCount
    );

    $html = str_replace(
        ".filter((c,i,a) => a.indexOf(c) === i) // dedupe",
        ".filter((c,i,a) => a.indexOf(c) === i && String(c).trim().toLowerCase() !== 'travel day') // dedupe + exclude non-location label",
        $html,
        $travelDayCount
    );

    // The legacy dashboard treated every registry/API failure as an empty array.
    // That made auth/network/database faults look exactly like "zero itineraries"
    // and could then allow later code to work from a false empty baseline. Replace
    // those helpers at render time so failures are explicit and never destructive.
    $oldRegistryHelpers = <<<'JS'
async function loadRegistry(){
  try{ return await window.dbLoadRegistry(); }catch{ return []; }
}
async function saveRegistry(trips){
  try{ await window.dbSaveRegistry(trips); }catch{}
}
JS;
    $newRegistryHelpers = <<<'JS'
function setRegistryLoadError(message) {
  let el = document.getElementById('registry-load-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'registry-load-error';
    el.style.cssText = 'margin:16px 20px 0;padding:12px 14px;border-radius:12px;background:#fff3f0;border:1px solid rgba(229,62,62,.22);color:#8a2d2d;font:600 12px Montserrat,sans-serif;line-height:1.45;display:none;';
    const tripsCol = document.querySelector('.trips-col');
    if (tripsCol) tripsCol.insertBefore(el, tripsCol.firstChild);
  }
  if (!el) return;
  el.innerHTML = '<div style="display:flex;align-items:center;gap:10px;justify-content:space-between;"><span>' + message + '</span><button type="button" onclick="retryRegistryLoad()" style="border:0;border-radius:8px;background:#0e7a87;color:#fff;padding:7px 10px;font:700 11px Montserrat,sans-serif;cursor:pointer;flex-shrink:0;">Retry</button></div>';
  el.style.display = 'block';
}
function clearRegistryLoadError() {
  const el = document.getElementById('registry-load-error');
  if (el) el.style.display = 'none';
}
async function loadRegistry(){
  try {
    const trips = await window.dbLoadRegistry();
    if (!Array.isArray(trips)) throw new Error('Trip registry returned invalid data');
    clearRegistryLoadError();
    return trips;
  } catch (err) {
    if (!(err && err.status === 401)) {
      setRegistryLoadError('Couldn’t load itineraries. Your saved trips have not been changed.');
    }
    throw err;
  }
}
async function saveRegistry(trips){
  try {
    const result = await window.dbSaveRegistry(trips);
    clearRegistryLoadError();
    return result;
  } catch (err) {
    if (!(err && err.status === 401)) {
      setRegistryLoadError('Couldn’t save itinerary changes. Nothing was overwritten.');
    }
    throw err;
  }
}
window.retryRegistryLoad = function retryRegistryLoad() {
  window.location.reload();
};
JS;
    $html = str_replace($oldRegistryHelpers, $newRegistryHelpers, $html, $registryErrorCount);

    $html = str_replace(
        "  } catch { /* no registry yet */ }",
        "  } catch (err) {\n    if (!(err && err.status === 401)) setRegistryLoadError('Couldn’t load upcoming itineraries. Your saved trips have not been changed.');\n    return;\n  }",
        $html,
        $countdownErrorCount
    );

    return [$html, [
        'maps_key_rewritten' => $mapsCount,
        'travel_day_filter_rewritten' => $travelDayCount,
        'registry_error_handling_rewritten' => $registryErrorCount,
        'countdown_registry_error_rewritten' => $countdownErrorCount,
    ]];
}

function applyGoogleMapsScriptRuntimeSafety(string $html): array {
    $key = browserMapsKey();
    $html = preg_replace_callback(
        '/https:\/\/maps\.googleapis\.com\/maps\/api\/js\?key=AIza[0-9A-Za-z_-]+([^"\']*)/',
        static function (array $m) use ($key): string {
            return 'https://maps.googleapis.com/maps/api/js?key=' . rawurlencode($key) . ($m[1] ?? '');
        },
        $html,
        1,
        $count
    );
    return [$html, ['maps_script_key_rewritten' => $count]];
}
