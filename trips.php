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
    || ($diag['travel_day_filter_rewritten'] ?? 0) !== 1) {
    http_response_code(500);
    echo 'Trips dashboard could not be rendered safely.';
    exit;
}

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