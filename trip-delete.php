<?php
// MY TRIPS — atomic trip deletion endpoint
// Removes the itinerary, its snapshot history, registry card and share links in
// one transaction so a partial failure cannot leave a ghost card or orphan data.
require_once __DIR__ . '/db-config.php';
require_once __DIR__ . '/auth-session.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');

function deleteTripOk(mixed $data = null): never {
    echo json_encode(['ok' => true, 'data' => $data]);
    exit;
}

function deleteTripFail(string $message, int $status = 400): never {
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $message]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') deleteTripFail('POST required', 405);

$token = (string)($_SERVER['HTTP_X_AUTH_TOKEN'] ?? '');
if (!isAuthorizedToken($token, false)) deleteTripFail('Unauthorised', 401);

const TRIP_DELETE_MAX_REQUEST_BYTES = 65_536;
$contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength > TRIP_DELETE_MAX_REQUEST_BYTES) deleteTripFail('Request too large', 413);
$raw = file_get_contents('php://input', false, null, 0, TRIP_DELETE_MAX_REQUEST_BYTES + 1);
if ($raw === false) deleteTripFail('Could not read request body');
if (strlen($raw) > TRIP_DELETE_MAX_REQUEST_BYTES) deleteTripFail('Request too large', 413);
$body = json_decode($raw ?: '{}', true);
if (!is_array($body)) deleteTripFail('Invalid JSON body');

$id = strtolower(trim((string)($body['id'] ?? '')));
if (!preg_match('/^[a-z0-9][a-z0-9\-]{0,119}$/', $id)) deleteTripFail('Invalid trip id');
if (in_array($id, ['trip-registry', 'settings', 'index'], true)) deleteTripFail('Protected record', 403);

$pdo = db();
try {
    $pdo->beginTransaction();

    // Keep the same registry-first lock order as trip-create.php to avoid
    // creation/deletion deadlocks around the shared registry row.
    $registryStmt = $pdo->prepare("SELECT data FROM itinerary WHERE id = 'trip-registry' FOR UPDATE");
    $registryStmt->execute();
    $registryRow = $registryStmt->fetch();
    if (!$registryRow) {
        $pdo->rollBack();
        deleteTripFail('Trip registry not found', 500);
    }

    $registry = json_decode((string)$registryRow['data'], true);
    if (!is_array($registry) || !isset($registry['trips']) || !is_array($registry['trips'])) {
        $pdo->rollBack();
        deleteTripFail('Trip registry is invalid JSON', 500);
    }

    $tripStmt = $pdo->prepare('SELECT id FROM itinerary WHERE id = ? FOR UPDATE');
    $tripStmt->execute([$id]);
    $tripExists = (bool)$tripStmt->fetch();

    $beforeCount = count($registry['trips']);
    $registry['trips'] = array_values(array_filter(
        $registry['trips'],
        static fn($trip) => !is_array($trip) || strtolower((string)($trip['slug'] ?? '')) !== $id
    ));
    $registryChanged = count($registry['trips']) !== $beforeCount;

    if (!$tripExists && !$registryChanged) {
        $pdo->rollBack();
        deleteTripFail('Trip not found', 404);
    }

    if ($tripExists) {
        $pdo->prepare('DELETE FROM itinerary WHERE id = ?')->execute([$id]);
    }
    $pdo->prepare('DELETE FROM itinerary WHERE id = ?')->execute([$id . '-snaps']);

    $registryJson = json_encode($registry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($registryJson === false) {
        $pdo->rollBack();
        deleteTripFail('Could not encode trip registry', 500);
    }
    $pdo->prepare("UPDATE itinerary SET data = ?, updated_at = NOW() WHERE id = 'trip-registry'")
        ->execute([$registryJson]);

    // Shares are optional on older installs. If the table exists, remove links to
    // the deleted trip as part of the same transaction.
    $sharesTable = $pdo->query("SHOW TABLES LIKE 'shares'")->fetch();
    if ($sharesTable) {
        $pdo->prepare('DELETE FROM shares WHERE trip_id = ?')->execute([$id]);
    }

    $pdo->commit();
    deleteTripOk(['id' => $id, 'deleted' => true]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    deleteTripFail('Trip deletion failed', 500);
}