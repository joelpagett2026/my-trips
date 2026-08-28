<?php
// MY TRIPS — safe generic record deletion
// Non-trip tools still need to delete their own records, but generic deletion
// must never be able to orphan a trip or remove shared system state.
require_once __DIR__ . '/db-config.php';
require_once __DIR__ . '/auth-session.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');

const RECORD_DELETE_MAX_REQUEST_BYTES = 65_536;

function recordDeleteOk(mixed $data = null): never {
    echo json_encode(['ok' => true, 'data' => $data]);
    exit;
}

function recordDeleteFail(string $message, int $status = 400): never {
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $message]);
    exit;
}

if (!in_array($_SERVER['REQUEST_METHOD'], ['DELETE', 'POST'], true)) {
    recordDeleteFail('DELETE or POST required', 405);
}

$token = (string)($_SERVER['HTTP_X_AUTH_TOKEN'] ?? '');
if (!isAuthorizedToken($token, false)) recordDeleteFail('Unauthorised', 401);

$body = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > RECORD_DELETE_MAX_REQUEST_BYTES) recordDeleteFail('Request too large', 413);
    $raw = file_get_contents('php://input', false, null, 0, RECORD_DELETE_MAX_REQUEST_BYTES + 1);
    if ($raw === false) recordDeleteFail('Could not read request body');
    if (strlen($raw) > RECORD_DELETE_MAX_REQUEST_BYTES) recordDeleteFail('Request too large', 413);
    $decoded = json_decode($raw ?: '{}', true);
    if (!is_array($decoded)) recordDeleteFail('Invalid JSON body');
    $body = $decoded;
}

$id = trim((string)($_GET['id'] ?? $body['id'] ?? ''));
if ($id === '' || strlen($id) > 255 || preg_match('/[\x00-\x1F\x7F]/', $id)) {
    recordDeleteFail('Invalid record id');
}

// These records are application infrastructure rather than ordinary user-owned
// list items. Snapshot records are removed only as part of atomic trip deletion.
$protected = ['trip-registry'];
if (in_array(strtolower($id), $protected, true) || str_ends_with(strtolower($id), '-snaps')) {
    recordDeleteFail('Protected record', 403);
}

$pdo = db();
try {
    $pdo->beginTransaction();

    // Lock the registry using the same first-lock order as trip-create.php and
    // trip-delete.php. This prevents a concurrent trip creation from racing a
    // generic delete of the same ID.
    $registryStmt = $pdo->prepare("SELECT data FROM itinerary WHERE id = 'trip-registry' FOR UPDATE");
    $registryStmt->execute();
    $registryRow = $registryStmt->fetch();
    if (!$registryRow) {
        $pdo->rollBack();
        recordDeleteFail('Trip registry not found; generic deletion is disabled until it is restored', 500);
    }

    $registry = json_decode((string)$registryRow['data'], true);
    if (!is_array($registry) || !is_array($registry['trips'] ?? null)) {
        $pdo->rollBack();
        recordDeleteFail('Trip registry is invalid; generic deletion is disabled to protect itinerary data', 500);
    }

    // If this ID is an active itinerary slug, force callers through
    // trip-delete.php so registry, snapshots and shares stay consistent.
    foreach ($registry['trips'] as $trip) {
        if (is_array($trip) && strtolower((string)($trip['slug'] ?? '')) === strtolower($id)) {
            $pdo->rollBack();
            recordDeleteFail('Trip records must be deleted through the trip deletion endpoint', 409);
        }
    }

    $stmt = $pdo->prepare('DELETE FROM itinerary WHERE id = ?');
    $stmt->execute([$id]);
    $deleted = $stmt->rowCount() > 0;
    $pdo->commit();
    recordDeleteOk(['id' => $id, 'deleted' => $deleted]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    recordDeleteFail('Record deletion failed', 500);
}