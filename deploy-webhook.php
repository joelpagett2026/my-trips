<?php
// ══════════════════════════════════════════════════════════════════════
// MY TRIPS — Deploy Webhook
// Pulls the latest main branch and copies the live application files.
// Dynamic itineraries are rendered by trip.php + new-trip-v2.html, so this
// deployer must never regenerate baked itinerary HTML.
// ══════════════════════════════════════════════════════════════════════

@include_once __DIR__ . '/secrets.php';

const REPO_PATH   = '/home/sites/31a/d/dbd40dd264/my-trips';
const PUBLIC_HTML = '/home/sites/31a/d/dbd40dd264/public_html';

function deploySecret(): string {
    if (defined('DEPLOY_KEY')) return (string)DEPLOY_KEY;
    $env = getenv('DEPLOY_KEY');
    if ($env !== false && $env !== '') return $env;
    // Temporary compatibility fallback. Remove after DEPLOY_KEY has been
    // installed in server-only secrets.php/environment and rotated.
    return 'jt-deploy-k9x2m4p7q1';
}

header('Content-Type: application/json');

// Prefer a request header so the deploy credential does not appear in URLs,
// proxy logs or browser history. Keep the query-string fallback temporarily
// for manual recovery while the hosting-side secret is being migrated.
$providedKey = (string)($_SERVER['HTTP_X_DEPLOY_KEY'] ?? ($_GET['key'] ?? ''));
if (!$providedKey || !hash_equals(deploySecret(), $providedKey)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Forbidden']);
    exit;
}

// ── PULL LATEST FROM GITHUB ──────────────────────────────────────────
$output = [];
$return = 0;
$gitCmd = 'cd ' . escapeshellarg(REPO_PATH)
    . ' && git fetch origin main 2>&1'
    . ' && git reset --hard origin/main 2>&1';
exec($gitCmd, $output, $return);

// Fail closed. A failed Git update must not copy an old/mixed checkout into
// the live directory.
if ($return !== 0) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Git update failed; live files were left untouched',
        'git' => implode("\n", $output),
    ]);
    exit;
}

// ── ENSURE LIVE DIRECTORIES EXIST ────────────────────────────────────
$directories = [
    'trips', 'holidays', 'holidays/jonathan', 'concerts', 'shows',
    'parks', 'icons', 'private',
];
foreach ($directories as $dir) {
    $path = PUBLIC_HTML . '/' . $dir;
    if (!is_dir($path) && !mkdir($path, 0755, true) && !is_dir($path)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Could not create directory: ' . $dir]);
        exit;
    }
}

// ── REMOVE RETIRED STATIC FILES ──────────────────────────────────────
$retiredFiles = [
    'china.html', 'dubai.html', 'costa-rica.html', 'canada.html',
    'hong-kong-taiwan.html', 'graz-ljubljana-lake-bled-2027.html',
    'porto-2026.html', 'hamburg.html', 'porto-v2.html', 'porto-budget.html',
    'budget-template.html', 'budget-style.css', 'share.html',
];
foreach ($retiredFiles as $retired) {
    @unlink(PUBLIC_HTML . '/' . $retired);
    @unlink(PUBLIC_HTML . '/trips/' . $retired);
}
@unlink(PUBLIC_HTML . '/concerts/log.html');

// ── FILES DEPLOYED TO DOCUMENT ROOT ──────────────────────────────────
$coreFiles = [
    'api.php',
    'record.php',
    'db-config.php',
    'trip.php',
    'auth.js',
    'db.js',
    'itinerary-state-guard.js',
    'datepicker.js',
    'itinerary-style.css',
    'itinerary-v2-style.css',
    'deploy-webhook.php',
    'budget-live-redesign.js',
    'index.html',
    'new-trip-v2.html',
    'settings.html',
    'manifest.webmanifest',
    'robots.txt',
    '.htaccess',
    'favicon.ico',
];

$subdirFiles = [
    'trips/index.html' => 'trips/index.html',
    'holidays/index.html' => 'holidays/index.html',
    'holidays/holiday-style.css' => 'holidays/holiday-style.css',
    'holidays/2025-26.html' => 'holidays/2025-26.html',
    'holidays/2026-27.html' => 'holidays/2026-27.html',
    'holidays/2027-28.html' => 'holidays/2027-28.html',
    'holidays/jonathan/index.html' => 'holidays/jonathan/index.html',
    'holidays/jonathan/2026.html' => 'holidays/jonathan/2026.html',
    'holidays/jonathan/2027.html' => 'holidays/jonathan/2027.html',
    'concerts/index.html' => 'concerts/index.html',
    'concerts/artists.html' => 'concerts/artists.html',
    'shows/index.html' => 'shows/index.html',
    'shows/list.html' => 'shows/list.html',
    'private/index.html' => 'private/index.html',
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

$copied = [];
$failed = [];
$skipped = [];

function copyDeployFile(string $src, string $dest, array &$copied, array &$failed, array &$skipped): void {
    $srcPath = REPO_PATH . '/' . $src;
    $destPath = PUBLIC_HTML . '/' . $dest;
    if (!is_file($srcPath)) { $skipped[] = $src; return; }
    $destDir = dirname($destPath);
    if (!is_dir($destDir) && !mkdir($destDir, 0755, true) && !is_dir($destDir)) { $failed[] = $dest; return; }
    if (copy($srcPath, $destPath)) $copied[] = $dest; else $failed[] = $dest;
}

foreach ($coreFiles as $file) copyDeployFile($file, $file, $copied, $failed, $skipped);
foreach ($subdirFiles as $src => $dest) copyDeployFile($src, $dest, $copied, $failed, $skipped);

if ($failed) http_response_code(500);
echo json_encode([
    'ok' => empty($failed),
    'copied' => $copied,
    'failed' => $failed,
    'skipped' => $skipped,
    'git' => implode("\n", $output),
    'deployed' => date('Y-m-d H:i:s'),
]);
