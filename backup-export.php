<?php
// MY TRIPS — consistent authenticated backup export
// Builds one repeatable-read database snapshot incrementally so large itinerary
// collections do not need to exist as one giant PHP array in memory.
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

function backupEncode(mixed $value): string {
    try {
        return json_encode(
            $value,
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR
        );
    } catch (JsonException $e) {
        throw new RuntimeException('Backup JSON encoding failed', 0, $e);
    }
}

function backupWrite($stream, string $chunk): void {
    $length = strlen($chunk);
    $offset = 0;
    while ($offset < $length) {
        $written = fwrite($stream, substr($chunk, $offset));
        if ($written === false || $written === 0) {
            throw new RuntimeException('Could not write the backup snapshot');
        }
        $offset += $written;
    }
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
$snapshotStream = null;
try {
    // php://temp keeps a small prefix in memory and automatically spills larger
    // snapshots to a server-side temporary file. Nothing is sent to the browser
    // until every record has been validated and the transaction has committed.
    $snapshotStream = fopen('php://temp/maxmemory:1048576', 'w+b');
    if (!is_resource($snapshotStream)) {
        throw new RuntimeException('Could not create backup snapshot stream');
    }

    // MySQL/MariaDB repeatable-read gives every SELECT in this export the same
    // database snapshot without blocking normal itinerary saves.
    $pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    $pdo->beginTransaction();

    // Prevent the PDO MySQL driver from buffering the complete result set in PHP
    // memory before we can stream it into the completed snapshot.
    $bufferedQueryAttr = defined('PDO::MYSQL_ATTR_USE_BUFFERED_QUERY')
        ? constant('PDO::MYSQL_ATTR_USE_BUFFERED_QUERY')
        : null;
    if ($bufferedQueryAttr !== null) {
        $pdo->setAttribute($bufferedQueryAttr, false);
    }

    backupWrite(
        $snapshotStream,
        '{"ok":true,"data":{"exported_at":' . backupEncode(gmdate('c')) . ',"version":3,"records":{'
    );

    $stage = 'records';
    $recordCount = 0;
    $recordMeta = [];
    $firstRecord = true;
    $rows = $pdo->query('SELECT id, data, updated_at FROM itinerary ORDER BY id');
    while ($row = $rows->fetch()) {
        $id = (string)$row['id'];
        $rawData = (string)$row['data'];

        // Validate each stored JSON document before copying its already-encoded
        // representation into the snapshot. Only one itinerary is decoded at a
        // time, avoiding the old all-records-in-memory expansion.
        try {
            json_decode($rawData, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $e) {
            $failedRecordId = $id;
            throw new RuntimeException('Stored record is invalid JSON', 0, $e);
        }

        backupWrite(
            $snapshotStream,
            ($firstRecord ? '' : ',') . backupEncode($id) . ':' . $rawData
        );
        $firstRecord = false;
        $recordCount++;
        $recordMeta[$id] = ['updated_at' => $row['updated_at'] ?? null];
    }
    $rows->closeCursor();

    backupWrite(
        $snapshotStream,
        '},"record_meta":' . backupEncode($recordMeta) . ',"settings":{'
    );

    $stage = 'settings';
    $settingCount = 0;
    $firstSetting = true;
    $settingStmt = $pdo->query("SELECT `key`, `value` FROM settings ORDER BY `key`");
    while ($row = $settingStmt->fetch()) {
        $key = (string)$row['key'];
        if (isSensitiveBackupSettingKey($key)) continue;

        backupWrite(
            $snapshotStream,
            ($firstSetting ? '' : ',') . backupEncode($key) . ':' . backupEncode((string)$row['value'])
        );
        $firstSetting = false;
        $settingCount++;
    }
    $settingStmt->closeCursor();

    backupWrite(
        $snapshotStream,
        '},"record_count":' . $recordCount
        . ',"setting_count":' . $settingCount
        . ',"excluded":' . backupEncode(['security-like settings', 'auth_sessions', 'auth_attempts', 'share_tokens'])
        . '}}'
    );

    $stage = 'commit';
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    if (is_resource($snapshotStream)) fclose($snapshotStream);

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

// The snapshot is complete and committed before any response bytes are sent.
// This preserves fail-closed behaviour while avoiding a second giant JSON copy.
if (!is_resource($snapshotStream)) {
    backupFail('Completed backup snapshot is unavailable', 500, 'snapshot_unavailable');
}
$downloadBytes = ftell($snapshotStream);
if ($downloadBytes === false || !rewind($snapshotStream)) {
    fclose($snapshotStream);
    backupFail('Could not prepare the completed backup download', 500, 'snapshot_prepare_failed');
}
header('Content-Length: ' . $downloadBytes);
fpassthru($snapshotStream);
fclose($snapshotStream);
exit;
