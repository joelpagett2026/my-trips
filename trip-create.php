<?php
// MY TRIPS — atomic trip creation endpoint
// Creates the initial itinerary record and its trip-registry entry in one
// transaction so a partial failure cannot leave an orphaned trip/card.
require_once __DIR__ . '/db-config.php';
require_once __DIR__ . '/auth-session.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');

function createTripOk(mixed $data = null): never {
    echo json_encode(['ok' => true, 'data' => $data]);
    exit;
}

function createTripFail(string $message, int $status = 400): never {
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $message]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') createTripFail('POST required', 405);

$token = (string)($_SERVER['HTTP_X_AUTH_TOKEN'] ?? '');
if (!isAuthorizedToken($token, false)) createTripFail('Unauthorised', 401);

$raw = file_get_contents('php://input');
$body = json_decode($raw ?: '{}', true);
if (!is_array($body)) createTripFail('Invalid JSON body');

$slug = preg_replace('/[^a-z0-9\-]/', '', strtolower(trim((string)($body['slug'] ?? ''))));
$dest = trim((string)($body['dest'] ?? ''));
$dep = trim((string)($body['dep'] ?? ''));
$ret = trim((string)($body['ret'] ?? ''));
$trav = trim((string)($body['trav'] ?? '2'));
$status = trim((string)($body['status'] ?? 'upcoming'));
$photo = (string)($body['photo'] ?? '');
$points = is_array($body['points'] ?? null) ? $body['points'] : [];
$flags = is_array($body['flags'] ?? null) ? $body['flags'] : [];
$cities = is_array($body['cities'] ?? null) ? $body['cities'] : [$dest];

if ($slug === '' || $dest === '') createTripFail('Missing slug or destination');
if (strlen($slug) > 120 || strlen($dest) > 180) createTripFail('Trip name is too long');
if (!preg_match('/^\d{1,2}$/', $trav) || (int)$trav < 1 || (int)$trav > 20) createTripFail('Invalid traveller count');
if (!in_array($status, ['upcoming', 'planning', 'past'], true)) createTripFail('Invalid trip status');
if ($photo !== '' && strlen($photo) > 2_500_000) createTripFail('Cover photo is too large');

$reserved = [
    'index', 'settings', 'new-trip', 'new-trip-v2', 'api', 'auth-v2',
    'auth-session', 'record', 'trip-create', 'deploy-webhook', 'trip',
    'db-config', 'robots', 'favicon', 'trips', 'holidays', 'icons',
    'concerts', 'parks', 'shows', 'private', 'share', 'template-runtime',
];
if (in_array($slug, $reserved, true)) createTripFail('That trip name is reserved — please choose another');

$days = [];
$depDt = DateTime::createFromFormat('!d/m/Y', $dep) ?: null;
$retDt = DateTime::createFromFormat('!d/m/Y', $ret) ?: null;
if ($depDt && $retDt && $retDt >= $depDt) {
    $dayCount = (int)$depDt->diff($retDt)->format('%a') + 1;
    if ($dayCount > 120) createTripFail('Trip duration is too long');
    $cursor = clone $depDt;
    for ($i = 0; $i < $dayCount; $i++) {
        $days[] = [
            'date' => $cursor->format('d/m/Y'),
            'loc' => $dest,
            'title' => 'Day ' . ($i + 1),
            'items' => [],
        ];
        $cursor->modify('+1 day');
    }
} else {
    $days[] = ['date' => $dep, 'loc' => $dest, 'title' => 'Day 1', 'items' => []];
}

$seed = [
    'days' => $days,
    'meta' => [
        'dest' => $dest,
        'dep' => $dep,
        'ret' => $ret,
        'trav' => $trav,
        'status' => $status,
        'hotel' => null,
        'budget' => null,
        'coverPhoto' => $photo,
    ],
];
$seedJson = json_encode($seed, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
if ($seedJson === false) createTripFail('Could not encode initial trip data');

$registryEntry = [
    'dest' => $dest,
    'dep' => $dep,
    'ret' => $ret,
    'trav' => $trav,
    'status' => $status,
    'slug' => $slug,
    'url' => '/' . $slug,
    'points' => array_values($points),
    'flags' => array_values($flags),
    'cities' => array_values(array_filter(array_map(static fn($v) => trim((string)$v), $cities))),
    'created' => (int)round(microtime(true) * 1000),
    'photo' => $photo,
];

$pdo = db();
try {
    $pdo->beginTransaction();

    // Lock the registry first. Every trip creation follows the same lock order so
    // duplicate checks and registry writes cannot race each other.
    $registryStmt = $pdo->prepare("SELECT data FROM itinerary WHERE id = 'trip-registry' FOR UPDATE");
    $registryStmt->execute();
    $registryRow = $registryStmt->fetch();
    $registry = ['trips' => []];
    if ($registryRow) {
        $decodedRegistry = json_decode((string)$registryRow['data'], true);
        if (!is_array($decodedRegistry)) {
            $pdo->rollBack();
            createTripFail('Trip registry is invalid JSON', 500);
        }
        $registry = $decodedRegistry;
        if (!isset($registry['trips']) || !is_array($registry['trips'])) $registry['trips'] = [];
    }

    foreach ($registry['trips'] as $existingTrip) {
        if (is_array($existingTrip) && strtolower((string)($existingTrip['slug'] ?? '')) === $slug) {
            $pdo->rollBack();
            createTripFail('A trip with this destination and year already exists', 409);
        }
    }

    $existingStmt = $pdo->prepare('SELECT id FROM itinerary WHERE id = ? FOR UPDATE');
    $existingStmt->execute([$slug]);
    if ($existingStmt->fetch()) {
        $pdo->rollBack();
        createTripFail('A trip with this destination and year already exists', 409);
    }

    // Plain INSERT is deliberate: never overwrite an existing itinerary while
    // creating a new trip.
    $insertTrip = $pdo->prepare('INSERT INTO itinerary (id, data, updated_at) VALUES (?, ?, NOW())');
    $insertTrip->execute([$slug, $seedJson]);

    $registry['trips'][] = $registryEntry;
    $registryJson = json_encode($registry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($registryJson === false) {
        $pdo->rollBack();
        createTripFail('Could not encode trip registry', 500);
    }

    if ($registryRow) {
        $updateRegistry = $pdo->prepare("UPDATE itinerary SET data = ?, updated_at = NOW() WHERE id = 'trip-registry'");
        $updateRegistry->execute([$registryJson]);
    } else {
        $insertRegistry = $pdo->prepare("INSERT INTO itinerary (id, data, updated_at) VALUES ('trip-registry', ?, NOW())");
        $insertRegistry->execute([$registryJson]);
    }

    $pdo->commit();
    createTripOk(['slug' => $slug, 'url' => '/' . $slug]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    if ((string)$e->getCode() === '23000') {
        createTripFail('A trip with this destination and year already exists', 409);
    }
    createTripFail('Trip creation failed', 500);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    createTripFail('Trip creation failed', 500);
}
