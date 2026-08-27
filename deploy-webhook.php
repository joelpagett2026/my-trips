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

function serverConfig(string $name): string {
    if (defined($name)) return trim((string)constant($name));
    $env = getenv($name);
    return $env !== false ? trim((string)$env) : '';
}

function deploySecret(): string {
    return serverConfig('DEPLOY_KEY');
}

function deploymentPreflight(): array {
    $required = [
        'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS',
        'ANTHROPIC_API_KEY', 'PLACES_API_KEY', 'MAPS_BROWSER_KEY',
    ];
    $missing = [];
    foreach ($required as $name) {
        if (serverConfig($name) === '') $missing[] = $name;
    }
    if ($missing) return ['ok' => false, 'error' => 'Missing server configuration', 'missing' => $missing];

    try {
        $pdo = new PDO(
            'mysql:host=' . serverConfig('DB_HOST') . ';dbname=' . serverConfig('DB_NAME') . ';charset=utf8mb4',
            serverConfig('DB_USER'),
            serverConfig('DB_PASS'),
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
        );
        $stmt = $pdo->prepare("SELECT `value` FROM settings WHERE `key` = 'pin_hash' LIMIT 1");
        $stmt->execute();
        $row = $stmt->fetch();
        $storedPin = is_array($row) ? strtolower(trim((string)($row['value'] ?? ''))) : '';
        $bootstrapPin = strtolower(serverConfig('PIN_HASH'));
        if (!preg_match('/^[a-f0-9]{64}$/', $storedPin) && !preg_match('/^[a-f0-9]{64}$/', $bootstrapPin)) {
            return ['ok' => false, 'error' => 'No valid server-side PIN hash is configured'];
        }
    } catch (Throwable $e) {
        return ['ok' => false, 'error' => 'Database preflight failed'];
    }

    if (!preg_match('/^AIza[0-9A-Za-z_-]{20,}$/', serverConfig('MAPS_BROWSER_KEY'))) {
        return ['ok' => false, 'error' => 'MAPS_BROWSER_KEY is not a valid Google browser key'];
    }

    return ['ok' => true];
}

header('Content-Type: application/json');
header('Cache-Control: no-store');

$expectedKey = deploySecret();
if ($expectedKey === '') {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'Deployment secret is not configured on the server']);
    exit;
}

$providedKey = (string)($_SERVER['HTTP_X_DEPLOY_KEY'] ?? '');
if ($providedKey === '' || !hash_equals($expectedKey, $providedKey)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Forbidden']);
    exit;
}

$output = [];
$return = 0;
$gitCmd = 'cd ' . escapeshellarg(REPO_PATH)
    . ' && git fetch origin main 2>&1'
    . ' && git reset --hard origin/main 2>&1';
exec($gitCmd, $output, $return);

if ($return !== 0) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Git update failed; live files were left untouched',
        'git' => implode("\n", $output),
    ]);
    exit;
}

$preflight = deploymentPreflight();
if (!$preflight['ok']) {
    http_response_code(503);
    echo json_encode($preflight + ['live_files_untouched' => true]);
    exit;
}

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

// Dependencies are copied before their entry points. .htaccess is last so new
// routes cannot become active until every renderer they reference is present.
$coreFiles = [
    'db-config.php',
    'auth-session.php',
    'template-runtime.php',
    'auth-v2.php',
    'record.php',
    'trip-create.php',
    'auth.js',
    'db.js',
    'itinerary-state-guard.js',
    'itinerary-ui.js',
    'trip-dashboard-create.js',
    'datepicker.js',
    'budget-live-redesign.js',
    'itinerary-style.css',
    'itinerary-v2-style.css',
    'new-trip-v2.html',
    'manifest.webmanifest',
    'robots.txt',
    'favicon.ico',
    'settings.html',
    'index.html',
    'trip.php',
    'share.php',
    'trips.php',
    'parks-map.php',
    'api.php',
    'deploy-webhook.php',
    '.htaccess',
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

    $tmpPath = $destPath . '.deploy-' . getmypid() . '-' . bin2hex(random_bytes(3));
    if (!copy($srcPath, $tmpPath)) { $failed[] = $dest; return; }
    @chmod($tmpPath, 0644);
    if (!rename($tmpPath, $destPath)) {
        @unlink($tmpPath);
        $failed[] = $dest;
        return;
    }
    $copied[] = $dest;
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