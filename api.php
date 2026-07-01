<?php
// ══════════════════════════════════════════════════════════════════════
//  MY TRIPS — API
//  Configure the four constants below, then upload to your server.
// ══════════════════════════════════════════════════════════════════════

define('DB_HOST', 'sdb-77.hosting.stackcp.net');      // Usually 'localhost' on shared hosting
define('DB_NAME', 'claudedb-35303735bca3');   // Your MySQL database name
define('DB_USER', 'claudedb-35303735bca3');   // Your MySQL username
define('DB_PASS', 'v^l]&AyQxr4G');   // Your MySQL password

// PIN hash — SHA-256 of your PIN. Default is 0103.
// To change: php -r "echo hash('sha256', 'YOURPIN');"
define('PIN_HASH', '06843e3f58776ec2eb5e0cc7a44a3c3fc1b4b9af2e75504da3d299dc566cc395');
define('PUBLIC_HTML', '/home/sites/31a/d/dbd40dd264/public_html');

// ══════════════════════════════════════════════════════════════════════
//  NO CHANGES NEEDED BELOW THIS LINE
// ══════════════════════════════════════════════════════════════════════

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Auth-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

// ── AUTH CHECK ────────────────────────────────────────────────────────
// Every request (except /auth) must include a valid session token header
$action = $_GET['action'] ?? '';

if ($action !== 'auth' && $action !== 'share_load') {
    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    if ($token !== getActivePinHash()) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorised']);
        exit;
    }
}

// ── DATABASE ──────────────────────────────────────────────────────────
function db(): PDO {
    static $pdo;
    if (!$pdo) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
             PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
        );
    }
    return $pdo;
}

function ok(mixed $data = null): void {
    echo json_encode(['ok' => true, 'data' => $data]);
    exit;
}

function fail(string $msg, int $code = 400): void {
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg]);
    exit;
}

// ── BODY ──────────────────────────────────────────────────────────────
$body = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true) ?? [];
}

// ══════════════════════════════════════════════════════════════════════
//  ACTIONS
// ══════════════════════════════════════════════════════════════════════

switch ($action) {

    // ── VERIFY PIN ───────────────────────────────────────────────────
    // POST /api.php?action=auth  { "pin_hash": "sha256hex" }
    case 'auth':
        $submitted = $body['pin_hash'] ?? '';
        // Also allow changing the PIN — only if old hash matches
        if (isset($body['new_hash'])) {
            if ($submitted !== PIN_HASH) fail('Wrong current PIN', 401);
            // Store new hash in settings table
            $pdo = db();
            $pdo->prepare("INSERT INTO settings (`key`, `value`) VALUES ('pin_hash', ?) ON DUPLICATE KEY UPDATE `value` = ?")
                ->execute([$body['new_hash'], $body['new_hash']]);
            ok(['changed' => true]);
        }
        if ($submitted === getActivePinHash()) {
            ok(['token' => getActivePinHash()]);
        }
        fail('Incorrect PIN', 401);

    // ── GET ACTIVE PIN HASH (for client to validate session) ─────────
    case 'pin_hash':
        ok(['hash' => getActivePinHash()]);

    // ── LOAD A RECORD ────────────────────────────────────────────────
    // GET /api.php?action=load&id=china-2026
    case 'load':
        $id = $_GET['id'] ?? '';
        if (!$id) fail('Missing id');
        $stmt = db()->prepare("SELECT data, updated_at FROM itinerary WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) ok(null);
        ok(['data' => json_decode($row['data'], true), 'updated_at' => $row['updated_at']]);

    // ── SAVE A RECORD ────────────────────────────────────────────────
    // POST /api.php?action=save  { "id": "...", "data": {...} }
    case 'save':
        $id   = $body['id']   ?? '';
        $data = $body['data'] ?? null;
        if (!$id || $data === null) fail('Missing id or data');
        $json = json_encode($data);
        db()->prepare("INSERT INTO itinerary (id, data, updated_at) VALUES (?, ?, NOW())
                       ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()")
            ->execute([$id, $json]);
        ok(['id' => $id]);

    // ── CREATE TRIP PAGE ─────────────────────────────────────────────
    // POST /api.php?action=create_page  { "slug": "porto-2026", "dest": "Porto", "dep": "...", "ret": "..." }
    case 'create_page':
        $slug   = preg_replace('/[^a-z0-9\-]/', '', strtolower($body['slug'] ?? ''));
        $dest   = $body['dest'] ?? '';
        $dep    = $body['dep']  ?? '';
        $ret    = $body['ret']  ?? '';
        $trav   = $body['trav'] ?? '2';
        $status = $body['status'] ?? 'upcoming';
        if (!$slug || !$dest) fail('Missing slug or dest');

        // Read new-trip.html template
        $template = file_get_contents(__DIR__ . '/new-trip.html');
        if (!$template) fail('Template not found');

        // Bake in the record ID and suppress URL-param reading
        $page = str_replace(
            "// Read URL params
const params = new URLSearchParams(window.location.search);
const dest   = params.get('dest') || 'New Trip';
const dep    = params.get('dep')  || '';
const ret    = params.get('ret')  || '';
const trav   = params.get('trav') || '2';
const status = params.get('status') || 'upcoming';
const slug   = params.get('slug') || 'new-trip';

// Use slug as the database record ID
const RECORD_ID = slug;",
            "// Baked-in trip data
const dest   = " . json_encode($dest) . ";
const dep    = " . json_encode($dep) . ";
const ret    = " . json_encode($ret) . ";
const trav   = " . json_encode($trav) . ";
const status = " . json_encode($status) . ";
const slug   = " . json_encode($slug) . ";

// Use slug as the database record ID
const RECORD_ID = slug;",
            $template
        );

        // Update the <title>
        $page = preg_replace('/<title>.*?<\/title>/', '<title>' . htmlspecialchars($dest) . ' · Itinerary</title>', $page);

        // Write to public_html
        $outPath = PUBLIC_HTML . '/' . $slug . '.html';
        if (!defined('PUBLIC_HTML')) define('PUBLIC_HTML', '/home/sites/31a/d/dbd40dd264/public_html');
        if (file_put_contents($outPath, $page) === false) fail('Could not write file');

        ok(['slug' => $slug, 'url' => '/' . $slug . '.html']);

    // ── SHARE: CREATE A SHARE LINK (owner only) ────────────────────────
    // POST /api.php?action=create_share  { "trip_id": "gothenburg-2026" }
    case 'create_share':
        $tripId = $body['trip_id'] ?? '';
        if (!$tripId) fail('Missing trip_id');
        ensureSharesTable();
        $token = bin2hex(random_bytes(12));
        db()->prepare("INSERT INTO shares (token, trip_id, created_at) VALUES (?, ?, NOW())")
            ->execute([$token, $tripId]);
        ok(['token' => $token]);

    // ── SHARE: LIST ACTIVE SHARE LINKS FOR A TRIP (owner only) ─────────
    // GET /api.php?action=list_shares&trip_id=...
    case 'list_shares':
        $tripId = $_GET['trip_id'] ?? '';
        if (!$tripId) fail('Missing trip_id');
        ensureSharesTable();
        $stmt = db()->prepare("SELECT token, created_at FROM shares WHERE trip_id = ? ORDER BY created_at DESC");
        $stmt->execute([$tripId]);
        ok($stmt->fetchAll());

    // ── SHARE: REVOKE A SHARE LINK (owner only) ─────────────────────────
    // DELETE /api.php?action=revoke_share&token=...
    case 'revoke_share':
        $token = $_GET['token'] ?? $body['token'] ?? '';
        if (!$token) fail('Missing token');
        ensureSharesTable();
        db()->prepare("DELETE FROM shares WHERE token = ?")->execute([$token]);
        ok();

    // ── SHARE: LOAD A SHARED ITINERARY (PUBLIC — no PIN required) ──────
    // Booking references are stripped before returning.
    // GET /api.php?action=share_load&token=...
    case 'share_load':
        $token = $_GET['token'] ?? '';
        if (!$token) fail('Missing token');
        ensureSharesTable();
        $stmt = db()->prepare("SELECT trip_id FROM shares WHERE token = ?");
        $stmt->execute([$token]);
        $share = $stmt->fetch();
        if (!$share) fail('This share link is no longer valid', 404);
        $stmt2 = db()->prepare("SELECT data FROM itinerary WHERE id = ?");
        $stmt2->execute([$share['trip_id']]);
        $row = $stmt2->fetch();
        if (!$row) fail('Trip not found', 404);
        $data = stripBookingRefs(json_decode($row['data'], true));
        ok(['data' => $data, 'trip_id' => $share['trip_id']]);

    // ── DELETE A RECORD ──────────────────────────────────────────────
    // DELETE /api.php?action=delete&id=...
    case 'delete':
        $id = $_GET['id'] ?? $body['id'] ?? '';
        if (!$id) fail('Missing id');
        db()->prepare("DELETE FROM itinerary WHERE id = ?")->execute([$id]);
        ok();

    // ── LIST ALL RECORDS (for trip registry) ─────────────────────────
    // GET /api.php?action=list
    case 'list':
        $stmt = db()->query("SELECT id, updated_at FROM itinerary ORDER BY updated_at DESC");
        ok($stmt->fetchAll());

    // ── SETTINGS GET / SET ───────────────────────────────────────────
    case 'get_setting':
        $key = $_GET['key'] ?? '';
        if (!$key) fail('Missing key');
        $stmt = db()->prepare("SELECT `value` FROM settings WHERE `key` = ?");
        $stmt->execute([$key]);
        $row = $stmt->fetch();
        ok($row ? $row['value'] : null);

    case 'set_setting':
        $key = $body['key'] ?? '';
        $val = $body['value'] ?? '';
        if (!$key) fail('Missing key');
        db()->prepare("INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?")
            ->execute([$key, $val, $val]);
        ok();

    default:
        fail('Unknown action');
}

// ── HELPERS ───────────────────────────────────────────────────────────
function getActivePinHash(): string {
    try {
        $stmt = db()->prepare("SELECT `value` FROM settings WHERE `key` = 'pin_hash'");
        $stmt->execute();
        $row = $stmt->fetch();
        return $row ? $row['value'] : PIN_HASH;
    } catch (\Exception $e) {
        return PIN_HASH;
    }
}

function ensureSharesTable(): void {
    static $done = false;
    if ($done) return;
    db()->exec("CREATE TABLE IF NOT EXISTS shares (
        token VARCHAR(40) PRIMARY KEY,
        trip_id VARCHAR(255) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $done = true;
}

// Recursively blanks booking-reference fields ('ref', 'ch_ref') anywhere
// in the itinerary data tree before it's returned to a public share link.
function stripBookingRefs(mixed $data): mixed {
    if (!is_array($data)) return $data;
    foreach ($data as $k => $v) {
        if ($k === 'ref' || $k === 'ch_ref') {
            $data[$k] = '';
        } elseif (is_array($v)) {
            $data[$k] = stripBookingRefs($v);
        }
    }
    return $data;
}
