<?php
// MY TRIPS — conflict-safe itinerary record API
// Handles only load/save of whole JSON records. Other actions remain in api.php.
require_once __DIR__ . '/db-config.php';
require_once __DIR__ . '/auth-session.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');

const RECORD_MAX_REQUEST_BYTES = 8_000_000;

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function respondOk(mixed $data = null): never {
    echo json_encode(['ok' => true, 'data' => $data]);
    exit;
}

function respondFail(string $message, int $status = 400, mixed $data = null): never {
    http_response_code($status);
    $payload = ['ok' => false, 'error' => $message];
    if ($data !== null) $payload['data'] = $data;
    echo json_encode($payload);
    exit;
}

$token = (string)($_SERVER['HTTP_X_AUTH_TOKEN'] ?? '');
if (!isAuthorizedToken($token, false)) respondFail('Unauthorised', 401);

$action = (string)($_GET['action'] ?? '');

if ($action === 'load') {
    $id = (string)($_GET['id'] ?? '');
    if ($id === '') respondFail('Missing id');

    $stmt = db()->prepare('SELECT data, updated_at FROM itinerary WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) respondOk(null);

    $decoded = json_decode((string)$row['data'], true);
    if (json_last_error() !== JSON_ERROR_NONE) respondFail('Stored record is invalid JSON', 500);

    respondOk([
        'data' => $decoded,
        'version' => hash('sha256', (string)$row['data']),
        'updated_at' => $row['updated_at'],
    ]);
}

if ($action === 'delete_item') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') respondFail('POST required', 405);

    $raw = file_get_contents('php://input');
    $body = json_decode($raw ?: '', true);
    if (!is_array($body)) respondFail('Invalid JSON body');

    $id = (string)($body['id'] ?? '');
    $dayIndex = filter_var($body['day_index'] ?? null, FILTER_VALIDATE_INT);
    $itemId = (string)($body['item_id'] ?? '');
    $fingerprint = is_array($body['fingerprint'] ?? null) ? $body['fingerprint'] : [];
    if ($id === '' || $dayIndex === false || $dayIndex < 0) respondFail('Missing or invalid delete target');

    $pdo = db();
    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare('SELECT data FROM itinerary WHERE id = ? FOR UPDATE');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            $pdo->rollBack();
            respondFail('Trip not found', 404);
        }

        $data = json_decode((string)$row['data'], true);
        if (!is_array($data) || !isset($data['days'][$dayIndex]['items']) || !is_array($data['days'][$dayIndex]['items'])) {
            $pdo->rollBack();
            respondFail('Trip day not found', 404);
        }

        $items =& $data['days'][$dayIndex]['items'];
        $matchIndex = -1;

        if ($itemId !== '') {
            foreach ($items as $i => $item) {
                if (is_array($item) && (string)($item['_id'] ?? '') === $itemId) {
                    $matchIndex = $i;
                    break;
                }
            }
        }

        if ($matchIndex < 0 && $fingerprint) {
            foreach ($items as $i => $item) {
                if (!is_array($item)) continue;
                $mode = (string)($item['transport']['mode'] ?? '');
                $from = (string)($item['transport']['from'] ?? '');
                $to = (string)($item['transport']['to'] ?? '');
                $same =
                    (string)($item['type'] ?? '') === (string)($fingerprint['type'] ?? '') &&
                    (string)($item['title'] ?? '') === (string)($fingerprint['title'] ?? '') &&
                    (string)($item['time'] ?? '') === (string)($fingerprint['time'] ?? '') &&
                    $mode === (string)($fingerprint['mode'] ?? '') &&
                    $from === (string)($fingerprint['from'] ?? '') &&
                    $to === (string)($fingerprint['to'] ?? '');
                if ($same) {
                    $matchIndex = $i;
                    break;
                }
            }
        }

        if ($matchIndex < 0) {
            $pdo->rollBack();
            respondFail('Item not found', 404);
        }

        $target = $items[$matchIndex];
        if ((string)($target['type'] ?? '') !== 'move') {
            $pdo->rollBack();
            respondFail('Target is not transport', 400);
        }

        array_splice($items, $matchIndex, 1);
        $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json === false) throw new RuntimeException('Could not encode updated trip');

        $update = $pdo->prepare('UPDATE itinerary SET data = ?, updated_at = NOW() WHERE id = ?');
        $update->execute([$json, $id]);
        $pdo->commit();

        respondOk([
            'id' => $id,
            'deleted' => true,
            'version' => hash('sha256', $json),
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        respondFail('Delete item failed', 500);
    }
}

if ($action === 'save') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') respondFail('POST required', 405);

    // Itinerary records can legitimately be fairly large (for example when a
    // compressed cover image is embedded), but there is no reason to accept an
    // unbounded request. Reject oversized bodies before reading them fully.
    $contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > RECORD_MAX_REQUEST_BYTES) respondFail('Request too large', 413);
    $raw = file_get_contents('php://input', false, null, 0, RECORD_MAX_REQUEST_BYTES + 1);
    if ($raw === false) respondFail('Could not read request body');
    if (strlen($raw) > RECORD_MAX_REQUEST_BYTES) respondFail('Request too large', 413);

    $body = json_decode($raw ?: '', true);
    if (!is_array($body)) respondFail('Invalid JSON body');

    $id = (string)($body['id'] ?? '');
    $data = $body['data'] ?? null;
    if ($id === '' || $data === null) respondFail('Missing id or data');

    $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) respondFail('Data could not be encoded');

    // Every write must prove what version the browser last observed. Omitting the
    // field would otherwise silently turn this endpoint back into last-write-wins.
    if (!array_key_exists('expected_version', $body)) {
        respondFail('Missing expected_version', 428);
    }
    $expectedVersion = $body['expected_version'];
    if ($expectedVersion !== null && !is_string($expectedVersion)) respondFail('Invalid expected_version');
    if (is_string($expectedVersion) && !preg_match('/^[a-f0-9]{64}$/', $expectedVersion)) {
        respondFail('Invalid expected_version');
    }

    $pdo = db();
    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare('SELECT data FROM itinerary WHERE id = ? FOR UPDATE');
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        if ($row) {
            $currentVersion = hash('sha256', (string)$row['data']);
            // null means the client previously observed "record did not exist";
            // therefore an existing row is necessarily a conflict.
            if ($expectedVersion === null || !hash_equals($currentVersion, $expectedVersion)) {
                $pdo->rollBack();
                respondFail('A newer version already exists', 409, ['current_version' => $currentVersion]);
            }
            $update = $pdo->prepare('UPDATE itinerary SET data = ?, updated_at = NOW() WHERE id = ?');
            $update->execute([$json, $id]);
        } else {
            // expected_version=null explicitly means the client loaded this ID and
            // observed that it did not yet exist. Any non-null expectation is stale.
            if ($expectedVersion !== null) {
                $pdo->rollBack();
                respondFail('The record changed before it could be saved', 409);
            }
            $insert = $pdo->prepare('INSERT INTO itinerary (id, data, updated_at) VALUES (?, ?, NOW())');
            $insert->execute([$id, $json]);
        }

        $pdo->commit();
        respondOk(['id' => $id, 'version' => hash('sha256', $json)]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        respondFail('Save failed', 500);
    }
}

respondFail('Unknown action', 404);