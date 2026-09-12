<?php
// Section renderer for Theme Park Tracker and Holiday Allowance. Both sections
// keep their existing HTML as the presentation source, while their section colour
// is applied server-side before the page reaches the browser. The Theme Park map
// also receives the restricted Google browser key at runtime.
require_once __DIR__ . '/template-runtime.php';

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

function applySectionPalette(string $source, array $replacement): string {
    return str_ireplace(array_keys($replacement), array_values($replacement), $source);
}

$parkPalette = [
    '#0e7a87' => '#6c8966',
    '#12a0af' => '#7f9d77',
    '#11a8b9' => '#7f9d77',
    '#0a6570' => '#55704f',
    '#0e3a3f' => '#40513c',
    '#1a2a2a' => '#2d382b',
    '#f4fafb' => '#f4f7f3',
    '#e6f9f7' => '#edf3eb',
    '#dfe5e5' => '#e4e9e2',
    'rgba(14,122,135,' => 'rgba(108,137,102,',
    'rgba(18,160,175,' => 'rgba(127,157,119,',
    'rgba(17,168,185,' => 'rgba(127,157,119,',
    'rgba(10,101,112,' => 'rgba(85,112,79,',
    'rgb(14,122,135)' => 'rgb(108,137,102)',
    'rgb(18,160,175)' => 'rgb(127,157,119)',
    'rgb(17,168,185)' => 'rgb(127,157,119)',
    'rgb(10,101,112)' => 'rgb(85,112,79)',
];

// Holiday Allowance uses a muted purple family, deliberately comparable in
// saturation and weight to the Attractions green used by Theme Park Tracker.
$holidayPalette = [
    '#0e7a87' => '#76699f',
    '#12a0af' => '#9182bd',
    '#11a8b9' => '#9182bd',
    '#0a6570' => '#5f5484',
    '#0e3a3f' => '#453c65',
    '#1a2a2a' => '#312d3c',
    '#f4fafb' => '#f6f4fa',
    '#e6f9f7' => '#f0edf7',
    '#dfe5e5' => '#e8e4f0',
    'rgba(14,122,135,' => 'rgba(118,105,159,',
    'rgba(18,160,175,' => 'rgba(145,130,189,',
    'rgba(17,168,185,' => 'rgba(145,130,189,',
    'rgba(10,101,112,' => 'rgba(95,84,132,',
    'rgb(14,122,135)' => 'rgb(118,105,159)',
    'rgb(18,160,175)' => 'rgb(145,130,189)',
    'rgb(17,168,185)' => 'rgb(145,130,189)',
    'rgb(10,101,112)' => 'rgb(95,84,132)',
];

$section = strtolower(trim((string)($_GET['section'] ?? 'parks')));
$defaultPage = $section === 'holidays' ? 'index' : 'map';
$page = strtolower(trim((string)($_GET['page'] ?? $defaultPage)));

if ($section === 'holidays') {
    $templates = [
        'index' => __DIR__ . '/holidays/index.html',
        '2025-26' => __DIR__ . '/holidays/2025-26.html',
        '2026-27' => __DIR__ . '/holidays/2026-27.html',
        '2027-28' => __DIR__ . '/holidays/2027-28.html',
        'jonathan' => __DIR__ . '/holidays/jonathan/index.html',
        'jonathan-2026' => __DIR__ . '/holidays/jonathan/2026.html',
        'jonathan-2027' => __DIR__ . '/holidays/jonathan/2027.html',
    ];

    if (!isset($templates[$page])) {
        http_response_code(404);
        echo 'Holiday Allowance page not found.';
        exit;
    }

    $template = @file_get_contents($templates[$page]);
    $sharedCss = @file_get_contents(__DIR__ . '/holidays/holiday-style.css');
    if ($template === false || $sharedCss === false) {
        http_response_code(500);
        echo 'Holiday Allowance is unavailable.';
        exit;
    }

    // Recolour both the page-specific inline styles and the shared Holiday CSS.
    // Inlining the transformed shared stylesheet makes the purple section identity
    // independent of browser cache state and prevents old teal rules leaking back.
    $template = applySectionPalette($template, $holidayPalette);
    $sharedCss = applySectionPalette($sharedCss, $holidayPalette);
    $themeStyle = "<style id=\"holiday-purple-section-theme\">\n" . $sharedCss . "\n</style>";

    $cssLinkPattern = '~<link\s+rel=["\']stylesheet["\']\s+href=["\']/holidays/holiday-style\.css(?:\?[^"\']*)?["\']\s*/?>~i';
    $template = preg_replace($cssLinkPattern, $themeStyle, $template, 1, $cssLinkCount);
    if ($template === null) {
        http_response_code(500);
        echo 'Holiday Allowance theme could not be rendered.';
        exit;
    }
    if (($cssLinkCount ?? 0) !== 1) {
        $template = str_replace('</head>', $themeStyle . "\n</head>", $template, $headCount);
        if ($headCount !== 1) {
            http_response_code(500);
            echo 'Holiday Allowance theme could not be attached.';
            exit;
        }
    }

    echo $template;
    exit;
}

if ($section !== 'parks') {
    http_response_code(404);
    echo 'Section not found.';
    exit;
}

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
$template = applySectionPalette($template, $parkPalette);

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
