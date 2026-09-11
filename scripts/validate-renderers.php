<?php
// Executable integration checks for the runtime HTML sanitizers. These verify
// that the actual source templates still match every deliberate transformation,
// not merely that the helper functions contain expected strings.

putenv('MAPS_BROWSER_KEY=RendererContractTestKey1234567890');
require_once __DIR__ . '/../template-runtime.php';

function requireContract(bool $ok, string $message): void {
    if (!$ok) {
        fwrite(STDERR, "renderer contract failed: {$message}\n");
        exit(1);
    }
}

function readTemplate(string $relative): string {
    $data = file_get_contents(__DIR__ . '/../' . $relative);
    requireContract($data !== false, "could not read {$relative}");
    return $data;
}

function assertOnlyConfiguredGoogleKeys(string $html, string $label): void {
    preg_match_all('/AIza[0-9A-Za-z_-]{20,}/', $html, $matches);
    foreach ($matches[0] as $key) {
        requireContract(
            $key === 'RendererContractTestKey1234567890',
            "{$label} still emits a source-controlled Google key"
        );
    }
}

$itinerarySource = readTemplate('new-trip-v2.html');
[$itinerary, $itineraryDiag] = applyItineraryRuntimeSafety($itinerarySource);
requireContract(($itineraryDiag['auth_const_removed'] ?? 0) === 1, 'itinerary auth constant rewrite count changed');
requireContract(($itineraryDiag['auth_headers_rewritten'] ?? 0) >= 1, 'itinerary auth header rewrite did not run');
requireContract(($itineraryDiag['maps_key_rewritten'] ?? 0) === 1, 'itinerary Maps key rewrite count changed');
requireContract(($itineraryDiag['share_url_rewritten'] ?? 0) === 1, 'itinerary share URL rewrite count changed');
requireContract(($itineraryDiag['hotel_lookup_rewritten'] ?? 0) === 1, 'itinerary hotel rewrite count changed');
requireContract(($itineraryDiag['itinerary_font_delivery_optimized'] ?? 0) === 1,
    'itinerary Google Font delivery optimization did not run');
requireContract(strpos($itinerary, '<link rel="preconnect" href="https://fonts.googleapis.com">') !== false,
    'itinerary must preconnect to fonts.googleapis.com');
requireContract(strpos($itinerary, '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>') !== false,
    'itinerary must preconnect to fonts.gstatic.com');
requireContract(strpos($itinerary, "const MAPS_API_KEY = \"RendererContractTestKey1234567890\";") !== false,
    'itinerary did not receive configured browser Maps key');
requireContract(strpos($itinerary, "'/share.php?share=1&t='") !== false,
    'itinerary did not receive safe share URL');
requireContract(strpos($itinerary, 'dayDate >= ci && dayDate < co') !== false,
    'itinerary did not receive checkout-exclusive hotel lookup');
requireContract(strpos($itinerary, 'Fallback: closest upcoming') === false,
    'itinerary still contains legacy hotel fallback after sanitizing');
requireContract(!preg_match("/const AUTH_TOKEN = '[a-f0-9]{64}';/", $itinerary),
    'itinerary still contains legacy PIN-hash bearer credential');
assertOnlyConfiguredGoogleKeys($itinerary, 'itinerary');

// The owner itinerary core is extracted only after all runtime safety rewrites,
// keeping the per-trip bootstrap inline while making the static engine cacheable.
[$core, $coreDiag] = extractItineraryCoreScript($itinerary);
requireContract(($coreDiag['itinerary_core_extracted'] ?? 0) === 1,
    'itinerary core extraction boundary changed');
requireContract(strlen($core) > 150000,
    'itinerary core extraction is unexpectedly small and would not deliver the intended payload reduction');
requireContract(strpos($core, "const MAPS_API_KEY = \"RendererContractTestKey1234567890\";") !== false,
    'extracted itinerary core did not retain the sanitized Maps key');
requireContract(strpos($core, "const AUTH_TOKEN = ''; // legacy constant intentionally disabled") !== false,
    'extracted itinerary core did not retain the disabled legacy auth constant');
requireContract(strpos($core, "'X-Auth-Token': (typeof getToken === 'function' ? getToken() : '')") !== false,
    'extracted itinerary core did not retain dynamic session authentication');
requireContract(strpos($core, 'dayDate >= ci && dayDate < co') !== false,
    'extracted itinerary core lost the checkout-exclusive hotel lookup');
requireContract(strpos($core, itineraryCoreSourceBootstrap()) === false,
    'per-trip bootstrap must not be duplicated into the cacheable core');
assertOnlyConfiguredGoogleKeys($core, 'itinerary core');

[$externalized, $externalDiag] = externalizeItineraryCoreScript($itinerary);
requireContract(($externalDiag['itinerary_core_externalized'] ?? 0) === 1,
    'owner itinerary core was not externalized');
requireContract(($externalDiag['itinerary_core_preloaded'] ?? 0) === 1,
    'owner itinerary core was not preloaded from the document head');
requireContract(strpos($externalized, itineraryCoreSourceBootstrap()) !== false,
    'owner itinerary externalization must preserve the existing trip bootstrap contract');
requireContract(strpos($externalized, '/template-runtime.php?asset=itinerary-core&amp;v=') !== false,
    'owner itinerary must reference a versioned cacheable core asset');
requireContract(strpos($externalized, "const AUTH_TOKEN = ''; // legacy constant intentionally disabled") === false,
    'the static itinerary core should no longer be duplicated inline after externalization');
requireContract(strlen($externalized) < strlen($itinerary) - 150000,
    'externalized owner itinerary did not materially reduce the HTML payload');

$tmpJs = tempnam(sys_get_temp_dir(), 'itinerary-core-');
requireContract($tmpJs !== false, 'could not create temporary itinerary core syntax file');
file_put_contents($tmpJs, ltrim($core, "\r\n"));
$syntaxOutput = [];
$syntaxStatus = 0;
exec('node --check ' . escapeshellarg($tmpJs) . ' 2>&1', $syntaxOutput, $syntaxStatus);
@unlink($tmpJs);
requireContract($syntaxStatus === 0,
    'extracted itinerary core is not valid JavaScript: ' . implode("\n", $syntaxOutput));

$dashboardSource = readTemplate('trips/index.html');
[$dashboard, $dashboardDiag] = applyTripsDashboardRuntimeSafety($dashboardSource);
requireContract(($dashboardDiag['dashboard_font_delivery_optimized'] ?? 0) === 1,
    'Trips dashboard Google Font delivery optimization did not run');
requireContract(strpos($dashboard, "@import url('https://fonts.googleapis.com") === false,
    'Trips dashboard must not leave Google Fonts behind a CSS @import');
requireContract(strpos($dashboard, '<link rel="preconnect" href="https://fonts.googleapis.com">') !== false,
    'Trips dashboard must preconnect to fonts.googleapis.com');
requireContract(strpos($dashboard, '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>') !== false,
    'Trips dashboard must preconnect to fonts.gstatic.com');
requireContract(($dashboardDiag['dashboard_map_render_deferred'] ?? 0) === 1,
    'Trips dashboard map deferral rewrite did not run');
requireContract(strpos($dashboard, 'function observeDashboardMap(id, render)') !== false,
    'Trips dashboard is missing its viewport map observer');
requireContract(strpos($dashboard, "rootMargin:'320px 0px'") !== false,
    'Trips dashboard map observer must keep the near-viewport preload margin');
requireContract(strpos($dashboard, "setTimeout(() => observeDashboardMap(mapId, async () => {") !== false,
    'dynamic trip-card maps must defer until their card approaches the viewport');
requireContract(strpos($dashboard, "\nmakeMap('map-canada'") === false,
    'legacy Canada map must not start unconditionally at page load');
requireContract(($dashboardDiag['maps_key_rewritten'] ?? 0) === 1,
    'Trips dashboard Maps key rewrite count changed');
requireContract(($dashboardDiag['travel_day_filter_rewritten'] ?? 0) === 1,
    'Trips dashboard Travel Day rewrite count changed');
requireContract(strpos($dashboard, "String(c).trim().toLowerCase() !== 'travel day'") !== false,
    'Trips dashboard does not exclude Travel Day at card construction');
requireContract(strpos($dashboard, "const GOOGLE_MAPS_API_KEY = \"RendererContractTestKey1234567890\";") !== false,
    'Trips dashboard did not receive configured browser Maps key');
assertOnlyConfiguredGoogleKeys($dashboard, 'Trips dashboard');

$parkSource = readTemplate('parks/map.html');
[$park, $parkDiag] = applyGoogleMapsScriptRuntimeSafety($parkSource);
requireContract(($parkDiag['maps_script_key_rewritten'] ?? 0) === 1,
    'park map script-key rewrite count changed');
requireContract(strpos($park, 'key=RendererContractTestKey1234567890&callback=gmReady') !== false,
    'park map did not receive configured browser Maps key');
assertOnlyConfiguredGoogleKeys($park, 'park map');

fwrite(STDOUT, "renderer contracts: ok\n");
