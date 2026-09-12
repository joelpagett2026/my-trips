<?php
// Theme Park Tracker renderer. Every Theme Park page is served through this
// shell so the whole section has one green identity while the underlying HTML
// remains the reusable presentation source. The map route also receives the
// restricted Google browser key at runtime.
require_once __DIR__ . '/template-runtime.php';

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

$page = strtolower(trim((string)($_GET['page'] ?? 'map')));
$templates = [
    'index' => __DIR__ . '/parks/index.html',
    'credits' => __DIR__ . '/parks/credits.html',
    'coasters' => __DIR__ . '/parks/coasters.html',
    'map' => __DIR__ . '/parks/map.html',
];

if (!isset($templates[$page])) {
    http_response_code(404);
    echo 'Theme Park page not found.';
    exit;
}

$template = @file_get_contents($templates[$page]);
if ($template === false) {
    http_response_code(500);
    echo 'Theme Park Tracker is unavailable.';
    exit;
}

// Apply the Attractions green directly at render time. This deliberately replaces
// the old teal literals in each Theme Park source page, including inline styles,
// buttons, stars, score pills, form focus states, cards and Google-map marker data.
$template = str_replace(
    [
        '#0e7a87', '#12a0af', '#0a6570', '#0e3a3f', '#1a2a2a',
        '#f4fafb', '#e6f9f7', '#dfe5e5',
        'rgba(14,122,135,', 'rgba(18,160,175,', 'rgba(10,101,112,',
        'rgb(14,122,135)', 'rgb(18,160,175)', 'rgb(10,101,112)'
    ],
    [
        '#6c8966', '#7f9d77', '#55704f', '#40513c', '#2d382b',
        '#f4f7f3', '#edf3eb', '#e4e9e2',
        'rgba(108,137,102,', 'rgba(127,157,119,', 'rgba(85,112,79,',
        'rgb(108,137,102)', 'rgb(127,157,119)', 'rgb(85,112,79)'
    ],
    $template
);

// Force a fresh copy of the shared structural stylesheet on Theme Park pages.
// The section palette itself no longer depends on that stylesheet being updated.
$template = str_replace(
    'href="/holidays/holiday-style.css"',
    'href="/holidays/holiday-style.css?v=parks-green-20260912"',
    $template
);

if ($page === 'map') {
    [$template, $diag] = applyGoogleMapsScriptRuntimeSafety($template);
    if (($diag['maps_script_key_rewritten'] ?? 0) !== 1) {
        http_response_code(500);
        echo 'Park map could not be rendered safely.';
        exit;
    }
}

echo $template;
