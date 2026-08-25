<?php
// ══════════════════════════════════════════════════════════════════════
// MY TRIPS — Single dynamic itinerary renderer
//
// EVERY itinerary uses this renderer and therefore the same
// new-trip-v2.html template. The Itinerary, Bookings, Map and Budget tabs
// are all part of that one shared template, so a template change applies
// to every trip automatically.
// ══════════════════════════════════════════════════════════════════════
require_once __DIR__ . '/db-config.php';

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');

$slug = preg_replace('/[^a-z0-9\-]/', '', strtolower($_GET['slug'] ?? ''));
if (!$slug) {
  http_response_code(404);
  echo 'Trip not found.';
  exit;
}

// Legacy metadata fallback. The DB registry remains the source of truth,
// but this keeps older trips renderable if they pre-date the registry.
$legacyTrips = [
  'china-2026' => [
    'slug' => 'china-2026', 'dest' => 'China',
    'dep' => '31/03/2026', 'ret' => '17/04/2026', 'trav' => '2', 'status' => 'past'
  ],
  'dubai-2025' => [
    'slug' => 'dubai-2025', 'dest' => 'Dubai & Abu Dhabi',
    'dep' => '26/12/2025', 'ret' => '09/01/2026', 'trav' => '2', 'status' => 'past'
  ],
  'costa-rica-2025' => [
    'slug' => 'costa-rica-2025', 'dest' => 'Costa Rica',
    'dep' => '04/04/2025', 'ret' => '21/04/2025', 'trav' => '2', 'status' => 'past'
  ],
  'canada-2027' => [
    'slug' => 'canada-2027', 'dest' => 'Canada Road Trip',
    'dep' => '25/09/2027', 'ret' => '10/10/2027', 'trav' => '2', 'status' => 'upcoming'
  ],
  'hk-taiwan-2027' => [
    'slug' => 'hk-taiwan-2027', 'dest' => 'Hong Kong & Taiwan',
    'dep' => '27/03/2027', 'ret' => '12/04/2027', 'trav' => '2', 'status' => 'planning'
  ],
  'porto-2026' => [
    'slug' => 'porto-2026', 'dest' => 'Porto',
    'dep' => '29/08/2026', 'ret' => '04/09/2026', 'trav' => '2', 'status' => 'upcoming'
  ],
  'porto-2026-v2' => [
    'slug' => 'porto-2026-v2', 'dest' => 'Porto',
    'dep' => '29/08/2026', 'ret' => '04/09/2026', 'trav' => '2', 'status' => 'upcoming'
  ],
  'hamburg' => [
    'slug' => 'hamburg', 'dest' => 'Hamburg',
    'dep' => '18/09/2026', 'ret' => '21/09/2026', 'trav' => '4', 'status' => 'planning'
  ],
  'graz-ljubljana-lake-bled-2027' => [
    'slug' => 'graz-ljubljana-lake-bled-2027', 'dest' => 'Graz, Ljubljana & Lake Bled',
    'dep' => '28/05/2027', 'ret' => '02/06/2027', 'trav' => '2', 'status' => 'planning'
  ],
];

// The trip registry is the primary metadata source for current and future trips.
$trip = null;
try {
  $stmt = db()->prepare("SELECT data FROM itinerary WHERE id = ?");
  $stmt->execute(['trip-registry']);
  $row = $stmt->fetch();
  if ($row && $row['data']) {
    $registry = json_decode($row['data'], true);
    foreach (($registry['trips'] ?? []) as $t) {
      if (($t['slug'] ?? '') === $slug) {
        $trip = $t;
        break;
      }
    }
  }
} catch (\Exception $e) {
  // Do not fail yet — older trips can still render from the fallback map.
}

if (!$trip && isset($legacyTrips[$slug])) {
  $trip = $legacyTrips[$slug];
}

if (!$trip) {
  http_response_code(404);
  echo 'Trip not found.';
  exit;
}

$dest = $trip['dest'] ?? 'Trip';
$dep = $trip['dep'] ?? '';
$ret = $trip['ret'] ?? '';
$trav = $trip['trav'] ?? '2';
$status = $trip['status'] ?? 'upcoming';

// SINGLE SOURCE OF TRUTH FOR ALL ITINERARY UI.
$templatePath = __DIR__ . '/new-trip-v2.html';
$template = file_get_contents($templatePath);
if ($template === false) {
  http_response_code(500);
  echo 'Template not found.';
  exit;
}

// Replace the generic URL-param bootstrap with this trip's metadata.
$sourceBootstrap = "// Read URL params
const params = new URLSearchParams(window.location.search);
const dest   = params.get('dest') || 'New Trip';
const dep    = params.get('dep')  || '';
const ret    = params.get('ret')  || '';
const trav   = params.get('trav') || '2';
const status = params.get('status') || 'upcoming';
const slug   = params.get('slug') || 'new-trip';

// Use slug as the database record ID
const RECORD_ID = slug;";

$tripBootstrap = "// Trip data (rendered dynamically from the DB on every request)
const dest   = " . json_encode($dest) . ";
const dep    = " . json_encode($dep) . ";
const ret    = " . json_encode($ret) . ";
const trav   = " . json_encode($trav) . ";
const status = " . json_encode($status) . ";
const slug   = " . json_encode($slug) . ";

// Use slug as the database record ID
const RECORD_ID = slug;";

$page = str_replace($sourceBootstrap, $tripBootstrap, $template, $count);

if ($count === 0) {
  http_response_code(500);
  echo '<!-- trip.php: bootstrap marker not found in new-trip-v2.html -->';
  echo 'This trip could not be rendered right now. Please try again shortly.';
  exit;
}

// Enforce the accommodation lookup in the shared renderer itself. A hotel
// covers nights from check-in up to, but not including, checkout. If no stay
// covers the selected night, return null — never fall back to another hotel.
$oldHotelLookup = <<<'JS'
// Find the hotel covering the active day (checkin <= day <= checkout)
function hotelForDay(dayIdx) {
  if (STATE.days[dayIdx]?.noAccommodation) return null; // explicitly marked — staying with family/friends, or flying that day
  const hotels = STATE.meta.hotels || (STATE.meta.hotel ? [STATE.meta.hotel] : []);
  if (!hotels.length) return null;
  const dayDate = parseDate(STATE.days[dayIdx]?.date);
  if (!dayDate) return hotels[0]; // no date — show first
  for (const h of hotels) {
    const ci = parseDate(h.checkin);
    const co = parseDate(h.checkout);
    if (ci && co && dayDate >= ci && dayDate <= co) return h;
  }
  // Fallback: closest upcoming
  return hotels.find(h => parseDate(h.checkin) >= dayDate) || hotels[hotels.length-1];
}
JS;

$newHotelLookup = <<<'JS'
// Find the hotel covering the selected NIGHT (checkin <= day < checkout)
function hotelForDay(dayIdx) {
  if (STATE.days[dayIdx]?.noAccommodation) return null;
  const hotels = STATE.meta.hotels || (STATE.meta.hotel ? [STATE.meta.hotel] : []);
  if (!hotels.length) return null;
  const dayDate = parseDate(STATE.days[dayIdx]?.date);
  if (!dayDate) return null;
  for (const h of hotels) {
    const ci = parseDate(h.checkin);
    const co = parseDate(h.checkout);
    if (ci && co && dayDate >= ci && dayDate < co) return h;
  }
  return null;
}
JS;

$page = str_replace($oldHotelLookup, $newHotelLookup, $page, $hotelLookupCount);
if ($hotelLookupCount === 0) {
  // Keep rendering, but expose the drift in source so it cannot silently recur.
  $page = str_replace('</head>', '<!-- hotel lookup patch marker not found -->\n</head>', $page);
}

// Force the latest shared auth/helper script after hotel logic changes.
$page = str_replace('/auth.js?v=1', '/auth.js?v=2', $page);
$page = preg_replace('/<title>.*?<\/title>/', '<title>' . htmlspecialchars($dest) . ' · Itinerary</title>', $page);

echo $page;
