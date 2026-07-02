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
$itineraries = [
    ['slug' => 'china-2026',      'filename' => 'china.html',             'dest' => 'China',              'dep' => '31/03/2026', 'ret' => '17/04/2026', 'trav' => '2', 'status' => 'past'],
    ['slug' => 'dubai-2025',      'filename' => 'dubai.html',             'dest' => 'Dubai & Abu Dhabi',  'dep' => '26/12/2025', 'ret' => '09/01/2026', 'trav' => '2', 'status' => 'past'],
    ['slug' => 'costa-rica-2025', 'filename' => 'costa-rica.html',        'dest' => 'Costa Rica',         'dep' => '04/04/2025', 'ret' => '21/04/2025', 'trav' => '2', 'status' => 'past'],
    ['slug' => 'canada-2027',     'filename' => 'canada.html',            'dest' => 'Canada Road Trip',   'dep' => '25/09/2027', 'ret' => '10/10/2027', 'trav' => '2', 'status' => 'upcoming'],
    ['slug' => 'hk-taiwan-2027',  'filename' => 'hong-kong-taiwan.html',  'dest' => 'Hong Kong & Taiwan', 'dep' => '27/03/2027', 'ret' => '12/04/2027', 'trav' => '2', 'status' => 'planning'],
    ['slug' => 'porto-2026',      'filename' => 'porto-2026.html',        'dest' => 'Porto',              'dep' => '29/08/2026', 'ret' => '04/09/2026', 'trav' => '2', 'status' => 'upcoming'],
    ['slug' => 'gothenburg-2026', 'filename' => 'gothenburg-2026.html',   'dest' => 'Gothenburg',         'dep' => '09/10/2026', 'ret' => '12/10/2026', 'trav' => '2', 'status' => 'planning'],
    ['slug' => 'cyprus-2026',     'filename' => 'cyprus-2026.html',       'dest' => 'Cyprus',             'dep' => '23/12/2026', 'ret' => '30/12/2026', 'trav' => '2', 'status' => 'upcoming'],
    ['slug' => 'hamburg',         'filename' => 'hamburg.html',           'dest' => 'Hamburg',            'dep' => '18/09/2026', 'ret' => '21/09/2026', 'trav' => '4', 'status' => 'planning'],
    ['slug' => 'graz-ljubljana-lake-bled-2027', 'filename' => 'graz-ljubljana-lake-bled-2027.html', 'dest' => 'Graz, Ljubljana & Lake Bled', 'dep' => '28/05/2027', 'ret' => '02/06/2027', 'trav' => '2', 'status' => 'planning'],
];

// ── ENSURE SUBDIRECTORIES EXIST ──────────────────────────────────────
foreach (['trips', 'holidays', 'holidays/jonathan', 'concerts', 'icons'] as $dir) {
    $dirPath = PUBLIC_HTML . '/' . $dir;
    if (!is_dir($dirPath)) {
        mkdir($dirPath, 0755, true);
    }
}

// ── REGENERATE ALL ITINERARY PAGES FROM TEMPLATE ─────────────────────
$template = file_get_contents(REPO_PATH . '/new-trip.html');
$regenerated = [];
$regen_failed = [];

if ($template) {
    $placeholder = "// Read URL params
const params = new URLSearchParams(window.location.search);
const dest   = params.get('dest') || 'New Trip';
const dep    = params.get('dep')  || '';
const ret    = params.get('ret')  || '';
const trav   = params.get('trav') || '2';
const status = params.get('status') || 'upcoming';
const slug   = params.get('slug') || 'new-trip';

// Use slug as the database record ID
const RECORD_ID = slug;";

    foreach ($itineraries as $trip) {
        $baked = "// Baked-in trip data\n"
            . "const dest   = " . json_encode($trip['dest'])   . ";\n"
            . "const dep    = " . json_encode($trip['dep'])    . ";\n"
            . "const ret    = " . json_encode($trip['ret'])    . ";\n"
            . "const trav   = " . json_encode($trip['trav'])   . ";\n"
            . "const status = " . json_encode($trip['status']) . ";\n"
            . "const slug   = " . json_encode($trip['slug'])   . ";\n\n"
            . "// Use slug as the database record ID\n"
            . "const RECORD_ID = slug;";

        $page = str_replace($placeholder, $baked, $template);
        $page = preg_replace('/<title>.*?<\/title>/', '<title>' . htmlspecialchars($trip['dest']) . ' · Itinerary</title>', $page);

        $outPath     = PUBLIC_HTML . '/trips/' . $trip['filename'];
        $outPathRoot = PUBLIC_HTML . '/' . $trip['filename'];
        $written = file_put_contents($outPath, $page);
        file_put_contents($outPathRoot, $page); // keep root copy in sync
        if ($written !== false) {
            $regenerated[] = $trip['filename'];
        } else {
            $regen_failed[] = $trip['filename'];
        }
    }
}

// ── COPY CORE + NON-ITINERARY FILES FROM REPO ────────────────────────
$coreFiles = [
    'api.php', 'auth.js', 'db.js', 'datepicker.js',
    'itinerary-style.css', 'deploy-webhook.php',
    'index.html', 'new-trip.html', 'settings.html',
    'robots.txt', '.htaccess', 'favicon.ico',
    'tile-test-temp.html',
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
    'icons/favicon.ico' => 'icons/favicon.ico',
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
