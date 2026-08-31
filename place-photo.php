<?php
// MY TRIPS — safe place-photo lookup
// Returns only a final public image URL. The server-side Google Places key is
// never included in JSON sent to the browser.
require_once __DIR__ . '/db-config.php';
require_once __DIR__ . '/auth-session.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');

function photoOk(?string $url): never {
    echo json_encode(['ok' => true, 'data' => ['photo' => $url]], JSON_UNESCAPED_SLASHES);
    exit;
}

function photoFail(string $message, int $status = 400): never {
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $message]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') photoFail('GET required', 405);
$token = (string)($_SERVER['HTTP_X_AUTH_TOKEN'] ?? '');
if (!isAuthorizedToken($token, false)) photoFail('Unauthorised', 401);

$q = trim((string)($_GET['q'] ?? ''));
$city = trim((string)($_GET['city'] ?? ''));
$placeId = trim((string)($_GET['place_id'] ?? ''));
if ($q === '' && $placeId === '') photoOk(null);
if (mb_strlen($q) > 180 || mb_strlen($city) > 120 || mb_strlen($placeId) > 255) photoFail('Search text is too long');
if ($placeId !== '' && !preg_match('/^[A-Za-z0-9._:-]{5,255}$/', $placeId)) photoFail('Invalid place ID');

function fetchText(string $url, int $timeout = 8): string {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_HTTPHEADER => ['User-Agent: MyTripsApp/1.0'],
    ]);
    $body = curl_exec($ch);
    curl_close($ch);
    return is_string($body) ? $body : '';
}

function googlePhotoRedirect(string $photoRef, string $key): ?string {
    $url = 'https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=' . rawurlencode($photoRef) . '&key=' . rawurlencode($key);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_CONNECTTIMEOUT => 4,
    ]);
    $response = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $headerSize = (int)curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    if (!is_string($response) || $status < 300 || $status >= 400) return null;

    $headers = substr($response, 0, $headerSize);
    if (!preg_match('/^Location:\s*(https:\/\/[^\r\n]+)$/mi', $headers, $m)) return null;
    $location = trim($m[1]);
    // Never return a URL that still contains the secret key, even if Google's
    // redirect behaviour changes in future.
    if (str_contains($location, $key) || str_contains($location, 'key=')) return null;
    return $location;
}

$key = optionalConfigValue('PLACES_API_KEY') ?: '';
$query = $q . ($city !== '' ? ', ' . $city : '');

// When the browser already knows the exact Google Place ID (for example after
// selecting a restaurant from autocomplete), use Place Details first. This avoids
// fuzzy text search choosing a similarly named venue or failing on a new entry.
if ($key !== '' && $placeId !== '') {
    $detailsUrl = 'https://maps.googleapis.com/maps/api/place/details/json?place_id=' . rawurlencode($placeId)
        . '&fields=photos&key=' . rawurlencode($key);
    $details = json_decode(fetchText($detailsUrl), true);
    $photoRef = is_array($details) ? ($details['result']['photos'][0]['photo_reference'] ?? null) : null;
    if (is_string($photoRef) && $photoRef !== '') {
        $publicUrl = googlePhotoRedirect($photoRef, $key);
        if ($publicUrl !== null) photoOk($publicUrl);
    }
}

// Keep the established text-based search as a fallback for existing restaurants
// that were saved before Place IDs were recorded.
if ($key !== '' && $q !== '') {
    $findUrl = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=' . rawurlencode($query)
        . '&inputtype=textquery&fields=place_id,photos&key=' . rawurlencode($key);
    $find = json_decode(fetchText($findUrl), true);
    $photoRef = is_array($find) ? ($find['candidates'][0]['photos'][0]['photo_reference'] ?? null) : null;

    if (!$photoRef) {
        $textUrl = 'https://maps.googleapis.com/maps/api/place/textsearch/json?query=' . rawurlencode($query)
            . '&key=' . rawurlencode($key);
        $text = json_decode(fetchText($textUrl), true);
        $photoRef = is_array($text) ? ($text['results'][0]['photos'][0]['photo_reference'] ?? null) : null;
    }

    if (is_string($photoRef) && $photoRef !== '') {
        $publicUrl = googlePhotoRedirect($photoRef, $key);
        if ($publicUrl !== null) photoOk($publicUrl);
    }
}

if ($q === '') photoOk(null);

// Wikimedia Commons fallback.
$commonsUrl = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=' . rawurlencode($query)
    . '&gsrlimit=5&prop=imageinfo&iiprop=url%7Csize%7Cmime&iiurlwidth=800&format=json';
$commons = json_decode(fetchText($commonsUrl), true);
$bestUrl = null;
$bestWidth = 0;
foreach (($commons['query']['pages'] ?? []) as $page) {
    $ii = $page['imageinfo'][0] ?? [];
    $mime = (string)($ii['mime'] ?? '');
    $width = (int)($ii['width'] ?? 0);
    $url = (string)($ii['thumburl'] ?? '');
    if ($url !== '' && str_starts_with($mime, 'image') && !str_contains($mime, 'svg') && $width >= 400 && $width > $bestWidth) {
        $bestUrl = $url;
        $bestWidth = $width;
    }
}
if ($bestUrl !== null) photoOk($bestUrl);

// Wikipedia thumbnail fallback.
$wikiUrl = 'https://en.wikipedia.org/w/api.php?action=query&titles=' . rawurlencode($q)
    . '&prop=pageimages&pithumbsize=800&format=json&redirects=1';
$wiki = json_decode(fetchText($wikiUrl), true);
foreach (($wiki['query']['pages'] ?? []) as $page) {
    $url = $page['thumbnail']['source'] ?? null;
    if (is_string($url) && $url !== '') photoOk($url);
}

photoOk(null);
