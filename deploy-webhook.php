<?php
// ══════════════════════════════════════════════════════════════════════
//  MY TRIPS — Deploy Webhook
//  Claude calls this URL to automatically pull latest files from GitHub
//  URL: yourdomain.com/deploy-webhook.php?key=YOUR_SECRET_KEY
// ══════════════════════════════════════════════════════════════════════

define('SECRET_KEY', 'jt-deploy-k9x2m4p7q1');
define('REPO_PATH',  '/home/sites/31a/d/dbd40dd264/my-trips');
define('PUBLIC_HTML', '/home/sites/31a/d/dbd40dd264/public_html');

// ── AUTH ──────────────────────────────────────────────────────────────
if (($_GET['key'] ?? '') !== SECRET_KEY) {
    http_response_code(403);
    die(json_encode(['ok' => false, 'error' => 'Forbidden']));
}

header('Content-Type: application/json');

// ── PULL LATEST FROM GITHUB ───────────────────────────────────────────
$output = [];
$return = 0;

exec('cd ' . escapeshellarg(REPO_PATH) . ' && git fetch origin main 2>&1 && git reset --hard origin/main 2>&1', $output, $return);

if ($return !== 0) {
    
// ── COPY SUBDIRECTORY INDEX FILES ────────────────────────────────────
$subdirFiles = [
    'trips/index.html'    => 'trips/index.html',
    'holidays/index.html' => 'holidays/index.html',
    'holidays/holiday-style.css' => 'holidays/holiday-style.css',
    'holidays/2025-26.html' => 'holidays/2025-26.html',
    'holidays/2026-27.html' => 'holidays/2026-27.html',
    'holidays/2027-28.html' => 'holidays/2027-28.html',
    'holidays/jonathan/index.html' => 'holidays/jonathan/index.html',
    'holidays/jonathan/2026.html' => 'holidays/jonathan/2026.html',
    'holidays/jonathan/2027.html' => 'holidays/jonathan/2027.html',
    'concerts/index.html' => 'concerts/index.html',
    'shows/index.html' => 'shows/index.html',
    'shows/list.html' => 'shows/list.html',
    'private/index.html' => 'private/index.html',
    'concerts/artists.html' => 'concerts/artists.html',
    'parks/index.html' => 'parks/index.html',
    'parks/coasters.html' => 'parks/coasters.html',
    'parks/map.html' => 'parks/map.html',
    'parks/credits.html' => 'parks/credits.html',
    'icons/park-theme-park.svg' => 'icons/park-theme-park.svg',
    'icons/show-musicals.svg' => 'icons/show-musicals.svg',
    'icons/show-shows.svg' => 'icons/show-shows.svg',
    'icons/show-comedians.svg' => 'icons/show-comedians.svg',
    'icons/park-roller-coaster.svg' => 'icons/park-roller-coaster.svg',
    'icons/park-worldwide.svg' => 'icons/park-worldwide.svg',
    'icons/nav-itinerary.png' => 'icons/nav-itinerary.png',
    'icons/nav-bookings.png'  => 'icons/nav-bookings.png',
    'icons/nav-map.png'       => 'icons/nav-map.png',
    'icons/nav-budget.png'    => 'icons/nav-budget.png',
];

foreach ($subdirFiles as $src => $dest) {
    $srcPath  = REPO_PATH  . '/' . $src;
    $destPath = PUBLIC_HTML . '/' . $dest;
    if (file_exists($srcPath)) {
        if (copy($srcPath, $destPath)) {
            $copied[] = $src;
        } else {
            $failed[] = $src;
        }
    }
}

echo json_encode([
        'ok'     => false,
        'error'  => 'Git pull failed',
        'output' => implode("\n", $output)
    ]);
    exit;
}

// ── KNOWN ITINERARY PAGES ─────────────────────────────────────────────
// All baked itinerary pages — add new trips here when created.
// These will be regenerated from new-trip.html on every deploy,
// so style/template changes automatically propagate to all pages.
//
// Removed entirely (confirmed zero database record under any of these
// slugs, and none referenced anywhere in the homepage trip-registry —
// verified via api.php?action=list and action=load before removing):
//   china-2026, dubai-2025, costa-rica-2025, canada-2027 — never had
//   any data in this system to begin with.
//   porto-2026 (old v1 slug/page) and hamburg (old v1 slug/page) — also
//   confirmed empty; the real Porto and Hamburg data live under
//   porto-2026-v2 and hamburg-2026 respectively, unaffected by this.
$itineraries = [
    ['slug' => 'hk-taiwan-2027',  'filename' => 'hong-kong-taiwan.html',  'dest' => 'Hong Kong & Taiwan', 'dep' => '27/03/2027', 'ret' => '12/04/2027', 'trav' => '2', 'status' => 'planning'],
    // 'gothenburg-2026' migrated to v2 — now served dynamically via trip.php
    // at the clean URL /gothenburg-2026 (see the v2 comment above). No
    // longer regenerated here to avoid a stale v1 gothenburg-2026.html file.
    // 'cyprus-2026' migrated to v2 — now served dynamically via trip.php
    // at the clean URL /cyprus-2026. No longer regenerated here to avoid
    // a stale v1 cyprus-2026.html file.
    // 'porto-2026' migrated to v2 — now served dynamically via trip.php at
    // the clean URL /porto-2026, same mechanism as Gothenburg/Cyprus. No
    // longer baked here (previously two entries: porto-budget.html via
    // budget-template.html, and porto-v2.html via new-trip-v2.html — both
    // retired; budget-template.html itself removed too, since the Budget
    // view lives inside new-trip-v2.html and this separate baked page was
    // an unused leftover from before that consolidation).
    ['slug' => 'graz-ljubljana-lake-bled-2027', 'filename' => 'graz-ljubljana-lake-bled-2027.html', 'dest' => 'Graz, Ljubljana & Lake Bled', 'dep' => '28/05/2027', 'ret' => '02/06/2027', 'trav' => '2', 'status' => 'planning'],
];

// ── ENSURE SUBDIRECTORIES EXIST ──────────────────────────────────────
@unlink(PUBLIC_HTML . '/concerts/log.html');
@unlink(PUBLIC_HTML . '/share.html');

// Retired static/baked files — removed from $itineraries and the core-file
// copy list above, but deploy only copies/regenerates what IS listed; it
// doesn't remove what's no longer listed, so these need explicit cleanup
// or they'd sit on the live server indefinitely as stale orphaned copies.
// china/dubai/costa-rica/canada: confirmed zero database record under any
// of their slugs and absent from the homepage trip-registry before removal.
// porto-2026(.html)/hamburg(.html): the old empty v1 slugs — the real data
// lives under porto-2026 (now migrated in, see below) and hamburg-2026,
// both unaffected. porto-v2.html/porto-budget.html: Porto migrated off the
// static-bake mechanism onto the same dynamic trip.php system as
// Gothenburg/Cyprus, now served at the clean URL /porto-2026 — no longer
// baked, so nothing to regenerate here any more. budget-template.html/
// budget-style.css: unused since the Budget view moved inside
// new-trip-v2.html itself.
foreach ([
    'china.html', 'dubai.html', 'costa-rica.html', 'canada.html',
    'porto-2026.html', 'hamburg.html', 'porto-v2.html', 'porto-budget.html',
    'budget-template.html', 'budget-style.css',
] as $retired) {
    @unlink(PUBLIC_HTML . '/' . $retired);
    @unlink(PUBLIC_HTML . '/trips/' . $retired);
}

foreach (['trips', 'holidays', 'holidays/jonathan', 'concerts', 'shows', 'parks', 'icons', 'private'] as $dir) {
    $dirPath = PUBLIC_HTML . '/' . $dir;
    if (!is_dir($dirPath)) {
        mkdir($dirPath, 0755, true);
    }
}

// ── REGENERATE ALL ITINERARY PAGES FROM TEMPLATE ─────────────────────
$templateV1  = file_get_contents(REPO_PATH . '/new-trip.html');
$templateV2  = file_get_contents(REPO_PATH . '/new-trip-v2.html');
$regenerated = [];
$regen_failed = [];

$placeholderV1 = "// Read URL params
const params = new URLSearchParams(window.location.search);
const dest   = params.get('dest') || 'New Trip';
const dep    = params.get('dep')  || '';
const ret    = params.get('ret')  || '';
const trav   = params.get('trav') || '2';
const status = params.get('status') || 'upcoming';
const slug   = params.get('slug') || 'new-trip';

// Use slug as the database record ID
const RECORD_ID = slug;";

if ($templateV1) {
    foreach ($itineraries as $trip) {
        if (!empty($trip['template']) && $trip['template'] === 'new-trip-v2.html' && $templateV2) {
            $useTemplate = $templateV2;
        } else {
            $useTemplate = $templateV1;
        }
        $placeholder = $placeholderV1;

        $baked = "// Baked-in trip data\n"
            . "const dest   = " . json_encode($trip['dest'])   . ";\n"
            . "const dep    = " . json_encode($trip['dep'])    . ";\n"
            . "const ret    = " . json_encode($trip['ret'])    . ";\n"
            . "const trav   = " . json_encode($trip['trav'])   . ";\n"
            . "const status = " . json_encode($trip['status']) . ";\n"
            . "const slug   = " . json_encode($trip['slug'])   . ";\n\n"
            . "// Use slug as the database record ID\n"
            . "const RECORD_ID = slug;";

        $page = str_replace($placeholder, $baked, $useTemplate);
        $page = preg_replace('/<title>.*?<\/title>/', '<title>' . htmlspecialchars($trip['dest']) . ' · Itinerary</title>', $page);

        $outPath     = PUBLIC_HTML . '/trips/' . $trip['filename'];
        $outPathRoot = PUBLIC_HTML . '/' . $trip['filename'];
        $written = file_put_contents($outPath, $page);
        file_put_contents($outPathRoot, $page);
        if ($written !== false) {
            $regenerated[] = $trip['filename'];
        } else {
            $regen_failed[] = $trip['filename'];
        }
    }
}

// ── COPY CORE + NON-ITINERARY FILES FROM REPO ────────────────────────
$coreFiles = [
    'api.php', 'db-config.php', 'trip.php', 'auth.js', 'db.js', 'datepicker.js',
    'itinerary-style.css', 'itinerary-v2-style.css', 'deploy-webhook.php',
    'budget-live-redesign.js',
    'index.html', 'new-trip.html', 'new-trip-v2.html', 'settings.html',
    'robots.txt', '.htaccess', 'favicon.ico',
];

$copied = [];
$failed = [];
$skipped = [];

foreach ($coreFiles as $file) {
    $src  = REPO_PATH  . '/' . $file;
    $dest = PUBLIC_HTML . '/' . $file;
    if (file_exists($src)) {
        if (copy($src, $dest)) {
            $copied[] = $file;
        } else {
            $failed[] = $file;
        }
    } else {
        $skipped[] = $file;
    }
}

// ── COPY SUBDIRECTORY INDEX FILES ────────────────────────────────────
$subdirFiles = [
    'trips/index.html'    => 'trips/index.html',
    'holidays/index.html' => 'holidays/index.html',
    'holidays/holiday-style.css' => 'holidays/holiday-style.css',
    'holidays/2025-26.html' => 'holidays/2025-26.html',
    'holidays/2026-27.html' => 'holidays/2026-27.html',
    'holidays/2027-28.html' => 'holidays/2027-28.html',
    'holidays/jonathan/index.html' => 'holidays/jonathan/index.html',
    'holidays/jonathan/2026.html' => 'holidays/jonathan/2026.html',
    'holidays/jonathan/2027.html' => 'holidays/jonathan/2027.html',
    'concerts/index.html' => 'concerts/index.html',
    'shows/index.html' => 'shows/index.html',
    'shows/list.html' => 'shows/list.html',
    'private/index.html' => 'private/index.html',
    'concerts/artists.html' => 'concerts/artists.html',
    'parks/index.html' => 'parks/index.html',
    'parks/coasters.html' => 'parks/coasters.html',
    'parks/map.html' => 'parks/map.html',
    'parks/credits.html' => 'parks/credits.html',
    'icons/favicon.ico' => 'icons/favicon.ico',
    'icons/park-theme-park.svg' => 'icons/park-theme-park.svg',
    'icons/show-musicals.svg' => 'icons/show-musicals.svg',
    'icons/show-shows.svg' => 'icons/show-shows.svg',
    'icons/show-comedians.svg' => 'icons/show-comedians.svg',
    'icons/park-roller-coaster.svg' => 'icons/park-roller-coaster.svg',
    'icons/park-worldwide.svg' => 'icons/park-worldwide.svg',
    'icons/icon-32.png' => 'icons/icon-32.png',
    'icons/icon-192.png' => 'icons/icon-192.png',
    'icons/icon-512.png' => 'icons/icon-512.png',
    'icons/apple-touch-icon.png' => 'icons/apple-touch-icon.png',
    'icons/trips-favicon.ico' => 'icons/trips-favicon.ico',
    'icons/trips-icon-32.png' => 'icons/trips-icon-32.png',
    'icons/trips-apple-touch-icon.png' => 'icons/trips-apple-touch-icon.png',
    'icons/holidays-favicon.ico' => 'icons/holidays-favicon.ico',
    'icons/holidays-icon-32.png' => 'icons/holidays-icon-32.png',
    'icons/holidays-apple-touch-icon.png' => 'icons/holidays-apple-touch-icon.png',
    'icons/concerts-favicon.ico' => 'icons/concerts-favicon.ico',
    'icons/concerts-icon-32.png' => 'icons/concerts-icon-32.png',
    'icons/concerts-apple-touch-icon.png' => 'icons/concerts-apple-touch-icon.png',
    'icons/nav-itinerary.png' => 'icons/nav-itinerary.png',
    'icons/nav-bookings.png' => 'icons/nav-bookings.png',
    'icons/nav-map.png' => 'icons/nav-map.png',
    'icons/nav-budget.png' => 'icons/nav-budget.png',
];

foreach ($subdirFiles as $src => $dest) {
    $srcPath  = REPO_PATH  . '/' . $src;
    $destPath = PUBLIC_HTML . '/' . $dest;
    if (file_exists($srcPath)) {
        if (copy($srcPath, $destPath)) {
            $copied[] = $src;
        } else {
            $failed[] = $src;
        }
    }
}

echo json_encode([
    'ok'          => empty($failed) && empty($regen_failed),
    'copied'      => $copied,
    'regenerated' => $regenerated,
    'failed'      => $failed,
    'regen_failed'=> $regen_failed,
    'git'         => implode("\n", $output),
    'deployed'    => date('Y-m-d H:i:s'),
]);