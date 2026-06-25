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

// Pull latest changes into the git repo
exec('cd ' . escapeshellarg(REPO_PATH) . ' && git fetch origin main 2>&1 && git reset --hard origin/main 2>&1', $output, $return);

if ($return !== 0) {
    echo json_encode([
        'ok'     => false,
        'error'  => 'Git pull failed',
        'output' => implode("\n", $output)
    ]);
    exit;
}

// ── COPY FILES TO PUBLIC_HTML ─────────────────────────────────────────
$files = [
    'api.php', 'auth.js', 'db.js', 'datepicker.js', 'itinerary-style.css',
    'index.html', 'settings.html', 'china.html', 'dubai.html',
    'costa-rica.html', 'canada.html', 'hong-kong-taiwan.html', 'new-trip.html'
];

$copied = [];
$failed = [];

foreach ($files as $file) {
    $src  = REPO_PATH  . '/' . $file;
    $dest = PUBLIC_HTML . '/' . $file;
    if (file_exists($src)) {
        if (copy($src, $dest)) {
            $copied[] = $file;
        } else {
            $failed[] = $file;
        }
    }
}

echo json_encode([
    'ok'       => empty($failed),
    'copied'   => $copied,
    'failed'   => $failed,
    'git'      => implode("\n", $output),
    'deployed' => date('Y-m-d H:i:s'),
]);
