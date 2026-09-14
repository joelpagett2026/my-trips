<?php
require_once __DIR__ . '/db-config.php';
require_once __DIR__ . '/auth-session.php';

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: private, max-age=20, stale-while-revalidate=40');
header('Vary: X-Auth-Token');

function homeSummaryFail(string $message, int $status = 400): never {
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_SLASHES);
    exit;
}

function homeSummaryOk(array $data): never {
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

$token = (string)($_SERVER['HTTP_X_AUTH_TOKEN'] ?? '');
if (!isAuthorizedToken($token, false)) homeSummaryFail('Unauthorised', 401);

$tz = new DateTimeZone('Europe/London');
$today = new DateTimeImmutable('today', $tz);
$monthStart = $today->modify('first day of this month');

function decodeRecord(?string $raw): array {
    if ($raw === null || $raw === '') return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function dashboardDate(mixed $value, DateTimeZone $tz): ?DateTimeImmutable {
    $s = trim((string)$value);
    if ($s === '') return null;
    foreach (['!d/m/Y', '!m/Y', '!Y-m-d', '!Y'] as $format) {
        $d = DateTimeImmutable::createFromFormat($format, $s, $tz);
        $errors = DateTimeImmutable::getLastErrors();
        if ($d instanceof DateTimeImmutable && ($errors === false || (($errors['warning_count'] ?? 0) === 0 && ($errors['error_count'] ?? 0) === 0))) return $d;
    }
    try { return new DateTimeImmutable($s, $tz); } catch (Throwable) { return null; }
}

function stripImageFields(array $item): array {
    unset($item['thumb'], $item['thumbnail'], $item['photo']);
    return $item;
}

function keepLeadThumbs(array $list, string $kind, DateTimeImmutable $today, DateTimeImmutable $monthStart, DateTimeZone $tz): array {
    $leadIndex = null;
    $upcoming = [];
    $past = [];

    foreach ($list as $i => $item) {
        if (!is_array($item)) continue;
        $d = dashboardDate($item['date'] ?? '', $tz);
        if ($kind === 'shows') {
            if ($d && $d >= $monthStart) $upcoming[] = [$d, $i];
            elseif ($d) $past[] = [$d, $i];
        } else {
            if ($d && $d > $today) $upcoming[] = [$d, $i];
            elseif ($d) $past[] = [$d, $i];
        }
    }

    usort($upcoming, fn($a, $b) => $a[0] <=> $b[0]);
    usort($past, fn($a, $b) => $b[0] <=> $a[0]);
    if ($upcoming) $leadIndex = $upcoming[0][1];
    elseif ($past) $leadIndex = $past[0][1];

    $out = [];
    foreach ($list as $i => $item) {
        if (!is_array($item)) continue;
        $thumb = ($i === $leadIndex && is_string($item['thumb'] ?? null)) ? $item['thumb'] : null;
        $clean = stripImageFields($item);
        if ($thumb) $clean['thumb'] = $thumb;
        $out[] = $clean;
    }
    return $out;
}

try {
    $wanted = ['trip-registry', 'concerts', 'shows', 'parks'];
    $marks = implode(',', array_fill(0, count($wanted), '?'));
    $stmt = db()->prepare("SELECT id, data FROM itinerary WHERE id IN ($marks)");
    $stmt->execute($wanted);

    $records = [];
    foreach ($stmt->fetchAll() as $row) $records[(string)$row['id']] = decodeRecord((string)($row['data'] ?? ''));

    $registry = $records['trip-registry']['trips'] ?? [];
    $registry = is_array($registry) ? array_values(array_filter($registry, 'is_array')) : [];
    $nextTripIndex = null;
    $nextTrips = [];
    foreach ($registry as $i => $trip) {
        if (!empty($trip['deleted'])) continue;
        $d = dashboardDate($trip['dep'] ?? $trip['startDate'] ?? $trip['start'] ?? $trip['date'] ?? '', $tz);
        if ($d && $d >= $today) $nextTrips[] = [$d, $i];
    }
    usort($nextTrips, fn($a, $b) => $a[0] <=> $b[0]);
    if ($nextTrips) $nextTripIndex = $nextTrips[0][1];

    $lightTrips = [];
    foreach ($registry as $i => $trip) {
        $photo = null;
        if ($i === $nextTripIndex) {
            foreach (['thumbnail', 'thumb', 'photo'] as $key) {
                if (!empty($trip[$key]) && is_string($trip[$key])) { $photo = [$key, $trip[$key]]; break; }
            }
        }
        $clean = stripImageFields($trip);
        if ($photo) $clean[$photo[0]] = $photo[1];
        $lightTrips[] = $clean;
    }

    $concerts = $records['concerts'];
    $shows = $records['shows'];
    $parks = $records['parks'];
    $concerts['list'] = keepLeadThumbs(is_array($concerts['list'] ?? null) ? $concerts['list'] : [], 'concerts', $today, $monthStart, $tz);
    $shows['list'] = keepLeadThumbs(is_array($shows['list'] ?? null) ? $shows['list'] : [], 'shows', $today, $monthStart, $tz);
    $parks['list'] = keepLeadThumbs(is_array($parks['list'] ?? null) ? $parks['list'] : [], 'parks', $today, $monthStart, $tz);

    homeSummaryOk([
        'trip-registry' => ['trips' => $lightTrips],
        'concerts' => $concerts,
        'shows' => $shows,
        'parks' => $parks,
    ]);
} catch (Throwable $e) {
    error_log('Homepage summary failed: ' . $e->getMessage());
    homeSummaryFail('Homepage summary unavailable', 500);
}
