<?php
// Executable integration checks for the runtime HTML sanitizers. These verify
// that the actual source templates still match every deliberate transformation,
// not merely that the helper functions contain expected strings.

putenv('MAPS_BROWSER_KEY=AIzaRendererContractTestKey1234567890');
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
            $key === 'AIzaRendererContractTestKey1234567890',
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
requireContract(strpos($itinerary, "const MAPS_API_KEY = \"AIzaRendererContractTestKey1234567890\";") !== false,
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

$dashboardSource = readTemplate('trips/index.html');
[$dashboard, $dashboardDiag] = applyTripsDashboardRuntimeSafety($dashboardSource);
requireContract(($dashboardDiag['maps_key_rewritten'] ?? 0) === 1,
    'Trips dashboard Maps key rewrite count changed');
requireContract(($dashboardDiag['travel_day_filter_rewritten'] ?? 0) === 1,
    'Trips dashboard Travel Day rewrite count changed');
requireContract(strpos($dashboard, "String(c).trim().toLowerCase() !== 'travel day'") !== false,
    'Trips dashboard does not exclude Travel Day at card construction');
requireContract(strpos($dashboard, "const GOOGLE_MAPS_API_KEY = \"AIzaRendererContractTestKey1234567890\";") !== false,
    'Trips dashboard did not receive configured browser Maps key');
assertOnlyConfiguredGoogleKeys($dashboard, 'Trips dashboard');

$parkSource = readTemplate('parks/map.html');
[$park, $parkDiag] = applyGoogleMapsScriptRuntimeSafety($parkSource);
requireContract(($parkDiag['maps_script_key_rewritten'] ?? 0) === 1,
    'park map script-key rewrite count changed');
requireContract(strpos($park, 'key=AIzaRendererContractTestKey1234567890&callback=gmReady') !== false,
    'park map did not receive configured browser Maps key');
assertOnlyConfiguredGoogleKeys($park, 'park map');

fwrite(STDOUT, "renderer contracts: ok\n");
