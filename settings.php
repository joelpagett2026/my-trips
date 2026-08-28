<?php
// MY TRIPS — Settings renderer
// Keeps settings.html as the presentation source while attaching small isolated
// runtime modules without making auth.js or db.js responsible for Settings UI.
header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');

$templatePath = __DIR__ . '/settings.html';
$html = @file_get_contents($templatePath);
if ($html === false) {
    http_response_code(500);
    echo '<!doctype html><title>Settings unavailable</title><p>Settings could not be loaded.</p>';
    exit;
}

$asset = '<script src="/settings-backup.js?v=1"></script>';
$count = 0;
$html = str_replace('</body>', $asset . "\n</body>", $html, $count);
if ($count !== 1) {
    http_response_code(500);
    echo '<!doctype html><title>Settings unavailable</title><p>Settings runtime could not be attached safely.</p>';
    exit;
}

echo $html;
