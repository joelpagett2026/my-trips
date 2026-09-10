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

$dashboardSource = readTemplate('trips/index.html');
[$dashboard, $dashboardDiag] = applyTripsDashboardRuntimeSafety($dashboardSource);
requireContract(($dashboardDiag['maps_key_rewritten'] ?? 0) === 1,
    'Trips dashboard Maps key rewrite count changed');
requireContract(($dashboardDiag['travel_day_filter_rewritten'] ?? 0) === 1,
    'Trips dashboard Travel Day rewrite count changed');
requireContract(strpos($dashboard, "String(c).trim().toLowerCase() !== 'travel day'") !== false,
    'Trips dashboard does not exclude Travel Day at card construction');
requireContract(strpos($dashboard, "const GOOGLE_MAPS_API_KEY = \"RendererContractTestKey1234567890\";") !== false,
    'Trips dashboard did not receive configured browser Maps key');
assertOnlyConfiguredGoogleKeys($dashboard, 'Trips dashboard');

// Exercise the actual dashboard renderer as well. This catches runtime wrapper
// failures that syntax/static transformation checks cannot see.
ob_start();
include __DIR__ . '/../trips.php';
$renderedDashboard = ob_get_clean();
requireContract(strpos($renderedDashboard, 'Trips dashboard Porto history could not be attached safely.') === false,
    'Porto history runtime injection failed');
requireContract(substr_count($renderedDashboard, '{name:"Porto",start:"Aug 2026",codes:["pt"]},') === 2,
    'rendered dashboard should contain Porto in both completed-history datasets');
requireContract(strpos($renderedDashboard, 'Your saved trips have not been changed') !== false,
    'rendered dashboard lost registry failure safety message');

// Branch-only live trace to identify which production verification assertion is
// currently failing. It is deliberately diagnostic and does not change production.
function curlStatusAndBody(string $url, string $method = 'GET', string $data = ''): array {
    $tmp = tempnam(sys_get_temp_dir(), 'live-check-');
    $cmd = 'curl --show-error --silent --output ' . escapeshellarg($tmp)
        . ' --write-out "%{http_code}"';
    if ($method !== 'GET') {
        $cmd .= ' --request ' . escapeshellarg($method);
    }
    if ($data !== '') {
        $cmd .= ' --header ' . escapeshellarg('Content-Type: application/json')
            . ' --data ' . escapeshellarg($data);
    }
    $cmd .= ' ' . escapeshellarg($url);
    $status = trim((string)shell_exec($cmd));
    $body = (string)@file_get_contents($tmp);
    @unlink($tmp);
    return [$status, $body];
}

[$liveTripsStatus, $liveTrips] = curlStatusAndBody('https://joelpagett.co.uk/trips/');
fwrite(STDOUT, 'live trips status=' . $liveTripsStatus
    . ' auth=' . (preg_match('~src="/auth\\.js\\?v=[0-9]+"~', $liveTrips) ? 'yes' : 'no')
    . ' db=' . (preg_match('~src="/db\\.js\\?v=[0-9]+"~', $liveTrips) ? 'yes' : 'no')
    . ' safe-message=' . (strpos($liveTrips, 'Your saved trips have not been changed') !== false ? 'yes' : 'no')
    . ' old-swallow=' . (strpos($liveTrips, 'try{ return await window.dbLoadRegistry(); }catch{ return []; }') !== false ? 'yes' : 'no')
    . ' porto-history=' . (strpos($liveTrips, '{name:"Porto",start:"Aug 2026",codes:["pt"]},') !== false ? 'yes' : 'no')
    . "\n");

[$liveTripStatus, $liveTrip] = curlStatusAndBody('https://joelpagett.co.uk/porto-2026');
fwrite(STDOUT, 'live porto status=' . $liveTripStatus
    . ' auth=' . (preg_match('~src="/auth\\.js\\?v=[0-9]+"~', $liveTrip) ? 'yes' : 'no')
    . ' db=' . (preg_match('~src="/db\\.js\\?v=[0-9]+"~', $liveTrip) ? 'yes' : 'no')
    . "\n");

[$activityStatus, $activity] = curlStatusAndBody('https://joelpagett.co.uk/activity-editor.js?verify-controller=1');
fwrite(STDOUT, 'live activity status=' . $activityStatus
    . ' controller=' . (strpos($activity, '__activityEditorControllerV1') !== false ? 'yes' : 'no')
    . ' save-listener=' . (strpos($activity, "save.addEventListener('click', onSaveClick)") !== false ? 'yes' : 'no')
    . ' unsafe-pointer=' . (strpos($activity, "setImportant(overlay, 'pointer-events'") !== false ? 'yes' : 'no')
    . "\n");

[$authStatus, $authBody] = curlStatusAndBody('https://joelpagett.co.uk/auth.js?verify-restored-gate=1');
fwrite(STDOUT, 'live auth status=' . $authStatus
    . ' pin=' . (strpos($authBody, 'Enter your PIN to continue') !== false ? 'yes' : 'no')
    . ' temporary-access=' . (strpos($authBody, 'temporary_access') !== false ? 'yes' : 'no')
    . "\n");

[$tempStatus] = curlStatusAndBody('https://joelpagett.co.uk/auth-v2.php?action=temporary_access', 'POST', '{}');
[$recordStatus] = curlStatusAndBody('https://joelpagett.co.uk/record.php?action=load&id=trip-registry');
[$checkStatus] = curlStatusAndBody('https://joelpagett.co.uk/auth-v2.php?action=check', 'POST', '{}');
fwrite(STDOUT, "live API statuses temporary={$tempStatus} record={$recordStatus} check={$checkStatus}\n");

$parkSource = readTemplate('parks/map.html');
[$park, $parkDiag] = applyGoogleMapsScriptRuntimeSafety($parkSource);
requireContract(($parkDiag['maps_script_key_rewritten'] ?? 0) === 1,
    'park map script-key rewrite count changed');
requireContract(strpos($park, 'key=RendererContractTestKey1234567890&callback=gmReady') !== false,
    'park map did not receive configured browser Maps key');
assertOnlyConfiguredGoogleKeys($park, 'park map');

fwrite(STDOUT, "renderer contracts: ok\n");