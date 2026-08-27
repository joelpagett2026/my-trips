<?php
// ══════════════════════════════════════════════════════════════════════
// MY TRIPS — API
// ══════════════════════════════════════════════════════════════════════
require_once __DIR__ . '/db-config.php'; // DB_HOST/DB_NAME/DB_USER/DB_PASS/PUBLIC_HTML + db()
require_once __DIR__ . '/auth-session.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Auth-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

// ── AUTH CHECK ────────────────────────────────────────────────────────
// Public share loading is the only unauthenticated action. Everything else
// requires a random, expiring server-side session token issued by auth-v2.php.
$action = $_GET['action'] ?? '';
$publicActions = ['share_load'];

if (!in_array($action, $publicActions, true)) {
    $token = (string)($_SERVER['HTTP_X_AUTH_TOKEN'] ?? '');
    if (!isAuthorizedToken($token, false)) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'Unauthorised']);
        exit;
    }
}

function ok(mixed $data = null): void {
    echo json_encode(['ok' => true, 'data' => $data]);
    exit;
}

function fail(string $msg, int $code = 400): void {
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg]);
    exit;
}

// ── BODY ──────────────────────────────────────────────────────────────
$body = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input');
    $body = json_decode($raw ?: '{}', true);
    if (!is_array($body)) fail('Invalid JSON body');
}

// ══════════════════════════════════════════════════════════════════════
//  ACTIONS
// ══════════════════════════════════════════════════════════════════════

switch ($action) {

    // ── LOAD A RECORD ────────────────────────────────────────────────
    // Retained for Settings/backup compatibility. Itinerary runtime reads use
    // record.php so they also receive conflict/version protection.
    case 'load':
        $id = $_GET['id'] ?? '';
        if (!$id) fail('Missing id');
        $stmt = db()->prepare("SELECT data, updated_at FROM itinerary WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) ok(null);
        $decoded = json_decode((string)$row['data'], true);
        if (json_last_error() !== JSON_ERROR_NONE) fail('Stored record is invalid JSON', 500);
        ok(['data' => $decoded, 'updated_at' => $row['updated_at']]);

    // ── LEGACY SAVE A RECORD ─────────────────────────────────────────
    // Runtime saving uses record.php. This remains for older non-itinerary
    // pages but is protected by the same secure server session.
    case 'save':
        $id   = $body['id']   ?? '';
        $data = $body['data'] ?? null;
        if (!$id || $data === null) fail('Missing id or data');
        $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json === false) fail('Invalid data');
        db()->prepare("INSERT INTO itinerary (id, data, updated_at) VALUES (?, ?, NOW())
                       ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()")
            ->execute([$id, $json]);
        ok(['id' => $id]);

    // ── CREATE TRIP PAGE ─────────────────────────────────────────────
    case 'create_page':
        $slug   = preg_replace('/[^a-z0-9\-]/', '', strtolower($body['slug'] ?? ''));
        $dest   = $body['dest'] ?? '';
        $dep    = $body['dep']  ?? '';
        $ret    = $body['ret']  ?? '';
        $trav   = $body['trav'] ?? '2';
        $status = $body['status'] ?? 'upcoming';
        $photo  = $body['photo'] ?? '';
        if (!$slug || !$dest) fail('Missing slug or dest');

        $reserved = ['index', 'settings', 'new-trip', 'new-trip-v2',
            'api', 'auth-v2', 'auth-session', 'record', 'deploy-webhook', 'trip',
            'db-config', 'robots', 'favicon', 'trips', 'holidays', 'icons',
            'concerts', 'parks', 'shows', 'private'];
        if (in_array($slug, $reserved, true)) fail('That trip name is reserved — please choose another');

        if ($photo) {
            $days = [];
            $depDt = DateTime::createFromFormat('d/m/Y', $dep) ?: null;
            $retDt = DateTime::createFromFormat('d/m/Y', $ret) ?: null;
            if ($depDt && $retDt && $retDt >= $depDt) {
                $dayCount = (int)$depDt->diff($retDt)->format('%a') + 1;
                $cursor = clone $depDt;
                for ($i = 0; $i < $dayCount; $i++) {
                    $days[] = ['date' => $cursor->format('d/m/Y'), 'loc' => $dest, 'title' => 'Day ' . ($i + 1), 'items' => []];
                    $cursor->modify('+1 day');
                }
            } else {
                $days = [[ 'date' => $dep, 'loc' => $dest, 'title' => 'Day 1', 'items' => [] ]];
            }
            $seed = [
                'days' => $days,
                'meta' => [
                    'dest' => $dest, 'dep' => $dep, 'ret' => $ret, 'trav' => $trav, 'status' => $status,
                    'hotel' => null, 'budget' => null, 'coverPhoto' => $photo,
                ],
            ];
            $seedJson = json_encode($seed, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            if ($seedJson === false) fail('Could not create initial trip data');
            db()->prepare("INSERT INTO itinerary (id, data, updated_at) VALUES (?, ?, NOW())
                           ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()")
                ->execute([$slug, $seedJson]);
        }

        ok(['slug' => $slug, 'url' => '/' . $slug]);

    // ── SHARE: CREATE A SHARE LINK ───────────────────────────────────
    case 'create_share':
        $tripId = $body['trip_id'] ?? '';
        if (!$tripId) fail('Missing trip_id');
        ensureSharesTable();
        $token = bin2hex(random_bytes(12));
        db()->prepare("INSERT INTO shares (token, trip_id, created_at) VALUES (?, ?, NOW())")
            ->execute([$token, $tripId]);
        ok(['token' => $token]);

    case 'list_shares':
        $tripId = $_GET['trip_id'] ?? '';
        if (!$tripId) fail('Missing trip_id');
        ensureSharesTable();
        $stmt = db()->prepare("SELECT token, created_at FROM shares WHERE trip_id = ? ORDER BY created_at DESC");
        $stmt->execute([$tripId]);
        ok($stmt->fetchAll());

    case 'revoke_share':
        $shareToken = $_GET['token'] ?? $body['token'] ?? '';
        if (!$shareToken) fail('Missing token');
        ensureSharesTable();
        db()->prepare("DELETE FROM shares WHERE token = ?")->execute([$shareToken]);
        ok();

    // ── SHARE: LOAD A SHARED ITINERARY (PUBLIC) ──────────────────────
    case 'share_load':
        $shareToken = $_GET['token'] ?? '';
        if (!$shareToken) fail('Missing token');
        ensureSharesTable();
        $stmt = db()->prepare("SELECT trip_id FROM shares WHERE token = ?");
        $stmt->execute([$shareToken]);
        $share = $stmt->fetch();
        if (!$share) fail('This share link is no longer valid', 404);
        $stmt2 = db()->prepare("SELECT data FROM itinerary WHERE id = ?");
        $stmt2->execute([$share['trip_id']]);
        $row = $stmt2->fetch();
        if (!$row) fail('Trip not found', 404);
        $data = json_decode((string)$row['data'], true);
        if (json_last_error() !== JSON_ERROR_NONE) fail('Stored trip is invalid JSON', 500);
        ok(['data' => $data, 'trip_id' => $share['trip_id']]);

    // ── DELETE A RECORD ──────────────────────────────────────────────
    case 'delete':
        $id = $_GET['id'] ?? $body['id'] ?? '';
        if (!$id) fail('Missing id');
        db()->prepare("DELETE FROM itinerary WHERE id = ?")->execute([$id]);
        ok();

    // ── LIST ALL RECORDS ─────────────────────────────────────────────
    case 'list':
        $stmt = db()->query("SELECT id, updated_at FROM itinerary ORDER BY updated_at DESC");
        ok($stmt->fetchAll());

    // ── SETTINGS GET / SET ───────────────────────────────────────────
    case 'get_setting':
        $key = $_GET['key'] ?? '';
        if (!$key) fail('Missing key');
        $stmt = db()->prepare("SELECT `value` FROM settings WHERE `key` = ?");
        $stmt->execute([$key]);
        $row = $stmt->fetch();
        ok($row ? $row['value'] : null);

    case 'set_setting':
        $key = $body['key'] ?? '';
        $val = $body['value'] ?? '';
        if (!$key) fail('Missing key');
        db()->prepare("INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?")
            ->execute([$key, $val, $val]);
        ok();

    // ── GEOCODE ITEM ─────────────────────────────────────────────────
    case 'geocode_item':
        $PLACES_KEY_GEO = defined('PLACES_API_KEY') ? PLACES_API_KEY : '';
        if (!$PLACES_KEY_GEO) { ok(['geo' => null, 'error' => 'No Places API key']); break; }

        $place = trim($body['place'] ?? '');
        $city  = trim($body['city']  ?? '');
        if (!$place) fail('Missing place');

        $query = $city ? $place . ', ' . $city : $place;
        $geoFetch = function(string $url): array {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 8,
                CURLOPT_HTTPHEADER => ['User-Agent: MyTripsApp/1.0'],
            ]);
            $r = curl_exec($ch);
            curl_close($ch);
            return json_decode($r ?: '{}', true) ?: [];
        };

        $findUrl = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json'
            . '?input=' . urlencode($query)
            . '&inputtype=textquery'
            . '&fields=place_id,name,formatted_address,geometry,types'
            . '&key=' . $PLACES_KEY_GEO;
        $findData = $geoFetch($findUrl);
        $candidate = $findData['candidates'][0] ?? null;

        if (!$candidate || empty($candidate['geometry'])) {
            $textUrl = 'https://maps.googleapis.com/maps/api/place/textsearch/json'
                . '?query=' . urlencode($query)
                . '&key=' . $PLACES_KEY_GEO;
            $textData = $geoFetch($textUrl);
            $candidate = $textData['results'][0] ?? null;
        }

        if (!$candidate || empty($candidate['geometry']['location'])) {
            ok(['geo' => null, 'error' => 'Not found']);
        }

        $loc = $candidate['geometry']['location'];
        ok(['geo' => [
            'place_id' => $candidate['place_id'] ?? '',
            'lat' => $loc['lat'],
            'lng' => $loc['lng'],
            'name' => $candidate['name'] ?? $place,
            'address' => $candidate['formatted_address'] ?? $candidate['vicinity'] ?? '',
            'types' => array_slice($candidate['types'] ?? [], 0, 3),
            'confidence' => 'ok',
        ]]);

    // ── GENERATE ABOUT ───────────────────────────────────────────────
    case 'generate_about':
        $ANTHROPIC_KEY = defined('ANTHROPIC_API_KEY') ? ANTHROPIC_API_KEY : (getenv('ANTHROPIC_API_KEY') ?: '');
        if (!$ANTHROPIC_KEY) { ok(['about' => null, 'error' => 'No API key configured']); break; }

        $place = trim($body['place'] ?? '');
        $city  = trim($body['city']  ?? '');
        if (!$place) fail('Missing place');

        $context = $city ? $place . ', ' . $city : $place;
        $prompt = <<<PROMPT
You are a concise travel guide writer. Generate visitor information for: "{$context}"

Return ONLY valid JSON, no markdown, no preamble:
{
  "significant": "One punchy sentence on why this place matters",
  "history": ["up to 3 short bullets mixing historical facts AND practical things to look out for — keep each under 20 words"],
  "lookout": [],
  "fact": "One surprising or memorable fact",
  "wiki_search": "The exact Wikipedia article title for this place in English (e.g. 'São Bento railway station')"
}

Keep bullets short and scannable. Mix history and visitor tips together. No waffle.
PROMPT;

        $payload = json_encode([
            'model' => 'claude-sonnet-4-6',
            'max_tokens' => 700,
            'messages' => [['role' => 'user', 'content' => $prompt]],
        ]);

        $ch = curl_init('https://api.anthropic.com/v1/messages');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'x-api-key: ' . $ANTHROPIC_KEY,
                'anthropic-version: 2023-06-01',
            ],
        ]);
        $resp = curl_exec($ch);
        $curlErr = curl_error($ch);
        curl_close($ch);
        if (!$resp) fail('Anthropic API unreachable: ' . $curlErr);

        $data = json_decode($resp, true);
        $text = $data['content'][0]['text'] ?? '';
        $text = preg_replace('/^```(?:json)?\s*/m', '', $text);
        $text = preg_replace('/```\s*$/m', '', $text);
        $about = json_decode(trim($text), true);
        if (!$about) ok(['about' => null, 'raw' => substr($text, 0, 300), 'error' => 'parse_failed']);
        ok(['about' => $about]);

    // ── PLACE PHOTO V2 ───────────────────────────────────────────────
    case 'place_photo_v2':
        $PLACES_KEY = defined('PLACES_API_KEY') ? PLACES_API_KEY : '';
        $q = trim($_GET['q'] ?? '');
        $city = trim($_GET['city'] ?? '');
        if (!$q) ok(['photo' => null]);

        $fetchUrlFn = function(string $url): string {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 8,
                CURLOPT_HTTPHEADER => ['User-Agent: MyTripsApp/1.0'],
            ]);
            $r = curl_exec($ch);
            curl_close($ch);
            return $r ?: '';
        };

        $photo = null;
        if ($PLACES_KEY) {
            $findData = json_decode($fetchUrlFn('https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input='
                . urlencode($q . ($city ? ', ' . $city : '')) . '&inputtype=textquery&fields=place_id,photos&key=' . $PLACES_KEY), true);
            $photoRef = $findData['candidates'][0]['photos'][0]['photo_reference'] ?? null;
            if (!$photoRef) {
                $textData = json_decode($fetchUrlFn('https://maps.googleapis.com/maps/api/place/textsearch/json?query='
                    . urlencode($q . ($city ? ' ' . $city : '')) . '&key=' . $PLACES_KEY), true);
                $photoRef = $textData['results'][0]['photos'][0]['photo_reference'] ?? null;
            }
            if ($photoRef) {
                $photo = 'https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference='
                    . urlencode($photoRef) . '&key=' . $PLACES_KEY;
            }
        }

        if (!$photo) {
            $query = $q . ($city && strpos($q, $city) === false ? ' ' . $city : '');
            $data = json_decode($fetchUrlFn('https://commons.wikimedia.org/w/api.php?action=query'
                . '&generator=search&gsrnamespace=6&gsrsearch=' . urlencode($query)
                . '&gsrlimit=5&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=800&format=json'), true);
            $bestW = 0;
            foreach (($data['query']['pages'] ?? []) as $page) {
                $ii = $page['imageinfo'][0] ?? [];
                $mime = $ii['mime'] ?? '';
                $w = $ii['width'] ?? 0;
                $url = $ii['thumburl'] ?? '';
                if ($url && strpos($mime, 'image') === 0 && strpos($mime, 'svg') === false && $w > $bestW && $w >= 400) {
                    $photo = $url;
                    $bestW = $w;
                }
            }
        }

        if (!$photo) {
            $wData = json_decode($fetchUrlFn('https://en.wikipedia.org/w/api.php?action=query&titles='
                . urlencode($q) . '&prop=pageimages&pithumbsize=800&format=json&redirects=1'), true);
            foreach (($wData['query']['pages'] ?? []) as $page) {
                if (!empty($page['thumbnail']['source'])) {
                    $photo = $page['thumbnail']['source'];
                    break;
                }
            }
        }

        ok(['photo' => $photo]);

    // ── PLACE PHOTO (legacy alias) ───────────────────────────────────
    case 'place_photo':
        $q = trim($_GET['q'] ?? '');
        if (!$q) ok(['photo' => null]);
        $key = defined('PLACES_API_KEY') ? PLACES_API_KEY : '';
        if (!$key) ok(['photo' => null, 'error' => 'No Places API key']);

        $searchUrl = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json'
            . '?input=' . urlencode($q)
            . '&inputtype=textquery'
            . '&fields=place_id,photos'
            . '&key=' . $key;
        $searchRes = json_decode(@file_get_contents($searchUrl), true);
        $photoRef = $searchRes['candidates'][0]['photos'][0]['photo_reference'] ?? null;

        if (!$photoRef) {
            $textUrl = 'https://maps.googleapis.com/maps/api/place/textsearch/json'
                . '?query=' . urlencode($q)
                . '&key=' . $key;
            $textRes = json_decode(@file_get_contents($textUrl), true);
            $photoRef = $textRes['results'][0]['photos'][0]['photo_reference'] ?? null;
        }
        if (!$photoRef) ok(['photo' => null]);

        $photoUrl = 'https://maps.googleapis.com/maps/api/place/photo'
            . '?maxwidth=800'
            . '&photo_reference=' . urlencode($photoRef)
            . '&key=' . $key;
        $ctx = stream_context_create(['http' => ['method' => 'GET', 'follow_location' => 0, 'ignore_errors' => true]]);
        @file_get_contents($photoUrl, false, $ctx);
        $finalUrl = null;
        foreach ($http_response_header ?? [] as $hdr) {
            if (stripos($hdr, 'Location:') === 0) {
                $finalUrl = trim(substr($hdr, 9));
                break;
            }
        }
        ok(['photo' => $finalUrl ?: $photoUrl]);

    // ── PLACES AUTOCOMPLETE ──────────────────────────────────────────
    case 'places_autocomplete':
        $PLACES_KEY_AC = defined('PLACES_API_KEY') ? PLACES_API_KEY : '';
        if (!$PLACES_KEY_AC) { ok(['predictions' => [], 'error' => 'No Places API key']); break; }
        $input = trim($_GET['input'] ?? '');
        if (strlen($input) < 2) ok(['predictions' => []]);

        $acFetch = function(string $url): array {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 6,
                CURLOPT_HTTPHEADER => ['User-Agent: MyTripsApp/1.0'],
            ]);
            $r = curl_exec($ch);
            curl_close($ch);
            return json_decode($r ?: '{}', true) ?: [];
        };

        $acUrl = 'https://maps.googleapis.com/maps/api/place/autocomplete/json'
            . '?input=' . urlencode($input)
            . '&types=geocode|establishment'
            . '&key=' . $PLACES_KEY_AC;
        $acData = $acFetch($acUrl);
        $preds = array_map(fn($p) => [
            'place_id' => $p['place_id'] ?? '',
            'description' => $p['description'] ?? '',
            'main_text' => $p['structured_formatting']['main_text'] ?? ($p['description'] ?? ''),
        ], $acData['predictions'] ?? []);
        ok(['predictions' => array_slice($preds, 0, 6)]);

    // ── PLACE DETAILS ────────────────────────────────────────────────
    case 'places_details':
        $PLACES_KEY_PD = defined('PLACES_API_KEY') ? PLACES_API_KEY : '';
        if (!$PLACES_KEY_PD) { ok(['place' => null, 'error' => 'No Places API key']); break; }
        $placeId = trim($_GET['place_id'] ?? '');
        if (!$placeId) fail('Missing place_id');

        $pdFetch = function(string $url): array {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 6,
                CURLOPT_HTTPHEADER => ['User-Agent: MyTripsApp/1.0'],
            ]);
            $r = curl_exec($ch);
            curl_close($ch);
            return json_decode($r ?: '{}', true) ?: [];
        };

        $pdUrl = 'https://maps.googleapis.com/maps/api/place/details/json'
            . '?place_id=' . urlencode($placeId)
            . '&fields=geometry,formatted_address,name'
            . '&key=' . $PLACES_KEY_PD;
        $pdData = $pdFetch($pdUrl);
        $res = $pdData['result'] ?? null;
        if (!$res || empty($res['geometry']['location'])) ok(['place' => null]);
        $loc = $res['geometry']['location'];
        ok(['place' => [
            'place_id' => $placeId,
            'name' => $res['name'] ?? '',
            'address' => $res['formatted_address'] ?? '',
            'lat' => $loc['lat'],
            'lng' => $loc['lng'],
        ]]);

    // ── ROUTES: COMPUTE DRIVING ROUTE ────────────────────────────────
    case 'routes_compute':
        $ROUTES_KEY = defined('PLACES_API_KEY') ? PLACES_API_KEY : '';
        if (!$ROUTES_KEY) fail('No Routes API key configured');

        $toWaypoint = function(?array $p) {
            if (!$p) return null;
            if (!empty($p['placeId'])) return ['placeId' => $p['placeId']];
            if (isset($p['lat'], $p['lng'])) {
                return ['location' => ['latLng' => ['latitude' => $p['lat'], 'longitude' => $p['lng']]]];
            }
            return null;
        };

        $origin = $toWaypoint($body['origin'] ?? null);
        $destination = $toWaypoint($body['destination'] ?? null);
        if (!$origin || !$destination) fail('Missing origin or destination');
        $intermediates = array_values(array_filter(array_map($toWaypoint, $body['waypoints'] ?? [])));

        $payload = json_encode([
            'origin' => $origin,
            'destination' => $destination,
            'intermediates' => $intermediates,
            'travelMode' => 'DRIVE',
            'routingPreference' => 'TRAFFIC_UNAWARE',
            'polylineQuality' => 'OVERVIEW',
            'units' => 'IMPERIAL',
        ]);

        $ch = curl_init('https://routes.googleapis.com/directions/v2:computeRoutes');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'X-Goog-Api-Key: ' . $ROUTES_KEY,
                'X-Goog-FieldMask: routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.distanceMeters',
            ],
        ]);
        $resp = curl_exec($ch);
        $curlErr = curl_error($ch);
        curl_close($ch);
        if (!$resp) fail('Routes API unreachable: ' . $curlErr);

        $data = json_decode($resp, true);
        $route = $data['routes'][0] ?? null;
        if (!$route) {
            $msg = $data['error']['message'] ?? 'No route found';
            ok(['route' => null, 'error' => $msg]);
        }

        $legs = array_map(fn($l) => [
            'distanceMeters' => $l['distanceMeters'] ?? 0,
            'durationSeconds' => (int)rtrim($l['duration'] ?? '0s', 's'),
        ], $route['legs'] ?? []);

        ok(['route' => [
            'distanceMeters' => $route['distanceMeters'] ?? 0,
            'durationSeconds' => (int)rtrim($route['duration'] ?? '0s', 's'),
            'polyline' => $route['polyline']['encodedPolyline'] ?? '',
            'legs' => $legs,
        ]]);

    default:
        fail('Unknown action');
}

// ── HELPERS ───────────────────────────────────────────────────────────
function ensureSharesTable(): void {
    static $done = false;
    if ($done) return;
    db()->exec("CREATE TABLE IF NOT EXISTS shares (
        token VARCHAR(40) PRIMARY KEY,
        trip_id VARCHAR(255) NOT NULL,
        show_refs TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    try {
        $cols = db()->query("SHOW COLUMNS FROM shares LIKE 'show_refs'")->fetchAll();
        if (!$cols) {
            db()->exec("ALTER TABLE shares ADD COLUMN show_refs TINYINT(1) NOT NULL DEFAULT 0");
        }
    } catch (Throwable $e) { /* best effort */ }
    $done = true;
}
