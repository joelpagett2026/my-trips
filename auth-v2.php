<?php
// MY TRIPS — authentication v2
// Issues random, expiring server-side session tokens. The browser submits only
// the four PIN digits over same-origin HTTPS; hashing and comparison happen here.
require_once __DIR__ . '/db-config.php';
require_once __DIR__ . '/auth-session.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
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
    try {
        if (loginRateLimitRemaining() <= 0) {
            authFail('Too many attempts. Try again in 15 minutes.', 429);
        }

        $pin = validatedPin($body, 'pin');
        $submittedHash = hash('sha256', $pin);
        $storedHash = activePinHash();

        if (!hash_equals($storedHash, $submittedHash)) {
            recordFailedLogin();
            authFail('Incorrect PIN', 401);
        }

        clearFailedLogins();
        authOk([
            'session_token' => issueAuthSession(),
            'expires_in' => AUTH_SESSION_TTL_SECONDS,
        ]);
    } catch (Throwable $e) {
        authFail('Authentication service is temporarily unavailable', 503);
    }
}

if ($action === 'check') {
    try {
        $token = (string)($_SERVER['HTTP_X_AUTH_TOKEN'] ?? '');
        if (!isValidAuthSession($token)) authFail('Session expired', 401);
        authOk(['valid' => true, 'expires_in_max' => AUTH_SESSION_TTL_SECONDS]);
    } catch (Throwable $e) {
        authFail('Authentication service is temporarily unavailable', 503);
    }
}

if ($action === 'change_pin') {
    $token = (string)($_SERVER['HTTP_X_AUTH_TOKEN'] ?? '');
    if (!isAuthorizedToken($token, false)) authFail('Unauthorised', 401);

    $newPin = validatedPin($body, 'new_pin');
    $newHash = hash('sha256', $newPin);

    try {
        ensureAuthTables();
    } catch (Throwable $e) {
        authFail('Authentication service is temporarily unavailable', 503);
    }

    $pdo = db();
    try {
        $pdo->beginTransaction();

        $pdo->prepare("INSERT INTO settings (`key`, `value`) VALUES ('pin_hash', ?) ON DUPLICATE KEY UPDATE `value` = ?")
            ->execute([$newHash, $newHash]);

        // Old one-time recovery markers are obsolete once the owner has set a
        // real database PIN. Keep the settings table free of recovery state.
        $pdo->prepare("DELETE FROM settings WHERE `key` IN ('pin_bootstrap_consumed','pin_bootstrap_consumed_hash')")
            ->execute();

        $pdo->exec('DELETE FROM auth_sessions');
        $pdo->exec('DELETE FROM auth_attempts');

        $newSessionToken = bin2hex(random_bytes(32));
        $newSessionHash = hash('sha256', $newSessionToken);
        $pdo->prepare('INSERT INTO auth_sessions (token_hash, expires_at, last_seen_at) VALUES (?, DATE_ADD(NOW(), INTERVAL 12 HOUR), NOW())')
            ->execute([$newSessionHash]);

        $pdo->commit();
        authOk([
            'changed' => true,
            'session_token' => $newSessionToken,
            'expires_in' => AUTH_SESSION_TTL_SECONDS,
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        authFail('PIN change failed; no changes were applied', 500);
    }
}

if ($action === 'logout') {
    $token = (string)($_SERVER['HTTP_X_AUTH_TOKEN'] ?? '');
    $hash = authTokenHash($token);
    if ($hash === null) authOk(['logged_out' => true]);

    try {
        ensureAuthTables();
        db()->prepare('DELETE FROM auth_sessions WHERE token_hash = ?')->execute([$hash]);
        authOk(['logged_out' => true]);
    } catch (Throwable $e) {
        authFail('Could not revoke the server session', 503);
    }
}

authFail('Unknown action', 404);
