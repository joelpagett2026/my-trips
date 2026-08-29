<?php
// MY TRIPS — Settings renderer
// Keep settings.html as the presentation source while attaching isolated runtime
// helpers and cache-busting critical auth/database assets.
header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

$templatePath = __DIR__ . '/settings.html';
$html = @file_get_contents($templatePath);
if ($html === false) {
    http_response_code(500);
    echo '<!doctype html><title>Settings unavailable</title><p>Settings could not be loaded.</p>';
    exit;
}

$authVersion = @filemtime(__DIR__ . '/auth.js') ?: time();
$dbVersion = @filemtime(__DIR__ . '/db.js') ?: time();
$settingsVersion = @filemtime(__DIR__ . '/settings-backup.js') ?: time();
$html = preg_replace('~src="/auth\.js\?v=[^"]+"~', 'src="/auth.js?v=' . $authVersion . '"', $html);
$html = preg_replace('~src="/db\.js\?v=[^"]+"~', 'src="/db.js?v=' . $dbVersion . '"', $html);

$asset = '<script src="/settings-backup.js?v=' . $settingsVersion . '"></script>';
$count = 0;
$html = str_replace('</body>', $asset . "\n</body>", $html, $count);
if ($count !== 1) {
    http_response_code(500);
    echo '<!doctype html><title>Settings unavailable</title><p>Settings runtime could not be attached safely.</p>';
    exit;
}

echo $html;
