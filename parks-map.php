<?php
// Section renderer for Theme Park Tracker, Holiday Allowance and Concert Log.
require_once __DIR__ . '/template-runtime.php';

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

function applySectionPalette(string $source, array $replacement): string {
    return str_ireplace(array_keys($replacement), array_values($replacement), $source);
}

$parkPalette = [
    '#0e7a87' => '#6c8966', '#12a0af' => '#7f9d77', '#11a8b9' => '#7f9d77',
    '#0a6570' => '#55704f', '#0e3a3f' => '#40513c', '#1a2a2a' => '#2d382b',
    '#f4fafb' => '#f4f7f3', '#e6f9f7' => '#edf3eb', '#dfe5e5' => '#e4e9e2',
    'rgba(14,122,135,' => 'rgba(108,137,102,', 'rgba(18,160,175,' => 'rgba(127,157,119,',
    'rgba(17,168,185,' => 'rgba(127,157,119,', 'rgba(10,101,112,' => 'rgba(85,112,79,',
    'rgb(14,122,135)' => 'rgb(108,137,102)', 'rgb(18,160,175)' => 'rgb(127,157,119)',
    'rgb(17,168,185)' => 'rgb(127,157,119)', 'rgb(10,101,112)' => 'rgb(85,112,79)',
];

$holidayPalette = [
    '#0e7a87' => '#76699f', '#12a0af' => '#9182bd', '#11a8b9' => '#9182bd',
    '#0a6570' => '#5f5484', '#0e3a3f' => '#453c65', '#1a2a2a' => '#312d3c',
    '#f4fafb' => '#f6f4fa', '#e6f9f7' => '#f0edf7', '#dfe5e5' => '#e8e4f0',
    'rgba(14,122,135,' => 'rgba(118,105,159,', 'rgba(18,160,175,' => 'rgba(145,130,189,',
    'rgba(17,168,185,' => 'rgba(145,130,189,', 'rgba(10,101,112,' => 'rgba(95,84,132,',
    'rgb(14,122,135)' => 'rgb(118,105,159)', 'rgb(18,160,175)' => 'rgb(145,130,189)',
    'rgb(17,168,185)' => 'rgb(145,130,189)', 'rgb(10,101,112)' => 'rgb(95,84,132)',
];

$concertPalette = [
    '#0e7a87' => '#c9792b', '#12a0af' => '#dc9351', '#11a8b9' => '#dc9351',
    '#0a6570' => '#9f5e22', '#0e3a3f' => '#704116', '#1a2a2a' => '#3c3128',
    '#f4fafb' => '#fff8f2', '#e6f9f7' => '#fff1e6', '#dfe5e5' => '#f3e5d8',
    'rgba(14,122,135,' => 'rgba(201,121,43,', 'rgba(18,160,175,' => 'rgba(220,147,81,',
    'rgba(17,168,185,' => 'rgba(220,147,81,', 'rgba(10,101,112,' => 'rgba(159,94,34,',
    'rgb(14,122,135)' => 'rgb(201,121,43)', 'rgb(18,160,175)' => 'rgb(220,147,81)',
    'rgb(17,168,185)' => 'rgb(220,147,81)', 'rgb(10,101,112)' => 'rgb(159,94,34)',
];

function renderSharedCssSection(string $templatePath, array $palette, string $styleId, string $label): void {
    $template = @file_get_contents($templatePath);
    $sharedCss = @file_get_contents(__DIR__ . '/holidays/holiday-style.css');
    if ($template === false || $sharedCss === false) {
        http_response_code(500);
        echo $label . ' is unavailable.';
        exit;
    }

    // holiday-style.css also contains a Theme Park-only override block with
    // !important green rules. Concerts and Holiday Allowance share the structural
    // CSS but must never inherit those park-specific rules, so remove that block
    // before recolouring and inlining the shared stylesheet.
    $parkThemeMarker = '/* ── THEME PARK TRACKER — GREEN SECTION THEME ──';
    $parkThemePos = strpos($sharedCss, $parkThemeMarker);
    if ($parkThemePos !== false) {
        $sharedCss = substr($sharedCss, 0, $parkThemePos);
    }

    $template = applySectionPalette($template, $palette);
    $sharedCss = applySectionPalette($sharedCss, $palette);
    $themeStyle = '<style id="' . $styleId . '">' . "\n" . $sharedCss . "\n</style>";
    $pattern = '~<link\s+rel=["\']stylesheet["\']\s+href=["\']/holidays/holiday-style\.css(?:\?[^"\']*)?["\']\s*/?>~i';
    $template = preg_replace($pattern, $themeStyle, $template, 1, $count);
    if ($template === null) {
        http_response_code(500);
        echo $label . ' theme could not be rendered.';
        exit;
    }
    if (($count ?? 0) !== 1) {
        $template = str_replace('</head>', $themeStyle . "\n</head>", $template, $headCount);
        if ($headCount !== 1) {
            http_response_code(500);
            echo $label . ' theme could not be attached.';
            exit;
        }
    }
    echo $template;
    exit;
}

$section = strtolower(trim((string)($_GET['section'] ?? 'parks')));
$defaultPage = in_array($section, ['holidays', 'concerts'], true) ? 'index' : 'map';
$page = strtolower(trim((string)($_GET['page'] ?? $defaultPage)));

if ($section === 'holidays') {
    $templates = [
        'index' => __DIR__ . '/holidays/index.html', '2025-26' => __DIR__ . '/holidays/2025-26.html',
        '2026-27' => __DIR__ . '/holidays/2026-27.html', '2027-28' => __DIR__ . '/holidays/2027-28.html',
        'jonathan' => __DIR__ . '/holidays/jonathan/index.html',
        'jonathan-2026' => __DIR__ . '/holidays/jonathan/2026.html',
        'jonathan-2027' => __DIR__ . '/holidays/jonathan/2027.html',
    ];
    if (!isset($templates[$page])) { http_response_code(404); echo 'Holiday Allowance page not found.'; exit; }
    renderSharedCssSection($templates[$page], $holidayPalette, 'holiday-purple-section-theme', 'Holiday Allowance');
}

if ($section === 'concerts') {
    $templates = [
        'index' => __DIR__ . '/concerts/index.html',
        'artists' => __DIR__ . '/concerts/artists.html',
    ];
    if (!isset($templates[$page])) { http_response_code(404); echo 'Concert Log page not found.'; exit; }
    renderSharedCssSection($templates[$page], $concertPalette, 'concert-orange-section-theme', 'Concert Log');
}

if ($section !== 'parks') { http_response_code(404); echo 'Section not found.'; exit; }

$templates = [
    'index' => __DIR__ . '/parks/index.html', 'credits' => __DIR__ . '/parks/credits.html',
    'coasters' => __DIR__ . '/parks/coasters.html', 'map' => __DIR__ . '/parks/map.html',
];
if (!isset($templates[$page])) { http_response_code(404); echo 'Theme Park page not found.'; exit; }
$template = @file_get_contents($templates[$page]);
if ($template === false) { http_response_code(500); echo 'Theme Park Tracker is unavailable.'; exit; }
$template = applySectionPalette($template, $parkPalette);
$template = str_replace('href="/holidays/holiday-style.css"', 'href="/holidays/holiday-style.css?v=parks-green-20260912"', $template);
if ($page === 'map') {
    [$template, $diag] = applyGoogleMapsScriptRuntimeSafety($template);
    if (($diag['maps_script_key_rewritten'] ?? 0) !== 1) { http_response_code(500); echo 'Park map could not be rendered safely.'; exit; }
}
echo $template;
