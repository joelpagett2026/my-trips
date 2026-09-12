<?php
// Theme park map renderer. Keeps the public HTML source free from an active
// Google browser key and injects the server-configured restricted key at runtime.
require_once __DIR__ . '/template-runtime.php';

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');

$template = file_get_contents(__DIR__ . '/parks/map.html');
if ($template === false) {
    http_response_code(500);
    echo 'Park map is unavailable.';
    exit;
}

// Theme Park Tracker has its own green section identity. Recolour the map page at
// render time so the Google marker symbol, legend, score pills and detail accents
// all match the same Attractions green used throughout the rest of /parks/.
$template = str_replace(
    [
        '#0e7a87', '#12a0af', '#0a6570', '#0e3a3f', '#1a2a2a',
        '#f4fafb', '#e6f9f7', '#dfe5e5',
        'rgba(14,122,135,', 'rgba(18,160,175,', 'rgba(10,101,112,'
    ],
    [
        '#6c8966', '#7f9d77', '#55704f', '#40513c', '#2d382b',
        '#f4f7f3', '#edf3eb', '#e4e9e2',
        'rgba(108,137,102,', 'rgba(127,157,119,', 'rgba(85,112,79,'
    ],
    $template
);

[$page, $diag] = applyGoogleMapsScriptRuntimeSafety($template);
if (($diag['maps_script_key_rewritten'] ?? 0) !== 1) {
    http_response_code(500);
    echo 'Park map could not be rendered safely.';
    exit;
}

echo $page;
