<?php
// MY TRIPS — conflict-safe itinerary record API
// Handles only load/save of whole JSON records. Other actions remain in api.php.
require_once __DIR__ . '/db-config.php';
require_once __DIR__ . '/auth-session.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Auth-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

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
if (!isAuthorizedToken($token, true)) respondFail('Unauthorised', 401);

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

if ($action === 'save') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') respondFail('POST required', 405);
    $raw = file_get_contents('php://input');
    $body = json_decode($raw ?: '', true);
    if (!is_array($body)) respondFail('Invalid JSON body');

    $id = (string)($body['id'] ?? '');
    $data = $body['data'] ?? null;
    if ($id === '' || $data === null) respondFail('Missing id or data');

    $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) respondFail('Data could not be encoded');

    $hasExpectedVersion = array_key_exists('expected_version', $body);
    $expectedVersion = $body['expected_version'] ?? null;
    if ($expectedVersion !== null && !is_string($expectedVersion)) respondFail('Invalid expected_version');

    $pdo = db();
    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare('SELECT data FROM itinerary WHERE id = ? FOR UPDATE');
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        if ($row) {
            $currentVersion = hash('sha256', (string)$row['data']);
            if ($hasExpectedVersion && !is_string($expectedVersion)) {
                $pdo->rollBack();
                respondFail('A newer version already exists', 409, ['current_version' => $currentVersion]);
            }
            if ($hasExpectedVersion && !hash_equals($currentVersion, $expectedVersion)) {
                $pdo->rollBack();
                respondFail('A newer version already exists', 409, ['current_version' => $currentVersion]);
            }
            $update = $pdo->prepare('UPDATE itinerary SET data = ?, updated_at = NOW() WHERE id = ?');
            $update->execute([$json, $id]);
        } else {
            // expected_version=null explicitly means the client loaded this ID and
            // observed that it did not yet exist. Any non-null expectation is stale.
            if ($hasExpectedVersion && $expectedVersion !== null) {
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
