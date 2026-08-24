<?php
// ══════════════════════════════════════════════════════════════════════
// MY TRIPS — API
// ══════════════════════════════════════════════════════════════════════
require_once __DIR__ . '/db-config.php'; // DB_HOST/DB_NAME/DB_USER/DB_PASS/PUBLIC_HTML + db()

// PIN hash — SHA-256 of your PIN. Default is 0103.
// To change: php -r "echo hash('sha256', 'YOURPIN');"
define('PIN_HASH', '06843e3f58776ec2eb5e0cc7a44a3c3fc1b4b9af2e75504da3d299dc566cc395');

// ══════════════════════════════════════════════════════════════════════
//  NO CHANGES NEEDED BELOW THIS LINE
// ══════════════════════════════════════════════════════════════════════

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Auth-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

// ── AUTH CHECK ────────────────────────────────────────────────────────
// Every request (except /auth) must include a valid session token header
$action = $_GET['action'] ?? '';

if ($action !== 'auth' && $action !== 'share_load') {
    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    if ($token !== getActivePinHash()) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorised']);
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
    $body = json_decode($raw, true) ?? [];
}

// ══════════════════════════════════════════════════════════════════════
//  ACTIONS
// ══════════════════════════════════════════════════════════════════════

switch ($action) {

    // ── VERIFY PIN ───────────────────────────────────────────────────
    // POST /api.php?action=auth  { "pin_hash": "sha256hex" }
    case 'auth':
        $submitted = $body['pin_hash'] ?? '';
        // Also allow changing the PIN — only if old hash matches
        if (isset($body['new_hash'])) {
            if ($submitted !== PIN_HASH) fail('Wrong current PIN', 401);
            // Store new hash in settings table
            $pdo = db();
            $pdo->prepare("INSERT INTO settings (`key`, `value`) VALUES ('pin_hash', ?) ON DUPLICATE KEY UPDATE `value` = ?")
                ->execute([$body['new_hash'], $body['new_hash']]);
            ok(['changed' => true]);
        }
        if ($submitted === getActivePinHash()) {
            ok(['token' => getActivePinHash()]);
        }
        fail('Incorrect PIN', 401);

    // ── GET ACTIVE PIN HASH (for client to validate session) ─────────
    case 'pin_hash':
        ok(['hash' => getActivePinHash()]);

    // ── LOAD A RECORD ────────────────────────────────────────────────
    // GET /api.php?action=load&id=china-2026
    case 'load':
        $id = $_GET['id'] ?? '';
        if (!$id) fail('Missing id');
        $stmt = db()->prepare("SELECT data, updated_at FROM itinerary WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) ok(null);
        ok(['data' => json_decode($row['data'], true), 'updated_at' => $row['updated_at']]);

    // ── SAVE A RECORD ────────────────────────────────────────────────
    // POST /api.php?action=save  { "id": "...", "data": {...} }
    case 'save':
        $id   = $body['id']   ?? '';
        $data = $body['data'] ?? null;
        if (!$id || $data === null) fail('Missing id or data');
        $json = json_encode($data);
        db()->prepare("INSERT INTO itinerary (id, data, updated_at) VALUES (?, ?, NOW())
                       ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()")
            ->execute([$id, $json]);
        ok(['id' => $id]);

    // ── CREATE TRIP PAGE ─────────────────────────────────────────────
    // POST /api.php?action=create_page  { "slug": "porto-2026", "dest": "Porto", "dep": "...", "ret": "..." }
    case 'create_page':
        $slug   = preg_replace('/[^a-z0-9\-]/', '', strtolower($body['slug'] ?? ''));
        $dest   = $body['dest'] ?? '';
        $dep    = $body['dep']  ?? '';
        $ret    = $body['ret']  ?? '';
        $trav   = $body['trav'] ?? '2';
        $status = $body['status'] ?? 'upcoming';
        $photo  = $body['photo'] ?? '';
        if (!$slug || !$dest) fail('Missing slug or dest');

        // Reserved paths that must never be shadowed by a dynamic trip slug
    $reserved = ['index', 'settings', 'new-trip', 'new-trip-v2', 'budget-template',
    'api', 'deploy-webhook', 'trip', 'db-config', 'robots', 'favicon',
    'trips', 'holidays', 'icons', 'concerts', 'parks', 'shows', 'private'];
if (in_array($slug, $reserved, true)) fail('That trip name is reserved — please choose another');

// v2 trips are no longer baked to a static file. trip.php renders the
// page fresh on every request straight from new-trip-v2.html + this
// trip's saved data, so future template edits reach every trip
// (old and new) automatically — no regeneration step required.

// If a cover photo was supplied at creation time, seed a full initial
// record now so the trip's own page shows it immediately. new-trip-v2.html's
// loadData() only treats a saved record as "existing" when it already has
// a `days` array — otherwise it discards any partial seed and falls back
// to defaults, so we must write a complete, valid record here.
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
    $seedJson = json_encode($seed);
    db()->prepare("INSERT INTO itinerary (id, data, updated_at) VALUES (?, ?, NOW())
                   ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()")
        ->execute([$slug, $seedJson]);
}

ok(['slug' => $slug, 'url' => '/' . $slug]);

    // ── SHARE: CREATE A SHARE LINK (owner only) ────────────────────────
    // Every share link grants full, unrestricted read access to the trip
    // (no booking-refs toggle) — the link itself is the only access
    // control, and revoking it is the only way to cut it off.
    // POST /api.php?action=create_share  { "trip_id": "gothenburg-2026" }
    case 'create_share':
        $tripId = $body['trip_id'] ?? '';
        if (!$tripId) fail('Missing trip_id');
        ensureSharesTable();
        $token = bin2hex(random_bytes(12));
        db()->prepare("INSERT INTO shares (token, trip_id, created_at) VALUES (?, ?, NOW())")
            ->execute([$token, $tripId]);
        ok(['token' => $token]);

    // ── SHARE: LIST ACTIVE SHARE LINKS FOR A TRIP (owner only) ─────────
    // GET /api.php?action=list_shares&trip_id=...
    case 'list_shares':
        $tripId = $_GET['trip_id'] ?? '';
        if (!$tripId) fail('Missing trip_id');
        ensureSharesTable();
        $stmt = db()->prepare("SELECT token, created_at FROM shares WHERE trip_id = ? ORDER BY created_at DESC");
        $stmt->execute([$tripId]);
        ok($stmt->fetchAll());

    // ── SHARE: REVOKE A SHARE LINK (owner only) ─────────────────────────
    // DELETE /api.php?action=revoke_share&token=...
    case 'revoke_share':
        $token = $_GET['token'] ?? $body['token'] ?? '';
        if (!$token) fail('Missing token');
        ensureSharesTable();
        db()->prepare("DELETE FROM shares WHERE token = ?")->execute([$token]);
        ok();

    // ── SHARE: LOAD A SHARED ITINERARY (PUBLIC — no PIN required) ──────
    // Returns the trip's full data, unmodified — a share link grants
    // complete read access (every tab, every detail). The link itself,
    // and revoking it, are the only access controls.
    // GET /api.php?action=share_load&token=...
    case 'share_load':
        $token = $_GET['token'] ?? '';
        if (!$token) fail('Missing token');
        ensureSharesTable();
        $stmt = db()->prepare("SELECT trip_id FROM shares WHERE token = ?");
        $stmt->execute([$token]);
        $share = $stmt->fetch();
        if (!$share) fail('This share link is no longer valid', 404);
        $stmt2 = db()->prepare("SELECT data FROM itinerary WHERE id = ?");
        $stmt2->execute([$share['trip_id']]);
        $row = $stmt2->fetch();
        if (!$row) fail('Trip not found', 404);
        $data = json_decode($row['data'], true);
        ok(['data' => $data, 'trip_id' => $share['trip_id']]);

    // ── DELETE A RECORD ──────────────────────────────────────────────
    // DELETE /api.php?action=delete&id=...
    case 'delete':
        $id = $_GET['id'] ?? $body['id'] ?? '';
        if (!$id) fail('Missing id');
        db()->prepare("DELETE FROM itinerary WHERE id = ?")->execute([$id]);
        ok();

    // ── LIST ALL RECORDS (for trip registry) ─────────────────────────
    // GET /api.php?action=list
    case 'list':
        $stmt = db()->query("SELECT id, updated_at FROM itinerary ORDER BY updated_at DESC");
        ok($stmt->fetchAll());

    // ── SNAPSHOT COMMENT ──────────────────────────────────────────────
    // Snapshots use the regular save/load actions with id=RECORD_ID+'-snapshots'.
    // No extra API actions needed — the JS manages the list client-side.

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

    // ── WRITE SECRET (one-time setup, auth-gated) ───────────────────
    case 'write_secret':
        $k = $body['k'] ?? ''; $v = $body['v'] ?? '';
        if (!$k || !$v) fail('Missing k or v');
        // Only allow writing ANTHROPIC_API_KEY
        if (!in_array($k, ['ANTHROPIC_API_KEY','PLACES_API_KEY'])) fail('Unknown key');
        // Read existing secrets and update/add the key
        $secrets = [];
        $existing = @file_get_contents(__DIR__ . '/secrets.php');
        if ($existing && preg_match_all("/define\('([^']+)',\s*'([^']+)'\)/", $existing, $m, PREG_SET_ORDER)) {
            foreach ($m as $row) $secrets[$row[1]] = $row[2];
        }
        $secrets[$k] = $v;
        $php = "<?php
";
        foreach ($secrets as $sk => $sv) $php .= "define('" . $sk . "', " . var_export($sv, true) . ");
";
        file_put_contents(__DIR__ . '/secrets.php', $php);
        ok(['written' => true, 'keys' => array_keys($secrets)]);

    // ── WRITE FILE (emergency deploy helper) ────────────────────────────
    case 'write_file':
        $allowed = ['deploy-webhook.php', 'itinerary-v2-style.css', 'new-trip-v2.html'];
        $fname = $body['file'] ?? '';
        if (!in_array($fname, $allowed)) fail('Not allowed');
        $content = base64_decode($body['content'] ?? '');
        if (!$content) fail('Empty content');
        if (file_put_contents(__DIR__ . '/' . $fname, $content) === false) fail('Write failed');
        ok(['written' => $fname]);
        break;

    // ── GEOCODE ITEM ─────────────────────────────────────────────────
    // POST /api.php?action=geocode_item  { "place": "Title", "city": "Porto" }
    // Returns { geo: { place_id, lat, lng, name, address, types, confidence } }
    case 'geocode_item':
        $PLACES_KEY_GEO = defined('PLACES_API_KEY') ? PLACES_API_KEY : '';
        if (!$PLACES_KEY_GEO) { ok(['geo' => null, 'error' => 'No Places API key']); break; }

        $place = trim($body['place'] ?? '');
        $city  = trim($body['city']  ?? '');
        if (!$place) fail('Missing place');

        $query = $city ? $place . ', ' . $city : $place;

        $geoFetch = function(string $url): array {
            $ch = curl_init($url);
            curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_TIMEOUT=>8,
                CURLOPT_HTTPHEADER=>['User-Agent: MyTripsApp/1.0']]);
            $r = curl_exec($ch); curl_close($ch);
            return json_decode($r ?: '{}', true) ?: [];
        };

        // Try findplacefromtext first (most accurate)
        $findUrl = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json'
            . '?input=' . urlencode($query)
            . '&inputtype=textquery'
            . '&fields=place_id,name,formatted_address,geometry,types'
            . '&key=' . $PLACES_KEY_GEO;
        $findData = $geoFetch($findUrl);
        $candidate = $findData['candidates'][0] ?? null;

        if (!$candidate || empty($candidate['geometry'])) {
            // Fallback: textsearch
            $textUrl = 'https://maps.googleapis.com/maps/api/place/textsearch/json'
                . '?query=' . urlencode($query)
                . '&key=' . $PLACES_KEY_GEO;
            $textData = $geoFetch($textUrl);
            $candidate = $textData['results'][0] ?? null;
        }

        if (!$candidate || empty($candidate['geometry']['location'])) {
            ok(['geo' => null, 'error' => 'Not found']);
            break;
        }

        $loc = $candidate['geometry']['location'];
        ok(['geo' => [
            'place_id'  => $candidate['place_id'] ?? '',
            'lat'       => $loc['lat'],
            'lng'       => $loc['lng'],
            'name'      => $candidate['name'] ?? $place,
            'address'   => $candidate['formatted_address'] ?? $candidate['vicinity'] ?? '',
            'types'     => array_slice($candidate['types'] ?? [], 0, 3),
            'confidence'=> 'ok',
        ]]);
        break;

    // ── GENERATE ABOUT ───────────────────────────────────────────────
    // POST /api.php?action=generate_about  { "place": "São Bento Station", "city": "Porto" }
    // Returns { about: { significant, history[], lookout[], fact } }
    case 'generate_about':
        $ANTHROPIC_KEY = defined('ANTHROPIC_API_KEY') ? ANTHROPIC_API_KEY : (getenv('ANTHROPIC_API_KEY') ?: '');
        $PLACES_KEY    = defined('PLACES_API_KEY')    ? PLACES_API_KEY    : (getenv('PLACES_API_KEY')    ?: '');
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
            'model'      => 'claude-sonnet-4-6',
            'max_tokens' => 700,
            'messages'   => [['role' => 'user', 'content' => $prompt]],
        ]);

        $ch = curl_init('https://api.anthropic.com/v1/messages');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'x-api-key: ' . $ANTHROPIC_KEY,
                'anthropic-version: 2023-06-01',
            ],
        ]);
        $resp    = curl_exec($ch);
        $curlErr = curl_error($ch);
        curl_close($ch);
        if (!$resp) fail('Anthropic API unreachable: ' . $curlErr);

        $data  = json_decode($resp, true);
        $text  = $data['content'][0]['text'] ?? '';
        $text  = preg_replace('/^```(?:json)?\s*/m', '', $text);
        $text  = preg_replace('/```\s*$/m', '', $text);
        $about = json_decode(trim($text), true);
        if (!$about) { ok(['about' => null, 'raw' => substr($text,0,300), 'error' => 'parse_failed']); break; }

        // Photo is fetched separately via place_photo_v2 to avoid timeout
        ok(['about' => $about]);

        // ── PLACE PHOTO V2 — full cascade (called separately from client) ───
    // GET /api.php?action=place_photo_v2&q=Place+Name&city=City
    case 'place_photo_v2':
        $PLACES_KEY = defined('PLACES_API_KEY') ? PLACES_API_KEY : '';
        $q    = trim($_GET['q']    ?? '');
        $city = trim($_GET['city'] ?? '');
        if (!$q) ok(['photo' => null]);

        $fetchUrlFn = function(string $url): string {
            $ch = curl_init($url);
            curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_TIMEOUT=>8,
                CURLOPT_HTTPHEADER=>['User-Agent: MyTripsApp/1.0']]);
            $r = curl_exec($ch); curl_close($ch); return $r ?: '';
        };

        $photo = null;

        // 1. Google Places
        if (!$photo && $PLACES_KEY) {
            $findData = json_decode($fetchUrlFn('https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input='
                .urlencode($q.($city?', '.$city:'')).'&inputtype=textquery&fields=place_id,photos&key='.$PLACES_KEY), true);
            $photoRef = $findData['candidates'][0]['photos'][0]['photo_reference'] ?? null;
            if (!$photoRef) {
                $textData = json_decode($fetchUrlFn('https://maps.googleapis.com/maps/api/place/textsearch/json?query='
                    .urlencode($q.($city?' '.$city:'')).'&key='.$PLACES_KEY), true);
                $photoRef = $textData['results'][0]['photos'][0]['photo_reference'] ?? null;
            }
            if ($photoRef) {
                $photo = 'https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference='
                    .urlencode($photoRef).'&key='.$PLACES_KEY;
            }
        }

        // 2. Wikimedia Commons keyword search
        if (!$photo) {
            $query = $q.($city && strpos($q,$city)===false?' '.$city:'');
            $data  = json_decode($fetchUrlFn('https://commons.wikimedia.org/w/api.php?action=query'
                .'&generator=search&gsrnamespace=6&gsrsearch='.urlencode($query)
                .'&gsrlimit=5&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=800&format=json'), true);
            $bestW = 0;
            foreach (($data['query']['pages'] ?? []) as $page) {
                $ii=$page['imageinfo'][0]??[]; $mime=$ii['mime']??''; $w=$ii['width']??0; $url=$ii['thumburl']??'';
                if ($url && strpos($mime,'image')===0 && strpos($mime,'svg')===false && $w>$bestW && $w>=400) {
                    $photo=$url; $bestW=$w;
                }
            }
        }

        // 3. Wikipedia page thumbnail
        if (!$photo) {
            $wData = json_decode($fetchUrlFn('https://en.wikipedia.org/w/api.php?action=query&titles='
                .urlencode($q).'&prop=pageimages&pithumbsize=800&format=json&redirects=1'), true);
            foreach (($wData['query']['pages'] ?? []) as $page) {
                if (!empty($page['thumbnail']['source'])) { $photo=$page['thumbnail']['source']; break; }
            }
        }

        ok(['photo' => $photo]);

    // ── PLACE PHOTO ─────────────────────────────────────────────────
    // GET /api.php?action=place_photo&q=Hotel+Name
    case 'place_photo':
        $q = trim($_GET['q'] ?? '');
        if (!$q) ok(['photo' => null]);
        $key = 'AIzaSyCHugrVDRAxQqa7Sd45KICrLMWRoJmR7U8';

        // Step 1: find photo_reference via findplacefromtext
        $searchUrl = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json'
            . '?input=' . urlencode($q)
            . '&inputtype=textquery'
            . '&fields=place_id,photos'
            . '&key=' . $key;
        $searchRes = json_decode(@file_get_contents($searchUrl), true);
        $photoRef  = $searchRes['candidates'][0]['photos'][0]['photo_reference'] ?? null;

        if (!$photoRef) {
            // Fallback: textsearch
            $textUrl  = 'https://maps.googleapis.com/maps/api/place/textsearch/json'
                . '?query=' . urlencode($q)
                . '&key=' . $key;
            $textRes  = json_decode(@file_get_contents($textUrl), true);
            $photoRef = $textRes['results'][0]['photos'][0]['photo_reference'] ?? null;
        }

        if (!$photoRef) { ok(['photo' => null]); }

        // Step 2: resolve photo reference — follow redirect to get CDN URL
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

    // ── PLACES AUTOCOMPLETE (Car Hire / Road Trip) ──────────────────────
    // GET /api.php?action=places_autocomplete&input=Edinbu
    // Returns { predictions: [{ place_id, description }] }
    case 'places_autocomplete':
        $PLACES_KEY_AC = defined('PLACES_API_KEY') ? PLACES_API_KEY : '';
        if (!$PLACES_KEY_AC) { ok(['predictions' => [], 'error' => 'No Places API key']); break; }
        $input = trim($_GET['input'] ?? '');
        if (strlen($input) < 2) ok(['predictions' => []]);

        $acFetch = function(string $url): array {
            $ch = curl_init($url);
            curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_TIMEOUT=>6,
                CURLOPT_HTTPHEADER=>['User-Agent: MyTripsApp/1.0']]);
            $r = curl_exec($ch); curl_close($ch);
            return json_decode($r ?: '{}', true) ?: [];
        };

        $acUrl = 'https://maps.googleapis.com/maps/api/place/autocomplete/json'
            . '?input=' . urlencode($input)
            . '&types=geocode|establishment'
            . '&key=' . $PLACES_KEY_AC;
        $acData = $acFetch($acUrl);
        $preds = array_map(fn($p) => [
            'place_id'    => $p['place_id'] ?? '',
            'description' => $p['description'] ?? '',
            // Google's short primary label (e.g. "Hertz Car Rental - Larnaca Airport")
            // vs the full description (e.g. "...Larnaka International Airport (LCA),
            // Arrivals, Larnaca, Cyprus") — used once a suggestion is picked, so
            // saved journeys/locations don't carry the whole verbose address.
            'main_text'   => $p['structured_formatting']['main_text'] ?? ($p['description'] ?? ''),
        ], $acData['predictions'] ?? []);
        ok(['predictions' => array_slice($preds, 0, 6)]);

    // ── PLACE DETAILS (resolve place_id → lat/lng) ──────────────────────
    // GET /api.php?action=places_details&place_id=ChIJ...
    case 'places_details':
        $PLACES_KEY_PD = defined('PLACES_API_KEY') ? PLACES_API_KEY : '';
        if (!$PLACES_KEY_PD) { ok(['place' => null, 'error' => 'No Places API key']); break; }
        $placeId = trim($_GET['place_id'] ?? '');
        if (!$placeId) fail('Missing place_id');

        $pdFetch = function(string $url): array {
            $ch = curl_init($url);
            curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_TIMEOUT=>6,
                CURLOPT_HTTPHEADER=>['User-Agent: MyTripsApp/1.0']]);
            $r = curl_exec($ch); curl_close($ch);
            return json_decode($r ?: '{}', true) ?: [];
        };

        $pdUrl = 'https://maps.googleapis.com/maps/api/place/details/json'
            . '?place_id=' . urlencode($placeId)
            . '&fields=geometry,formatted_address,name'
            . '&key=' . $PLACES_KEY_PD;
        $pdData = $pdFetch($pdUrl);
        $res = $pdData['result'] ?? null;
        if (!$res || empty($res['geometry']['location'])) { ok(['place' => null]); break; }
        $loc = $res['geometry']['location'];
        ok(['place' => [
            'place_id' => $placeId,
            'name'     => $res['name'] ?? '',
            'address'  => $res['formatted_address'] ?? '',
            'lat'      => $loc['lat'],
            'lng'      => $loc['lng'],
        ]]);

    // ── ROUTES: COMPUTE DRIVING ROUTE (Car Hire / Road Trip) ────────────
    // POST /api.php?action=routes_compute
    // { "origin": {"placeId":"..."} | {"lat":..,"lng":..},
    //   "destination": {...}, "waypoints": [ {...}, ... ] }
    // Returns { distanceMeters, durationSeconds, polyline,
    //           legs: [{ distanceMeters, durationSeconds }] }
    case 'routes_compute':
        $ROUTES_KEY = defined('PLACES_API_KEY') ? PLACES_API_KEY : '';
        if (!$ROUTES_KEY) fail('No Routes API key configured');

        $toWaypoint = function(?array $p) {
            if (!$p) return null;
            if (!empty($p['placeId'])) return ['placeId' => $p['placeId']];
            if (isset($p['lat'], $p['lng'])) return ['location' => ['latLng' => ['latitude' => $p['lat'], 'longitude' => $p['lng']]]];
            return null;
        };

        $origin      = $toWaypoint($body['origin']      ?? null);
        $destination = $toWaypoint($body['destination']  ?? null);
        if (!$origin || !$destination) fail('Missing origin or destination');

        $intermediates = array_values(array_filter(array_map($toWaypoint, $body['waypoints'] ?? [])));

        $payload = json_encode([
            'origin'          => $origin,
            'destination'     => $destination,
            'intermediates'   => $intermediates,
            'travelMode'      => 'DRIVE',
            'routingPreference' => 'TRAFFIC_UNAWARE',
            'polylineQuality' => 'OVERVIEW',
            'units'           => 'IMPERIAL',
        ]);

        $ch = curl_init('https://routes.googleapis.com/directions/v2:computeRoutes');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'X-Goog-Api-Key: ' . $ROUTES_KEY,
                'X-Goog-FieldMask: routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.distanceMeters',
            ],
        ]);
        $resp    = curl_exec($ch);
        $curlErr = curl_error($ch);
        curl_close($ch);
        if (!$resp) fail('Routes API unreachable: ' . $curlErr);

        $data  = json_decode($resp, true);
        $route = $data['routes'][0] ?? null;
        if (!$route) {
            // Surface Google's own error message when present — makes it
            // obvious in the UI when the Routes API just isn't enabled yet.
            $msg = $data['error']['message'] ?? 'No route found';
            ok(['route' => null, 'error' => $msg]);
            break;
        }

        $legs = array_map(fn($l) => [
            'distanceMeters' => $l['distanceMeters'] ?? 0,
            'durationSeconds' => (int)rtrim($l['duration'] ?? '0s', 's'),
        ], $route['legs'] ?? []);

        ok(['route' => [
            'distanceMeters'  => $route['distanceMeters'] ?? 0,
            'durationSeconds' => (int)rtrim($route['duration'] ?? '0s', 's'),
            'polyline'        => $route['polyline']['encodedPolyline'] ?? '',
            'legs'            => $legs,
        ]]);

    default:
        fail('Unknown action');
}

// ── HELPERS ───────────────────────────────────────────────────────────
function getActivePinHash(): string {
    try {
        $stmt = db()->prepare("SELECT `value` FROM settings WHERE `key` = 'pin_hash'");
        $stmt->execute();
        $row = $stmt->fetch();
        return $row ? $row['value'] : PIN_HASH;
    } catch (\Exception $e) {
        return PIN_HASH;
    }
}

function ensureSharesTable(): void {
    static $done = false;
    if ($done) return;
    db()->exec("CREATE TABLE IF NOT EXISTS shares (
        token VARCHAR(40) PRIMARY KEY,
        trip_id VARCHAR(255) NOT NULL,
        show_refs TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    // Migrate older installs that created the table before show_refs existed.
    try {
        $cols = db()->query("SHOW COLUMNS FROM shares LIKE 'show_refs'")->fetchAll();
        if (!$cols) {
            db()->exec("ALTER TABLE shares ADD COLUMN show_refs TINYINT(1) NOT NULL DEFAULT 0");
        }
    } catch (Exception $e) { /* best effort */ }
    $done = true;
}

// Recursively blanks booking-reference fields ('ref', 'ch_ref') anywhere
// in the itinerary data tree before it's returned to a public share link.
function stripBookingRefs(mixed $data): mixed {
    if (!is_array($data)) return $data;
    foreach ($data as $k => $v) {
        if ($k === 'ref' || $k === 'ch_ref') {
            $data[$k] = '';
        } elseif (is_array($v)) {
            $data[$k] = stripBookingRefs($v);
        }
    }
    return $data;
}
