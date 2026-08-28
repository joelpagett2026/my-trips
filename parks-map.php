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

[$page, $diag] = applyGoogleMapsScriptRuntimeSafety($template);
if (($diag['maps_script_key_rewritten'] ?? 0) !== 1) {
    http_response_code(500);
    echo 'Park map could not be rendered safely.';
    exit;
}

echo $page;
