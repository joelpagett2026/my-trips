<?php
// Public read-only share renderer + dedicated share management API.
//
// Share links are capability URLs, but booking references are treated as an
// additional privacy choice. When a link is created with references hidden, the
// reference fields are removed server-side before any shared data is returned.
require_once __DIR__ . '/db-config.php';
require_once __DIR__ . '/auth-session.php';
require_once __DIR__ . '/template-runtime.php';

header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');

function shareOk(mixed $data = null): void {
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_SLASHES);
    exit;
}

function shareFail(string $message, int $status = 400): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_SLASHES);
    exit;
}

function ensureShareTable(): void {
    static $done = false;
    if ($done) return;

    db()->exec("CREATE TABLE IF NOT EXISTS shares (
        token VARCHAR(40) PRIMARY KEY,
        trip_id VARCHAR(255) NOT NULL,
        show_refs TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");

    try {
        $cols = db()->query("SHOW COLUMNS FROM shares LIKE 'show_refs'")->fetchAll();
        if (!$cols) {
            db()->exec("ALTER TABLE shares ADD COLUMN show_refs TINYINT(1) NOT NULL DEFAULT 0");
        }
    } catch (Throwable $e) {
        // If the column cannot be checked/added, later queries fail closed.
    }

    $done = true;
}

function shareRequestBody(): array {
    if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['POST', 'PUT', 'PATCH', 'DELETE'], true)) return [];

    $maxBytes = 65_536;
    $contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > $maxBytes) shareFail('Request too large', 413);

    $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if ($raw === false) shareFail('Could not read request body');
    if (strlen($raw) > $maxBytes) shareFail('Request too large', 413);
    if ($raw === '') return [];

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) shareFail('Invalid JSON body');
    return $decoded;
}

function requireShareOwnerSession(): void {
    $token = (string)($_SERVER['HTTP_X_AUTH_TOKEN'] ?? '');
    if (!isAuthorizedToken($token, false)) shareFail('Unauthorised', 401);
}

function validShareToken(string $token): bool {
    return (bool)preg_match('/^[a-f0-9]{24}$/i', $token);
}

function activeTripExists(string $tripId): bool {
    try {
        $stmt = db()->prepare("SELECT data FROM itinerary WHERE id = 'trip-registry' LIMIT 1");
        $stmt->execute();
        $row = $stmt->fetch();
        if (!$row || !is_string($row['data'])) return false;
        $registry = json_decode($row['data'], true);
        if (!is_array($registry)) return false;
        foreach (($registry['trips'] ?? []) as $trip) {
            if (is_array($trip) && (string)($trip['slug'] ?? '') === $tripId) return true;
        }
    } catch (Throwable $e) {
        return false;
    }
    return false;
}

function stripBookingReferences(mixed $value): mixed {
    if (!is_array($value)) return $value;

    $out = [];
    foreach ($value as $key => $child) {
        if (is_string($key)) {
            $normalized = strtolower((string)preg_replace('/[^a-z0-9]/i', '', $key));
            // Current itinerary data uses `ref` for hotel, flight/transport,
            // attraction and car-hire booking references. The longer names cover
            // legacy/imported records without leaking them through a hidden-ref link.
            if (in_array($normalized, [
                'ref',
                'bookingref',
                'bookingreference',
                'confirmationref',
                'confirmationreference',
            ], true)) {
                continue;
            }
        }
        $out[$key] = stripBookingReferences($child);
    }
    return $out;
}

function loadSharedTrip(string $shareToken): array {
    ensureShareTable();

    $stmt = db()->prepare('SELECT trip_id, show_refs FROM shares WHERE token = ? LIMIT 1');
    $stmt->execute([$shareToken]);
    $share = $stmt->fetch();
    if (!$share) shareFail('This share link is no longer valid', 404);

    $stmt = db()->prepare('SELECT data FROM itinerary WHERE id = ? LIMIT 1');
    $stmt->execute([(string)$share['trip_id']]);
    $row = $stmt->fetch();
    if (!$row || !is_string($row['data'])) shareFail('Trip not found', 404);

    $data = json_decode($row['data'], true);
    if (!is_array($data)) shareFail('Stored trip is invalid JSON', 500);

    $showRefs = (int)($share['show_refs'] ?? 0) === 1;
    if (!$showRefs) $data = stripBookingReferences($data);

    return [
        'data' => $data,
        'trip_id' => (string)$share['trip_id'],
        'show_refs' => $showRefs,
    ];
}

// Dedicated share API. The public share_load path is also reached from the
// compatibility rewrite for /api.php?action=share_load, so hidden-reference
// links cannot bypass server-side redaction by calling the old endpoint directly.
$shareAction = (string)($_GET['action'] ?? '');
if (in_array($shareAction, ['share_load', 'create_share', 'list_shares', 'revoke_share'], true)) {
    if ($shareAction === 'share_load') {
        $shareToken = trim((string)($_GET['token'] ?? ''));
        if (!validShareToken($shareToken)) shareFail('Missing or invalid token', 404);
        shareOk(loadSharedTrip($shareToken));
    }

    requireShareOwnerSession();
    ensureShareTable();
    $body = shareRequestBody();

    if ($shareAction === 'create_share') {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') shareFail('Method not allowed', 405);
        $tripId = trim((string)($body['trip_id'] ?? ''));
        if ($tripId === '' || !activeTripExists($tripId)) shareFail('Trip not found', 404);
        $showRefs = !empty($body['show_refs']) ? 1 : 0;
        $token = bin2hex(random_bytes(12));
        db()->prepare('INSERT INTO shares (token, trip_id, show_refs, created_at) VALUES (?, ?, ?, NOW())')
            ->execute([$token, $tripId, $showRefs]);
        shareOk(['token' => $token, 'show_refs' => (bool)$showRefs]);
    }

    if ($shareAction === 'list_shares') {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') shareFail('Method not allowed', 405);
        $tripId = trim((string)($_GET['trip_id'] ?? ''));
        if ($tripId === '') shareFail('Missing trip_id');
        $stmt = db()->prepare('SELECT token, show_refs, created_at FROM shares WHERE trip_id = ? ORDER BY created_at DESC');
        $stmt->execute([$tripId]);
        $rows = array_map(static function (array $row): array {
            $row['show_refs'] = (int)($row['show_refs'] ?? 0) === 1;
            return $row;
        }, $stmt->fetchAll());
        shareOk($rows);
    }

    if ($shareAction === 'revoke_share') {
        if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['DELETE', 'POST'], true)) shareFail('Method not allowed', 405);
        $shareToken = trim((string)($_GET['token'] ?? ($body['token'] ?? '')));
        if (!validShareToken($shareToken)) shareFail('Missing or invalid token');
        db()->prepare('DELETE FROM shares WHERE token = ?')->execute([$shareToken]);
        shareOk();
    }
}

// ── Public read-only renderer ─────────────────────────────────────────
$token = trim((string)($_GET['t'] ?? ''));
if (!validShareToken($token)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=UTF-8');
    echo 'This share link is not valid.';
    exit;
}

// auth.js determines share mode from the actual URL before the itinerary's inline
// script executes. Canonicalize t-only links so the PIN gate is bypassed from the
// first script execution.
if (!isset($_GET['share']) || (string)$_GET['share'] !== '1') {
    header('Location: /share.php?share=1&t=' . rawurlencode($token), true, 302);
    exit;
}

// Validate the capability and load/redact its data before sending any page shell.
// This removes the previous second-step browser dependency that could leave a
// shared page apparently blank when the public API request failed.
$shared = loadSharedTrip($token);

header('Content-Type: text/html; charset=UTF-8');
$template = file_get_contents(__DIR__ . '/new-trip-v2.html');
if ($template === false) {
    http_response_code(500);
    echo 'Shared itinerary template is unavailable.';
    exit;
}

[$page, $diag] = applyItineraryRuntimeSafety($template);
if (($diag['auth_const_removed'] ?? 0) !== 1
    || ($diag['auth_headers_rewritten'] ?? 0) < 1
    || ($diag['maps_key_rewritten'] ?? 0) !== 1
    || ($diag['hotel_lookup_rewritten'] ?? 0) !== 1) {
    http_response_code(500);
    echo 'Shared itinerary could not be rendered safely.';
    exit;
}

// Embed the already-authorized/redacted share payload into the read-only branch.
// JSON_HEX_* prevents itinerary text from breaking out of the inline script.
$payloadJson = json_encode(
    $shared,
    JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
);
if ($payloadJson === false) {
    http_response_code(500);
    echo 'Shared itinerary data could not be encoded safely.';
    exit;
}
$page = str_replace(
    'const result = await dbLoadShare(SHARE_TOKEN);',
    'const result = ' . $payloadJson . ';',
    $page,
    $preloadCount
);
if ($preloadCount !== 1) {
    http_response_code(500);
    echo 'Shared itinerary could not be initialized safely.';
    exit;
}

// Use current script versions just like the authenticated trip renderer. This
// avoids a shared link being pinned to an old auth/database client generation.
$authVersion = @filemtime(__DIR__ . '/auth.js') ?: time();
$dbVersion = @filemtime(__DIR__ . '/db.js') ?: time();
$page = preg_replace('~src="/auth\\.js\\?v=[^"]+"~', 'src="/auth.js?v=' . $authVersion . '"', $page);
$page = preg_replace('~src="/db\\.js\\?v=[^"]+"~', 'src="/db.js?v=' . $dbVersion . '"', $page);

$page = str_replace(
    '</body>',
    '<script>window.__MYTRIPS_SHARE_SHOW_REFS__=' . ($shared['show_refs'] ? 'true' : 'false') . ';</script>' . "\n"
    . '<script src="/itinerary-ui.js?v=1"></script>' . "\n</body>",
    $page,
    $uiCount
);
if ($uiCount === 0) {
    http_response_code(500);
    echo 'Shared itinerary shell is incomplete.';
    exit;
}

echo $page;
