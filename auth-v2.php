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

/**
 * Recovery helper for a server-only bootstrap PIN hash.
 *
 * A configured PIN_HASH may be used exactly once to recover access if the DB
 * pin_hash is missing, stale or was written incorrectly during migration. On a
 * successful bootstrap login we synchronise the DB hash and permanently mark the
 * bootstrap as consumed, so the old server bootstrap cannot resurrect later
 * after the user changes their PIN.
 */
function tryBootstrapPinRecovery(string $submittedHash): bool {
    $bootstrap = configuredPinHash();
    if ($bootstrap === null || !hash_equals($bootstrap, $submittedHash)) return false;

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $check = $pdo->prepare("SELECT `value` FROM settings WHERE `key` = 'pin_bootstrap_consumed' LIMIT 1 FOR UPDATE");
        $check->execute();
        $row = $check->fetch();
        if ($row && trim((string)($row['value'] ?? '')) === '1') {
            $pdo->rollBack();
            return false;
        }

        $pdo->prepare("INSERT INTO settings (`key`, `value`) VALUES ('pin_hash', ?) ON DUPLICATE KEY UPDATE `value` = ?")
            ->execute([$submittedHash, $submittedHash]);
        $pdo->prepare("INSERT INTO settings (`key`, `value`) VALUES ('pin_bootstrap_consumed', '1') ON DUPLICATE KEY UPDATE `value` = '1'")
            ->execute();
        $pdo->exec('DELETE FROM auth_attempts');
        $pdo->commit();
        return true;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        return false;
    }
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

        $matched = false;
        try {
            $matched = hash_equals(activePinHash(), $submittedHash);
        } catch (Throwable $e) {
            // A stale/missing settings row can be recovered only by the one-time
            // server bootstrap path below.
            $matched = false;
        }

        if (!$matched) {
            $matched = tryBootstrapPinRecovery($submittedHash);
        } else {
            // If the normal DB PIN happens to equal the server bootstrap PIN,
            // consume the bootstrap on this successful login as well so it can
            // never become a later fallback after a PIN change.
            $bootstrap = configuredPinHash();
            if ($bootstrap !== null && hash_equals($bootstrap, $submittedHash)) {
                try {
                    db()->prepare("INSERT INTO settings (`key`, `value`) VALUES ('pin_bootstrap_consumed', '1') ON DUPLICATE KEY UPDATE `value` = '1'")
                        ->execute();
                } catch (Throwable $e) {}
            }
        }

        if (!$matched) {
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

    // Provision/check the auth tables before the transaction. DDL inside the
    // transaction could implicitly commit on MySQL and break atomic PIN changes.
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
        $pdo->prepare("INSERT INTO settings (`key`, `value`) VALUES ('pin_bootstrap_consumed', '1') ON DUPLICATE KEY UPDATE `value` = '1'")
            ->execute();

        // PIN update + old-session revocation + replacement-session creation are
        // one transaction. A partial failure cannot leave a changed PIN with old
        // sessions still valid, or report failure after silently changing the PIN.
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
        // Do not claim the server token was revoked when the database operation
        // failed. The browser can still clear its local copy and retry later.
        authFail('Could not revoke the server session', 503);
    }
}

authFail('Unknown action', 404);
