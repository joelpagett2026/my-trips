<?php
// TEMPORARY AUTH DIAGNOSTIC — remove after resolving login issue.
require_once __DIR__ . '/db-config.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');

function diagConfig(string $name): string {
    if (defined($name)) return trim((string)constant($name));
    $env = getenv($name);
    return $env !== false ? trim((string)$env) : '';
}

$expectedKey = diagConfig('DEPLOY_KEY');
$providedKey = (string)($_SERVER['HTTP_X_DEPLOY_KEY'] ?? '');
if ($expectedKey === '' || $providedKey === '' || !hash_equals($expectedKey, $providedKey)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Forbidden']);
    exit;
}

try {
    $pdo = db();
    $stmt = $pdo->prepare("SELECT `value` FROM settings WHERE `key` = 'pin_hash'");
    $stmt->execute();
    $rows = $stmt->fetchAll();
    $values = array_values(array_filter(array_map(static fn($r) => is_string($r['value'] ?? null) ? strtolower(trim($r['value'])) : '', $rows)));
    $target = hash('sha256', '7644');
    $validRows = array_values(array_filter($values, static fn($v) => preg_match('/^[a-f0-9]{64}$/', $v) === 1));

    $dbIdentity = hash('sha256', diagConfig('DB_HOST') . '|' . diagConfig('DB_NAME'));
    echo json_encode([
        'ok' => true,
        'db_connected' => true,
        'db_identity' => substr($dbIdentity, 0, 16),
        'pin_row_count' => count($rows),
        'valid_pin_row_count' => count($validRows),
        'pin_matches_7644' => in_array($target, $validRows, true),
        'auth_attempts_count' => (int)$pdo->query('SELECT COUNT(*) FROM auth_attempts')->fetchColumn(),
        'auth_sessions_count' => (int)$pdo->query('SELECT COUNT(*) FROM auth_sessions')->fetchColumn(),
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'db_connected' => false, 'error' => 'Diagnostic query failed']);
}
