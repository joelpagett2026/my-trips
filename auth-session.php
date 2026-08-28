<?php
// MY TRIPS — shared authentication/session helpers
// PINs are used only to establish a random, expiring server-side session.

const AUTH_SESSION_TTL_SECONDS = 43200; // 12 hours
const AUTH_MAX_FAILURES = 8;
const AUTH_FAILURE_WINDOW_SECONDS = 900; // 15 minutes

// Retained as a server-only provisioning helper for fresh installs. Normal login
// no longer falls back to this value once the application is configured.
function configuredPinHash(): ?string {
    if (defined('PIN_HASH')) {
        $hash = strtolower(trim((string)PIN_HASH));
        if (preg_match('/^[a-f0-9]{64}$/', $hash)) return $hash;
    }
    $env = getenv('PIN_HASH');
    if ($env !== false) {
        $hash = strtolower(trim((string)$env));
        if (preg_match('/^[a-f0-9]{64}$/', $hash)) return $hash;
    }
    return null;
}

function activePinHash(): string {
    // The database value is authoritative. A missing/invalid row or database read
    // error fails closed instead of reviving any old server bootstrap PIN.
    try {
        $stmt = db()->prepare("SELECT `value` FROM settings WHERE `key` = 'pin_hash' LIMIT 1");
        $stmt->execute();
        $row = $stmt->fetch();
        if ($row && is_string($row['value'])) {
            $hash = strtolower(trim($row['value']));
            if (preg_match('/^[a-f0-9]{64}$/', $hash)) return $hash;
        }
    } catch (Throwable $e) {
        throw new RuntimeException('Could not read the configured PIN', 0, $e);
    }

    throw new RuntimeException('No valid database PIN is configured');
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

    // Cleanup belongs on authentication/session-establishment traffic, not every
    // normal API request. isValidAuthSession() deliberately avoids this function
    // unless the auth table is actually missing.
    try {
        db()->exec("DELETE FROM auth_sessions WHERE expires_at < NOW()");
        db()->exec("DELETE FROM auth_attempts WHERE updated_at < DATE_SUB(NOW(), INTERVAL 1 DAY)");
    } catch (Throwable $e) {
        // Cleanup is best effort and must never block authentication.
    }

    $done = true;
}

function clientIpHash(): string {
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    return hash('sha256', $ip);
}

function loginRateLimitRemaining(): int {
    ensureAuthTables();
    $ipHash = clientIpHash();
    $stmt = db()->prepare('SELECT failures, TIMESTAMPDIFF(SECOND, window_started, NOW()) AS age_seconds FROM auth_attempts WHERE ip_hash = ?');
    $stmt->execute([$ipHash]);
    $row = $stmt->fetch();
    if (!$row) return AUTH_MAX_FAILURES;

    $ageSeconds = max(0, (int)($row['age_seconds'] ?? 0));
    if ($ageSeconds >= AUTH_FAILURE_WINDOW_SECONDS) return AUTH_MAX_FAILURES;
    return max(0, AUTH_MAX_FAILURES - (int)$row['failures']);
}

function recordFailedLogin(): void {
    ensureAuthTables();
    $ipHash = clientIpHash();
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('SELECT failures, TIMESTAMPDIFF(SECOND, window_started, NOW()) AS age_seconds FROM auth_attempts WHERE ip_hash = ? FOR UPDATE');
        $stmt->execute([$ipHash]);
        $row = $stmt->fetch();
        $ageSeconds = $row ? max(0, (int)($row['age_seconds'] ?? 0)) : AUTH_FAILURE_WINDOW_SECONDS;

        if (!$row || $ageSeconds >= AUTH_FAILURE_WINDOW_SECONDS) {
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
    db()->prepare('INSERT INTO auth_sessions (token_hash, expires_at, last_seen_at) VALUES (?, DATE_ADD(NOW(), INTERVAL 12 HOUR), NOW())')
        ->execute([$hash]);
    return $token;
}

function isValidAuthSession(string $token): bool {
    $hash = authTokenHash($token);
    if ($hash === null) return false;

    // Normal authenticated traffic must not execute CREATE TABLE / cleanup DML
    // on every API call. Query the existing table directly and self-bootstrap
    // only if the auth schema is genuinely missing.
    $loadSession = static function(string $tokenHash): array|false {
        $stmt = db()->prepare('SELECT (expires_at > NOW()) AS is_valid, last_seen_at FROM auth_sessions WHERE token_hash = ? LIMIT 1');
        $stmt->execute([$tokenHash]);
        return $stmt->fetch();
    };

    try {
        $row = $loadSession($hash);
    } catch (Throwable $e) {
        try {
            ensureAuthTables();
            $row = $loadSession($hash);
        } catch (Throwable $schemaError) {
            return false;
        }
    }

    if (!$row) return false;

    if ((int)($row['is_valid'] ?? 0) !== 1) {
        try { db()->prepare('DELETE FROM auth_sessions WHERE token_hash = ?')->execute([$hash]); }
        catch (Throwable $e) {}
        return false;
    }

    try {
        db()->prepare('UPDATE auth_sessions SET last_seen_at = NOW() WHERE token_hash = ? AND (last_seen_at IS NULL OR last_seen_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE))')
            ->execute([$hash]);
    } catch (Throwable $e) {}
    return true;
}

function isAuthorizedToken(string $token, bool $unusedLegacyFlag = false): bool {
    return $token !== '' && isValidAuthSession($token);
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
