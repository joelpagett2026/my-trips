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
define('ANTHROPIC_KEY', 'sk-ant-api03--SUyJMmu_hmiK7eabLOqrieIm_y1VIpi8tmONATNsJN7yyw-' . 'qNE4sZ15AHovCIJzFm0ES7XgicRpRLP0WbWUTg-iXdPAwAA');

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

if ($action !== 'auth') {
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
define('ANTHROPIC_KEY', 'sk-ant-api03--SUyJMmu_hmiK7eabLOqrieIm_y1VIpi8tmONATNsJN7yyw-' . 'qNE4sZ15AHovCIJzFm0ES7XgicRpRLP0WbWUTg-iXdPAwAA');
        if (file_put_contents($outPath, $page) === false) fail('Could not write file');

        ok(['slug' => $slug, 'url' => '/' . $slug . '.html']);

    // ── WRITE ASSET ──────────────────────────────────────────────────
    case 'write_asset':
        $fn = basename($body['filename'] ?? '');
        $fc = $body['content'] ?? '';
        if (!$fn || !$fc) fail('Missing params');
        if (!in_array(pathinfo($fn, PATHINFO_EXTENSION), ['js','css','html','php'])) fail('Not allowed');
        if (file_put_contents(__DIR__ . '/' . $fn, $fc) === false) fail('Write failed');
        ok(['written' => $fn]);

    // ── READ FILE ─────────────────────────────────────────────────────
    case 'read_file':
        $fn = basename($body['filename'] ?? '');
        if (!$fn) fail('Missing filename');
        $allowed_read = ['js','css','html','php'];
        if (!in_array(pathinfo($fn, PATHINFO_EXTENSION), $allowed_read)) fail('Not allowed');
        $path = __DIR__ . '/' . $fn;
        if (!file_exists($path)) fail('File not found');
        ok(['filename' => $fn, 'content' => file_get_contents($path)]);

    // ── CLAUDE CHAT PROXY ────────────────────────────────────────────
    // POST /api.php?action=chat  { "messages": [...], "context": {...} }
    case 'chat':
        $key = ANTHROPIC_KEY;
        if (!$key) fail('Anthropic API key not configured');
        $messages = $body['messages'] ?? [];
        $context  = $body['context']  ?? [];
        if (empty($messages)) fail('No messages');

        $ctx_json = json_encode($context);
        $systemPrompt = 'You are the AI assistant built into Joel Pagett\'s Trip Planner at joelpagett.co.uk. You have FULL ability to make changes to the site.

SITE INFO:
- Hosting: 20i shared Linux, files at /home/sites/31a/d/dbd40dd264/public_html/
- Design: Montserrat font, teal #0e7a87 accent, background #e8e8e8
- Pages: index.html, china.html, dubai.html, costa-rica.html, canada.html, hong-kong-taiwan.html, new-trip.html, settings.html, itinerary-style.css, chat-widget.js, db.js, auth.js, datepicker.js, api.php
- Dynamic trip pages: porto-2026.html, gothenburg-2026.html, cyprus-2026.html (generated from new-trip.html template)
- PIN: 0103, session stored in localStorage as jh_auth

CURRENT TRIPS CONTEXT:
' . $ctx_json . '

AVAILABLE ACTIONS — include these JSON blocks in your response to make changes:

Registry changes (immediate):
{"action":"update_status","slug":"porto-2026","status":"planning|upcoming|past"}
{"action":"update_trip","slug":"porto-2026","fields":{"dest":"...","dep":"dd/mm/yyyy","ret":"dd/mm/yyyy","flags":["pt"],"points":[[41.15,-8.62]],"cities":["Porto"]}}
{"action":"remove_trip","slug":"porto-2026"}
{"action":"add_trip","trip":{"dest":"Japan","dep":"01/05/2027","ret":"15/05/2027","slug":"japan-2027","url":"/japan-2027.html","flags":["jp"],"points":[[35.67,139.65]],"cities":["Tokyo"],"status":"upcoming","trav":"2"}}

File changes (writes directly to server):
{"action":"write_file","filename":"itinerary-style.css","content":"/* full file content */"}
{"action":"write_file","filename":"index.html","content":"<!DOCTYPE html>..."}
{"action":"write_file","filename":"chat-widget.js","content":"(function(){...})();"}

When writing files, always write the COMPLETE file content — never partial.
When asked to change something visual or functional, read the current file from context first if provided, make the targeted change, and write the whole file back.
Be concise in explanations. Execute changes directly — do not ask for confirmation unless destructive.';

        $payload = json_encode([
            'model' => 'claude-sonnet-4-6',
            'max_tokens' => 1024,
            'system' => $systemPrompt,
            'messages' => $messages,
        ]);

        // Try curl first, fall back to file_get_contents
        $resp = false;
        $httpCode = 0;
        if (function_exists('curl_init')) {
            $ch = curl_init('https://api.anthropic.com/v1/messages');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $payload,
                CURLOPT_HTTPHEADER => [
                    'Content-Type: application/json',
                    'x-api-key: ' . $key,
                    'anthropic-version: 2023-06-01',
                ],
                CURLOPT_TIMEOUT => 30,
                CURLOPT_SSL_VERIFYPEER => false,
            ]);
            $resp = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlErr = curl_error($ch);
            curl_close($ch);
            if (!$resp) fail('cURL error: ' . $curlErr);
        } else {
            $ctx = stream_context_create(['http' => [
                'method' => 'POST',
                'header' => implode("\r\n", [
                    'Content-Type: application/json',
                    'x-api-key: ' . $key,
                    'anthropic-version: 2023-06-01',
                ]),
                'content' => $payload,
                'timeout' => 30,
                'ignore_errors' => true,
            ]]);
            $resp = @file_get_contents('https://api.anthropic.com/v1/messages', false, $ctx);
            if (!$resp) fail('HTTP request failed');
            $httpCode = 200;
        }

        $data = json_decode($resp, true);
        if ($httpCode !== 200 && isset($data['error'])) fail($data['error']['message'] ?? 'API error');

        $text = $data['content'][0]['text'] ?? '';
        ok(['reply' => $text]);

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
