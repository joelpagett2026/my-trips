<?php
// MY TRIPS — consistent authenticated backup export
// Reads the application data in one repeatable-read transaction so the downloaded
// JSON cannot mix records from different points in time.
require_once __DIR__ . '/db-config.php';
require_once __DIR__ . '/auth-session.php';

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

function backupFail(string $message, int $status = 400, ?string $code = null): never {
    http_response_code($status);
    $payload = ['ok' => false, 'error' => $message];
    if ($code !== null && $code !== '') $payload['code'] = $code;
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function backupOk(array $backup): never {
    try {
        $json = json_encode(
            ['ok' => true, 'data' => $backup],
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR
        );
    } catch (JsonException $e) {
        backupFail('Backup data could not be encoded safely', 500, 'encode_failed');
    }
    echo $json;
    exit;
}

function isSensitiveBackupSettingKey(string $key): bool {
    $normalized = strtolower(trim($key));
    if ($normalized === '') return true;
    // Settings may gain new fields over time. Backups should fail on the side of
    // privacy: never export values whose names indicate authentication, secrets,
    // credentials or API keys, even if a future developer forgets to update a
    // one-off blacklist.
    return (bool)preg_match('/(?:^|[_-])(pin|password|passwd|secret|token|credential|api[_-]?key|auth)(?:$|[_-])/i', $normalized);
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') backupFail('GET required', 405, 'method_not_allowed');

$token = (string)($_SERVER['HTTP_X_AUTH_TOKEN'] ?? '');
if (!isAuthorizedToken($token, false)) backupFail('Your session has expired. Please sign in again.', 401, 'unauthorised');

$pdo = db();
$stage = 'snapshot';
$failedRecordId = '';
try {
    // MySQL/MariaDB repeatable-read gives every SELECT in this export the same
    // database snapshot without blocking normal itinerary saves.
    $pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    $pdo->beginTransaction();

    $stage = 'records';
    $records = [];
    $recordMeta = [];
    $rows = $pdo->query('SELECT id, data, updated_at FROM itinerary ORDER BY id')->fetchAll();
    foreach ($rows as $row) {
        $id = (string)$row['id'];
        $decoded = json_decode((string)$row['data'], true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            $failedRecordId = $id;
            throw new RuntimeException('Stored record is invalid JSON');
        }
        $records[$id] = $decoded;
        $recordMeta[$id] = ['updated_at' => $row['updated_at'] ?? null];
    }

    $stage = 'settings';
    // Export ordinary application settings only. Never put PINs, tokens, API
    // keys or future security credentials into a downloadable browser file.
    $settings = [];
    $settingStmt = $pdo->query("SELECT `key`, `value` FROM settings ORDER BY `key`");
    foreach ($settingStmt->fetchAll() as $row) {
        $key = (string)$row['key'];
        if (isSensitiveBackupSettingKey($key)) continue;
        $settings[$key] = (string)$row['value'];
    }

    $stage = 'commit';
    $pdo->commit();

    backupOk([
        'exported_at' => gmdate('c'),
        'version' => 3,
        'record_count' => count($records),
        'setting_count' => count($settings),
        'records' => $records,
        'record_meta' => $recordMeta,
        'settings' => $settings,
        'excluded' => ['security-like settings', 'auth_sessions', 'auth_attempts', 'share_tokens'],
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();

    if ($stage === 'snapshot') {
        backupFail('Could not start a consistent backup snapshot', 500, 'snapshot_start_failed');
    }
    if ($stage === 'records') {
        if ($failedRecordId !== '') {
            backupFail('Stored itinerary record is invalid: ' . $failedRecordId, 500, 'invalid_record_json');
        }
        backupFail('Could not read itinerary records for the backup', 500, 'records_read_failed');
    }
    if ($stage === 'settings') {
        backupFail('Could not read non-security settings for the backup', 500, 'settings_read_failed');
    }
    if ($stage === 'commit') {
        backupFail('Could not finalise the consistent backup snapshot', 500, 'snapshot_commit_failed');
    }
    backupFail('Backup export failed', 500, 'backup_failed');
}
