<?php
// Public read-only share renderer. The share token is still validated by
// api.php?action=share_load in the browser; this file only serves the common
// template after removing legacy credentials from its source.
require_once __DIR__ . '/template-runtime.php';

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');

$token = trim((string)($_GET['t'] ?? ''));
if (!preg_match('/^[a-f0-9]{24}$/i', $token)) {
    http_response_code(404);
    echo 'This share link is not valid.';
    exit;
}

$template = file_get_contents(__DIR__ . '/new-trip-v2.html');
if ($template === false) {
    http_response_code(500);
    echo 'Shared itinerary template is unavailable.';
    exit;
}

[$page, $diag] = applyItineraryRuntimeSafety($template);
if (($diag['auth_const_removed'] ?? 0) !== 1 || ($diag['maps_key_rewritten'] ?? 0) !== 1) {
    http_response_code(500);
    echo 'Shared itinerary could not be rendered safely.';
    exit;
}

// Ensure share mode is present even if someone navigates directly to share.php?t=...
if (!isset($_GET['share'])) {
    $page = str_replace(
        "const _shareParams  = new URLSearchParams(window.location.search);",
        "const _shareParams  = new URLSearchParams(window.location.search);\n_shareParams.set('share', '1');",
        $page,
        $shareModeCount
    );
    if ($shareModeCount === 0) {
        http_response_code(500);
        echo 'Shared itinerary could not be initialized safely.';
        exit;
    }
}

$page = str_replace('/auth.js?v=1', '/auth.js?v=3', $page);
$page = str_replace('/db.js?v=1', '/db.js?v=2', $page);
$page = str_replace(
    '</body>',
    '<script src="/itinerary-ui.js?v=1"></script>' . "\n</body>",
    $uiCount
);
if ($uiCount === 0) {
    http_response_code(500);
    echo 'Shared itinerary shell is incomplete.';
    exit;
}

echo $page;
