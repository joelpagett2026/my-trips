<?php
// MY TRIPS — homepage renderer
// Keep the presentation in index.html but attach cache-busted critical runtimes so
// an old authentication script can never survive a security deployment.
header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

$templatePath = __DIR__ . '/index.html';
$html = @file_get_contents($templatePath);
if ($html === false) {
    http_response_code(500);
    echo '<!doctype html><title>Homepage unavailable</title><p>The homepage could not be loaded.</p>';
    exit;
}

$authVersion = @filemtime(__DIR__ . '/auth.js') ?: time();
$dbVersion = @filemtime(__DIR__ . '/db.js') ?: time();
$html = preg_replace('~src="/auth\.js\?v=[^"]+"~', 'src="/auth.js?v=' . $authVersion . '"', $html);
$html = preg_replace('~src="/db\.js\?v=[^"]+"~', 'src="/db.js?v=' . $dbVersion . '"', $html);

echo $html;
