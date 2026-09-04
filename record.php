<?php
// MY TRIPS — conflict-safe itinerary record API
// Handles load/save plus atomic item-level mutations for itinerary records.
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

function readRecordJsonBody(): array {
    $contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > RECORD_MAX_REQUEST_BYTES) respondFail('Request too large', 413);
    $raw = file_get_contents('php://input', false, null, 0, RECORD_MAX_REQUEST_BYTES + 1);
    if ($raw === false) respondFail('Could not read request body');
    if (strlen($raw) > RECORD_MAX_REQUEST_BYTES) respondFail('Request too large', 413);
    $body = json_decode($raw ?: '', true);
    if (!is_array($body)) respondFail('Invalid JSON body');
    return $body;
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

if ($action === 'upsert_item') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') respondFail('POST required', 405);
    $body = readRecordJsonBody();

    $id = (string)($body['id'] ?? '');
    $dayIndex = filter_var($body['day_index'] ?? null, FILTER_VALIDATE_INT);
    $itemIndex = filter_var($body['item_index'] ?? null, FILTER_VALIDATE_INT);
    $item = is_array($body['item'] ?? null) ? $body['item'] : null;
    $originalItem = is_array($body['original_item'] ?? null) ? $body['original_item'] : null;

    if ($id === '' || $dayIndex === false || $dayIndex < 0 || !$item) {
        respondFail('Missing or invalid item save target');
    }
    if (trim((string)($item['type'] ?? '')) === '' || trim((string)($item['title'] ?? '')) === '') {
        respondFail('Saved item is missing its type or title');
    }

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
        $targetIndex = -1;
        $itemId = trim((string)($item['_id'] ?? ''));
        $originalId = trim((string)($originalItem['_id'] ?? ''));

        if ($originalItem !== null) {
            // Editing: identify the exact item, then prove the item itself has not
            // changed on the server. Unrelated edits elsewhere in the itinerary do
            // not block this save, but two tabs editing the same item do.
            if ($originalId !== '') {
                foreach ($items as $i => $candidate) {
                    if (is_array($candidate) && (string)($candidate['_id'] ?? '') === $originalId) {
                        $targetIndex = $i;
                        break;
                    }
                }
            }

            if ($targetIndex < 0 && $itemIndex !== false && $itemIndex >= 0 && isset($items[$itemIndex]) && is_array($items[$itemIndex])) {
                if ($items[$itemIndex] == $originalItem) $targetIndex = $itemIndex;
            }

            if ($targetIndex < 0) {
                $matches = [];
                foreach ($items as $i => $candidate) {
                    if (is_array($candidate) && $candidate == $originalItem) $matches[] = $i;
                }
                if (count($matches) === 1) $targetIndex = $matches[0];
            }

            if ($targetIndex < 0 || !isset($items[$targetIndex]) || !is_array($items[$targetIndex])) {
                $pdo->rollBack();
                respondFail('This item changed before it could be saved. Reload and try again.', 409);
            }
            if (!($items[$targetIndex] == $originalItem)) {
                $pdo->rollBack();
                respondFail('This item was changed in another tab. Reload before editing it again.', 409);
            }

            $items[$targetIndex] = $item;
        } else {
            // New item: stable IDs make retries idempotent. If the first response
            // was lost but the server already committed the item, retrying replaces
            // that exact item instead of creating a duplicate.
            if ($itemId !== '') {
                foreach ($items as $i => $candidate) {
                    if (is_array($candidate) && (string)($candidate['_id'] ?? '') === $itemId) {
                        $targetIndex = $i;
                        break;
                    }
                }
            }

            if ($targetIndex >= 0) {
                $items[$targetIndex] = $item;
            } else {
                $insertAt = ($itemIndex !== false && $itemIndex >= 0)
                    ? min($itemIndex, count($items))
                    : count($items);
                array_splice($items, $insertAt, 0, [$item]);
                $targetIndex = $insertAt;
            }
        }

        $period = trim((string)($item['period'] ?? ''));
        if ($period !== '' && isset($data['days'][$dayIndex]['_hiddenPeriods']) && is_array($data['days'][$dayIndex]['_hiddenPeriods'])) {
            $data['days'][$dayIndex]['_hiddenPeriods'] = array_values(array_filter(
                $data['days'][$dayIndex]['_hiddenPeriods'],
                static fn($value) => (string)$value !== $period
            ));
        }

        $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json === false) throw new RuntimeException('Could not encode updated trip');

        $update = $pdo->prepare('UPDATE itinerary SET data = ?, updated_at = NOW() WHERE id = ?');
        $update->execute([$json, $id]);
        $pdo->commit();

        respondOk([
            'id' => $id,
            'saved' => true,
            'saved_index' => $targetIndex,
            'data' => $data,
            'version' => hash('sha256', $json),
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        respondFail('Save item failed', 500);
    }
}

if ($action === 'delete_item') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') respondFail('POST required', 405);
    $body = readRecordJsonBody();

    $id = (string)($body['id'] ?? '');
    $dayIndex = filter_var($body['day_index'] ?? null, FILTER_VALIDATE_INT);
    $originalIndex = filter_var($body['item_index'] ?? null, FILTER_VALIDATE_INT);
    $itemId = (string)($body['item_id'] ?? '');
    $fingerprint = is_array($body['fingerprint'] ?? null) ? $body['fingerprint'] : [];
    if ($id === '' || $dayIndex === false || $dayIndex < 0) respondFail('Missing or invalid delete target');

    $matchesFingerprint = static function(array $item, array $fp): bool {
        $transport = is_array($item['transport'] ?? null) ? $item['transport'] : [];
        return
            (string)($item['type'] ?? '') === (string)($fp['type'] ?? '') &&
            (string)($item['title'] ?? '') === (string)($fp['title'] ?? '') &&
            (string)($item['time'] ?? '') === (string)($fp['time'] ?? '') &&
            (string)($item['period'] ?? '') === (string)($fp['period'] ?? '') &&
            (string)($transport['mode'] ?? '') === (string)($fp['mode'] ?? '') &&
            (string)($transport['from'] ?? '') === (string)($fp['from'] ?? '') &&
            (string)($transport['to'] ?? '') === (string)($fp['to'] ?? '');
    };

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
            foreach ($items as $i => $candidate) {
                if (is_array($candidate) && (string)($candidate['_id'] ?? '') === $itemId) {
                    $matchIndex = $i;
                    break;
                }
            }
        }

        if ($matchIndex < 0 && $originalIndex !== false && $originalIndex >= 0 && isset($items[$originalIndex]) && is_array($items[$originalIndex])) {
            if (!$fingerprint || $matchesFingerprint($items[$originalIndex], $fingerprint)) {
                $matchIndex = $originalIndex;
            }
        }

        if ($matchIndex < 0 && $fingerprint) {
            $matches = [];
            foreach ($items as $i => $candidate) {
                if (is_array($candidate) && $matchesFingerprint($candidate, $fingerprint)) $matches[] = $i;
            }
            if (count($matches) === 1) $matchIndex = $matches[0];
        }

        if ($matchIndex < 0) {
            $pdo->rollBack();
            respondFail('Item not found or no longer uniquely identifiable', 409);
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
            'deleted_index' => $matchIndex,
            'version' => hash('sha256', $json),
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        respondFail('Delete item failed', 500);
    }
}

if ($action === 'save') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') respondFail('POST required', 405);
    $body = readRecordJsonBody();

    $id = (string)($body['id'] ?? '');
    $data = $body['data'] ?? null;
    if ($id === '' || $data === null) respondFail('Missing id or data');

    $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) respondFail('Data could not be encoded');

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
            if ($expectedVersion === null || !hash_equals($currentVersion, $expectedVersion)) {
                $pdo->rollBack();
                respondFail('A newer version already exists', 409, ['current_version' => $currentVersion]);
            }
            $update = $pdo->prepare('UPDATE itinerary SET data = ?, updated_at = NOW() WHERE id = ?');
            $update->execute([$json, $id]);
        } else {
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
