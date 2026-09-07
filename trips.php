<?php
// Trips dashboard renderer. Keeps the dashboard source free from active browser
// API credentials at runtime while preserving the existing HTML/JS unchanged.
require_once __DIR__ . '/template-runtime.php';

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');

$template = file_get_contents(__DIR__ . '/trips/index.html');
if ($template === false) {
    http_response_code(500);
    echo 'Trips dashboard is unavailable.';
    exit;
}

[$page, $diag] = applyTripsDashboardRuntimeSafety($template);
if (($diag['maps_key_rewritten'] ?? 0) !== 1
    || ($diag['travel_day_filter_rewritten'] ?? 0) !== 1
    || ($diag['registry_error_handling_rewritten'] ?? 0) !== 1
    || ($diag['countdown_registry_error_rewritten'] ?? 0) !== 1) {
    http_response_code(500);
    echo 'Trips dashboard could not be rendered safely.';
    exit;
}

// Keep the historical mileage baseline aligned with the latest travelled total.
// Porto is already included in this figure, so its registry entry must not add
// another estimated journey mileage. It still contributes to trip/country stats.
$page = str_replace(
    'const PS_MILES = 205021;',
    'const PS_MILES = 206825;',
    $page,
    $milesBaselineCount
);
$page = str_replace(
    'if (flags.length) liveMiles += estimateMilesForCountries(flags);',
    "if (flags.length && !['porto-2026','porto-2026-v2'].includes(t.slug)) liveMiles += estimateMilesForCountries(flags);",
    $page,
    $portoMileageCount
);
if ($milesBaselineCount !== 1 || $portoMileageCount !== 1) {
    http_response_code(500);
    echo 'Trips dashboard mileage stats could not be attached safely.';
    exit;
}

// The homepage already uses cache-busted authentication/database assets. The
// dashboard must use the exact same current runtimes so navigation from the
// homepage keeps the existing session instead of ever loading a stale PIN gate.
$authVersion = @filemtime(__DIR__ . '/auth.js') ?: time();
$dbVersion = @filemtime(__DIR__ . '/db.js') ?: time();
$page = preg_replace('~src="/auth\.js\?v=[^"]+"~', 'src="/auth.js?v=' . $authVersion . '"', $page);
$page = preg_replace('~src="/db\.js\?v=[^"]+"~', 'src="/db.js?v=' . $dbVersion . '"', $page);

// Override the legacy two-step dashboard creator only after its original script
// has loaded. The replacement uses trip-create.php to commit the itinerary and
// registry entry atomically.
$createScript = '<script src="/trip-dashboard-create.js?v=1"></script>';
$page = str_replace('</body>', $createScript . "\n</body>", $page, $createScriptCount);
if ($createScriptCount !== 1) {
    http_response_code(500);
    echo 'Trips dashboard creation module could not be loaded.';
    exit;
}

echo $page;