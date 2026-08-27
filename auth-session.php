<?php
// MY TRIPS — shared authentication/session helpers
// Introduces expiring random bearer sessions while keeping a temporary
// legacy-token compatibility path during rollout.

const AUTH_SESSION_TTL_SECONDS = 43200; // 12 hours
const AUTH_MAX_FAILURES = 8;
const AUTH_FAILURE_WINDOW_SECONDS = 900; // 15 minutes
const AUTH_FALLBACK_PIN_HASH = '06843e3f58776ec2eb5e0cc7a44a3c3fc1b4b9af2e75504da3d299dc566cc395';

function activePinHash(): string {
    try {
        $stmt = db()->prepare("SELECT `value` FROM settings WHERE `key` = 'pin_hash'");
        $stmt->execute();
        $row = $stmt->fetch();
        if ($row && is_string($row['value']) && preg_match('/^[a-f0-9]{64}$/i', $row['value'])) {
            return strtolower($row['value']);
        }
    } catch (Throwable $e) {
        // Fall through to compatibility fallback. Removing this fallback is a
        // separate hosting-secret rotation step after the live server is ready.
    }
    return AUTH_FALLBACK_PIN_HASH;
}

function ensureAuthTables(): void {
    static $done = false;
    if ($done) return;

    db()->exec("CREATE TABLE IF NOT EXISTS auth_sessions (
        token_hash CHAR(64) PRIMARY KEY,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        last_seen_at DATETIME NULL
    )");

    db()->exec("CREATE TABLE IF NOT EXISTS auth_attempts (
        ip_hash CHAR(64) PRIMARY KEY,
        failures INT NOT NULL DEFAULT 0,
        window_started DATETIME NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");

    // Opportunistic cleanup keeps the small session table from growing forever.
    try {
        db()->exec("DELETE FROM auth_sessions WHERE expires_at < NOW()");
        db()->exec("DELETE FROM auth_attempts WHERE updated_at < DATE_SUB(NOW(), INTERVAL 1 DAY)");
    } catch (Throwable $e) {
        // Cleanup is best effort and must never block authentication.
    }

    $done = true;
}

function clientIpHash(): string {
    // Do not trust forwarded headers here; REMOTE_ADDR is sufficient for a
    // lightweight brute-force throttle and avoids spoofed client values.
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    return hash('sha256', $ip);
}

function loginRateLimitRemaining(): int {
    ensureAuthTables();
    $ipHash = clientIpHash();
    $stmt = db()->prepare('SELECT failures, window_started FROM auth_attempts WHERE ip_hash = ?');
    $stmt->execute([$ipHash]);
    $row = $stmt->fetch();
    if (!$row) return AUTH_MAX_FAILURES;

    $started = strtotime((string)$row['window_started']) ?: 0;
    if (time() - $started >= AUTH_FAILURE_WINDOW_SECONDS) return AUTH_MAX_FAILURES;
    return max(0, AUTH_MAX_FAILURES - (int)$row['failures']);
}

function recordFailedLogin(): void {
    ensureAuthTables();
    $ipHash = clientIpHash();
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('SELECT failures, window_started FROM auth_attempts WHERE ip_hash = ? FOR UPDATE');
        $stmt->execute([$ipHash]);
        $row = $stmt->fetch();
        $now = time();

        if (!$row || $now - (strtotime((string)$row['window_started']) ?: 0) >= AUTH_FAILURE_WINDOW_SECONDS) {
            $upsert = $pdo->prepare("INSERT INTO auth_attempts (ip_hash, failures, window_started, updated_at)
                VALUES (?, 1, NOW(), NOW())
                ON DUPLICATE KEY UPDATE failures = 1, window_started = NOW(), updated_at = NOW()");
            $upsert->execute([$ipHash]);
        } else {
            $update = $pdo->prepare('UPDATE auth_attempts SET failures = failures + 1, updated_at = NOW() WHERE ip_hash = ?');
            $update->execute([$ipHash]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        // Rate-limit bookkeeping failure must not create an authentication outage.
    }
}

function clearFailedLogins(): void {
    try {
        ensureAuthTables();
        db()->prepare('DELETE FROM auth_attempts WHERE ip_hash = ?')->execute([clientIpHash()]);
    } catch (Throwable $e) {}
}

function authTokenHash(string $token): ?string {
    $token = strtolower(trim($token));
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) return null;
    return hash('sha256', $token);
}

function issueAuthSession(): string {
    ensureAuthTables();
    $token = bin2hex(random_bytes(32));
    $hash = hash('sha256', $token);
    $expiresAt = date('Y-m-d H:i:s', time() + AUTH_SESSION_TTL_SECONDS);
    db()->prepare('INSERT INTO auth_sessions (token_hash, expires_at, last_seen_at) VALUES (?, ?, NOW())')
        ->execute([$hash, $expiresAt]);
    return $token;
}

function isValidAuthSession(string $token): bool {
    $hash = authTokenHash($token);
    if ($hash === null) return false;

    ensureAuthTables();
    $stmt = db()->prepare('SELECT expires_at FROM auth_sessions WHERE token_hash = ? LIMIT 1');
    $stmt->execute([$hash]);
    $row = $stmt->fetch();
    if (!$row) return false;

    if ((strtotime((string)$row['expires_at']) ?: 0) <= time()) {
        db()->prepare('DELETE FROM auth_sessions WHERE token_hash = ?')->execute([$hash]);
        return false;
    }

    // last_seen_at is diagnostic only; expiry remains absolute (12 hours from
    // login) rather than becoming an indefinitely sliding browser session.
    try {
        db()->prepare('UPDATE auth_sessions SET last_seen_at = NOW() WHERE token_hash = ?')->execute([$hash]);
    } catch (Throwable $e) {}
    return true;
}

function isAuthorizedToken(string $token, bool $allowLegacyPinHash = true): bool {
    if ($token === '') return false;
    if (isValidAuthSession($token)) return true;

    // Compatibility path for browser sessions created before this rollout.
    // Once all clients have received random sessions, this can be removed.
    return $allowLegacyPinHash && hash_equals(activePinHash(), strtolower(trim($token)));
}

function revokeAuthSession(string $token): void {
    $hash = authTokenHash($token);
    if ($hash === null) return;
    try {
        ensureAuthTables();
        db()->prepare('DELETE FROM auth_sessions WHERE token_hash = ?')->execute([$hash]);
    } catch (Throwable $e) {}
}

function revokeAllAuthSessions(): void {
    try {
        ensureAuthTables();
        db()->exec('DELETE FROM auth_sessions');
    } catch (Throwable $e) {}
}
