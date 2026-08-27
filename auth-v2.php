<?php
// MY TRIPS — authentication v2
// Issues random, expiring server-side session tokens. During migration it also
// returns the current PIN hash as a legacy API token so older api.php actions
// continue to work until they are moved onto shared session validation.
require_once __DIR__ . '/db-config.php';
require_once __DIR__ . '/auth-session.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Auth-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['ok'=>false,'error'=>'POST required']); exit; }

function authOk(mixed $data = null): never {
    echo json_encode(['ok' => true, 'data' => $data]);
    exit;
}

function authFail(string $message, int $status = 400): never {
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $message]);
    exit;
}

$raw = file_get_contents('php://input');
$body = json_decode($raw ?: '{}', true);
if (!is_array($body)) authFail('Invalid JSON body');

$action = (string)($_GET['action'] ?? 'login');

if ($action === 'login') {
    if (loginRateLimitRemaining() <= 0) {
        authFail('Too many attempts. Try again in 15 minutes.', 429);
    }

    $submitted = strtolower(trim((string)($body['pin_hash'] ?? '')));
    if (!preg_match('/^[a-f0-9]{64}$/', $submitted) || !hash_equals(activePinHash(), $submitted)) {
        recordFailedLogin();
        authFail('Incorrect PIN', 401);
    }

    clearFailedLogins();
    $sessionToken = issueAuthSession();
    authOk([
        'session_token' => $sessionToken,
        // Temporary compatibility token for api.php. Do not use for record.php.
        'legacy_token' => activePinHash(),
        'expires_in' => AUTH_SESSION_TTL_SECONDS,
    ]);
}

if ($action === 'check') {
    $token = (string)($_SERVER['HTTP_X_AUTH_TOKEN'] ?? '');
    if (!isValidAuthSession($token)) authFail('Session expired', 401);
    authOk(['valid' => true, 'expires_in_max' => AUTH_SESSION_TTL_SECONDS]);
}

if ($action === 'change_pin') {
    $token = (string)($_SERVER['HTTP_X_AUTH_TOKEN'] ?? '');
    if (!isAuthorizedToken($token, true)) authFail('Unauthorised', 401);

    $newHash = strtolower(trim((string)($body['new_hash'] ?? '')));
    if (!preg_match('/^[a-f0-9]{64}$/', $newHash)) authFail('Invalid new PIN hash');

    $pdo = db();
    $pdo->prepare("INSERT INTO settings (`key`, `value`) VALUES ('pin_hash', ?) ON DUPLICATE KEY UPDATE `value` = ?")
        ->execute([$newHash, $newHash]);

    // A PIN change must invalidate every previously issued session.
    revokeAllAuthSessions();
    clearFailedLogins();
    $newSession = issueAuthSession();

    authOk([
        'changed' => true,
        'session_token' => $newSession,
        'legacy_token' => $newHash,
        'expires_in' => AUTH_SESSION_TTL_SECONDS,
    ]);
}

if ($action === 'logout') {
    $token = (string)($_SERVER['HTTP_X_AUTH_TOKEN'] ?? '');
    revokeAuthSession($token);
    authOk(['logged_out' => true]);
}

authFail('Unknown action', 404);
