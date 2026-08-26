<?php
// MY TRIPS — Shared DB config + connection
// Included by both api.php and trip.php so the two never drift apart.
//
// Preferred configuration order:
//   1. secrets.php (server-only, gitignored)
//   2. environment variables
//   3. current legacy defaults (temporary compatibility fallback)
//
// The fallback values intentionally remain for now so deploying this change
// cannot take the live site down before the hosting-side secrets are rotated.
// Once DB_HOST/DB_NAME/DB_USER/DB_PASS are present in secrets.php or the
// environment and verified, the fallback values can be removed safely.
@include_once __DIR__ . '/secrets.php';

function configValue(string $name, string $fallback): string {
    if (defined($name)) return (string)constant($name);
    $env = getenv($name);
    return ($env !== false && $env !== '') ? $env : $fallback;
}

if (!defined('DB_HOST')) define('DB_HOST', configValue('DB_HOST', 'sdb-77.hosting.stackcp.net'));
if (!defined('DB_NAME')) define('DB_NAME', configValue('DB_NAME', 'claudedb-35303735bca3'));
if (!defined('DB_USER')) define('DB_USER', configValue('DB_USER', 'claudedb-35303735bca3'));
if (!defined('DB_PASS')) define('DB_PASS', configValue('DB_PASS', 'v^l]&AyQxr4G'));
if (!defined('PUBLIC_HTML')) define('PUBLIC_HTML', configValue('PUBLIC_HTML', '/home/sites/31a/d/dbd40dd264/public_html'));

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
