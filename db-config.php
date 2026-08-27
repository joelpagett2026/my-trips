<?php
// MY TRIPS — Shared DB config + connection
// Included by both api.php and trip.php so the two never drift apart.
//
// Secrets must live outside Git. Supported sources, in order:
//   1. secrets.php (server-only, gitignored)
//   2. environment variables
//
// There are deliberately no database credential fallbacks in source control.
@include_once __DIR__ . '/secrets.php';

function optionalConfigValue(string $name): ?string {
    if (defined($name)) {
        $value = trim((string)constant($name));
        return $value !== '' ? $value : null;
    }
    $env = getenv($name);
    if ($env !== false) {
        $value = trim((string)$env);
        return $value !== '' ? $value : null;
    }
    return null;
}

function requiredConfigValue(string $name): string {
    $value = optionalConfigValue($name);
    if ($value === null) {
        throw new RuntimeException('Required server configuration is missing: ' . $name);
    }
    return $value;
}

if (!defined('DB_HOST')) define('DB_HOST', requiredConfigValue('DB_HOST'));
if (!defined('DB_NAME')) define('DB_NAME', requiredConfigValue('DB_NAME'));
if (!defined('DB_USER')) define('DB_USER', requiredConfigValue('DB_USER'));
if (!defined('DB_PASS')) define('DB_PASS', requiredConfigValue('DB_PASS'));

// PUBLIC_HTML is a path rather than a credential. Keep the hosting path as a
// harmless default so utilities that need it do not require another secret.
if (!defined('PUBLIC_HTML')) {
    define('PUBLIC_HTML', optionalConfigValue('PUBLIC_HTML') ?: '/home/sites/31a/d/dbd40dd264/public_html');
}

function db(): PDO {
    static $pdo;
    if (!$pdo) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER,
            DB_PASS,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
    }
    return $pdo;
}
