<?php
// Public read-only share renderer. The share token is still validated by
// api.php?action=share_load in the browser; this file only serves the common
// template after removing legacy credentials from its source.
require_once __DIR__ . '/template-runtime.php';

header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');

$token = trim((string)($_GET['t'] ?? ''));
if (!preg_match('/^[a-f0-9]{24}$/i', $token)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=UTF-8');
    echo 'This share link is not valid.';
    exit;
}

// auth.js determines share mode from the actual URL before the itinerary's
// inline script executes. Canonicalize t-only links so the PIN gate is bypassed
// for read-only shares from the very first script execution.
if (!isset($_GET['share']) || (string)$_GET['share'] !== '1') {
    header('Location: /share.php?share=1&t=' . rawurlencode($token), true, 302);
    exit;
}

header('Content-Type: text/html; charset=UTF-8');
$template = file_get_contents(__DIR__ . '/new-trip-v2.html');
if ($template === false) {
    http_response_code(500);
    echo 'Shared itinerary template is unavailable.';
    exit;
}

[$page, $diag] = applyItineraryRuntimeSafety($template);
if (($diag['auth_const_removed'] ?? 0) !== 1
    || ($diag['auth_headers_rewritten'] ?? 0) < 1
    || ($diag['maps_key_rewritten'] ?? 0) !== 1) {
    http_response_code(500);
    echo 'Shared itinerary could not be rendered safely.';
    exit;
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
