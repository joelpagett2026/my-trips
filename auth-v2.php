<?php
// MY TRIPS — authentication v2
// Issues random, expiring server-side session tokens. The browser submits only
// the four PIN digits over same-origin HTTPS; hashing and comparison happen here.
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

function validatedPin(array $body, string $field): string {
    $pin = trim((string)($body[$field] ?? ''));
    if (!preg_match('/^\d{4}$/', $pin)) authFail('Invalid PIN');
    return $pin;
}

$raw = file_get_contents('php://input');
$body = json_decode($raw ?: '{}', true);
if (!is_array($body)) authFail('Invalid JSON body');

$action = (string)($_GET['action'] ?? 'login');

if ($action === 'login') {
    if (loginRateLimitRemaining() <= 0) {
        authFail('Too many attempts. Try again in 15 minutes.', 429);
    }

    $pin = validatedPin($body, 'pin');
    $submittedHash = hash('sha256', $pin);
    if (!hash_equals(activePinHash(), $submittedHash)) {
        recordFailedLogin();
        authFail('Incorrect PIN', 401);
    }

    clearFailedLogins();
    authOk([
        'session_token' => issueAuthSession(),
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
    if (!isAuthorizedToken($token, false)) authFail('Unauthorised', 401);

    $newPin = validatedPin($body, 'new_pin');
    $newHash = hash('sha256', $newPin);

    $pdo = db();
    $pdo->prepare("INSERT INTO settings (`key`, `value`) VALUES ('pin_hash', ?) ON DUPLICATE KEY UPDATE `value` = ?")
        ->execute([$newHash, $newHash]);

    // A PIN change invalidates every previously issued session, including the
    // current one, then immediately issues one fresh session for this browser.
    revokeAllAuthSessions();
    clearFailedLogins();

    authOk([
        'changed' => true,
        'session_token' => issueAuthSession(),
        'expires_in' => AUTH_SESSION_TTL_SECONDS,
    ]);
}

if ($action === 'logout') {
    $token = (string)($_SERVER['HTTP_X_AUTH_TOKEN'] ?? '');
    revokeAuthSession($token);
    authOk(['logged_out' => true]);
}

authFail('Unknown action', 404);
