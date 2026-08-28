<?php
// MY TRIPS — temporary recovery renderer
// During PIN recovery the homepage and Settings are rendered through this file
// so both receive a brand-new auth.js URL. This prevents any stale cached copy of
// the old PIN overlay from being reused while the owner resets the PIN.
header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

$isHome = (string)($_GET['view'] ?? '') === 'home';
$templatePath = __DIR__ . ($isHome ? '/index.html' : '/settings.html');
$html = @file_get_contents($templatePath);
if ($html === false) {
    http_response_code(500);
    echo '<!doctype html><title>Page unavailable</title><p>The page could not be loaded.</p>';
    exit;
}

// Force a unique URL for the already-deployed no-gate auth runtime. The old PIN
// overlay does not exist in the current auth.js, and this cache-bust ensures the
// browser cannot reuse an earlier version that did contain it.
$html = str_replace('/auth.js?v=3', '/auth.js?v=recovery-20260828-final', $html);

if (!$isHome) {
    $asset = '<script src="/settings-backup.js?v=recovery-20260828-final"></script>';
    $count = 0;
    $html = str_replace('</body>', $asset . "\n</body>", $html, $count);
    if ($count !== 1) {
        http_response_code(500);
        echo '<!doctype html><title>Settings unavailable</title><p>Settings runtime could not be attached safely.</p>';
        exit;
    }
}

echo $html;
