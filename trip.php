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

$legacyTrips = [
  'china-2026' => ['slug'=>'china-2026','dest'=>'China','dep'=>'31/03/2026','ret'=>'17/04/2026','trav'=>'2','status'=>'past'],
  'dubai-2025' => ['slug'=>'dubai-2025','dest'=>'Dubai & Abu Dhabi','dep'=>'26/12/2025','ret'=>'09/01/2026','trav'=>'2','status'=>'past'],
  'costa-rica-2025' => ['slug'=>'costa-rica-2025','dest'=>'Costa Rica','dep'=>'04/04/2025','ret'=>'21/04/2025','trav'=>'2','status'=>'past'],
  'canada-2027' => ['slug'=>'canada-2027','dest'=>'Canada Road Trip','dep'=>'25/09/2027','ret'=>'10/10/2027','trav'=>'2','status'=>'upcoming'],
  'hk-taiwan-2027' => ['slug'=>'hk-taiwan-2027','dest'=>'Hong Kong & Taiwan','dep'=>'27/03/2027','ret'=>'12/04/2027','trav'=>'2','status'=>'planning'],
  'porto-2026' => ['slug'=>'porto-2026','dest'=>'Porto','dep'=>'29/08/2026','ret'=>'04/09/2026','trav'=>'2','status'=>'upcoming'],
  'porto-2026-v2' => ['slug'=>'porto-2026-v2','dest'=>'Porto','dep'=>'29/08/2026','ret'=>'04/09/2026','trav'=>'2','status'=>'upcoming'],
  'hamburg' => ['slug'=>'hamburg','dest'=>'Hamburg','dep'=>'18/09/2026','ret'=>'21/09/2026','trav'=>'4','status'=>'planning'],
  'graz-ljubljana-lake-bled-2027' => ['slug'=>'graz-ljubljana-lake-bled-2027','dest'=>'Graz, Ljubljana & Lake Bled','dep'=>'28/05/2027','ret'=>'02/06/2027','trav'=>'2','status'=>'planning'],
];

$trip = null;
try {
  $stmt = db()->prepare("SELECT data FROM itinerary WHERE id = ?");
  $stmt->execute(['trip-registry']);
  $row = $stmt->fetch();
  if ($row && $row['data']) {
    $registry = json_decode($row['data'], true);
    foreach (($registry['trips'] ?? []) as $t) {
      if (($t['slug'] ?? '') === $slug) { $trip = $t; break; }
    }
  }
} catch (\Exception $e) {}

if (!$trip && isset($legacyTrips[$slug])) $trip = $legacyTrips[$slug];
if (!$trip) { http_response_code(404); echo 'Trip not found.'; exit; }

$dest = $trip['dest'] ?? 'Trip';
$dep = $trip['dep'] ?? '';
$ret = $trip['ret'] ?? '';
$trav = $trip['trav'] ?? '2';
$status = $trip['status'] ?? 'upcoming';

$templatePath = __DIR__ . '/new-trip-v2.html';
$template = file_get_contents($templatePath);
if ($template === false) { http_response_code(500); echo 'Template not found.'; exit; }

$sourceBootstrap = "// Read URL params\nconst params = new URLSearchParams(window.location.search);\nconst dest   = params.get('dest') || 'New Trip';\nconst dep    = params.get('dep')  || '';\nconst ret    = params.get('ret')  || '';\nconst trav   = params.get('trav') || '2';\nconst status = params.get('status') || 'upcoming';\nconst slug   = params.get('slug') || 'new-trip';\n\n// Use slug as the database record ID\nconst RECORD_ID = slug;";
$tripBootstrap = "// Trip data (rendered dynamically from the DB on every request)\nconst dest   = " . json_encode($dest) . ";\nconst dep    = " . json_encode($dep) . ";\nconst ret    = " . json_encode($ret) . ";\nconst trav   = " . json_encode($trav) . ";\nconst status = " . json_encode($status) . ";\nconst slug   = " . json_encode($slug) . ";\n\n// Use slug as the database record ID\nconst RECORD_ID = slug;";
$page = str_replace($sourceBootstrap, $tripBootstrap, $template, $count);
if ($count === 0) { http_response_code(500); echo 'This trip could not be rendered right now. Please try again shortly.'; exit; }

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

$standaloneHead = <<<'HTML'
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Trip Planner">
<meta name="theme-color" content="#0e7a87">
<link rel="manifest" href="/manifest.webmanifest">
<script>
(function () { if (window.navigator.standalone === true) document.documentElement.classList.add('ios-standalone'); })();
</script>
<style>
@media (max-width: 700px) {
  html.ios-standalone, html.ios-standalone body { width:100%; min-height:100%; }
  html.ios-standalone body { height:calc(100dvh + env(safe-area-inset-bottom,0px)) !important; background:var(--bg,#e8e8e8) !important; }
  html.ios-standalone .v2-main, html.ios-standalone .v2-sidebar { height:calc(100dvh + env(safe-area-inset-bottom,0px)) !important; min-height:calc(100dvh + env(safe-area-inset-bottom,0px)) !important; }
  html.ios-standalone body::after { display:none !important; content:none !important; }

  /* Mobile drawer hero: 180px desktop/base + 50px on mobile. */
  .dr-hero-photo { height:230px !important; }

  #dr-photo-slot[style*="display: block"] + .dr-head { padding-top:26px !important; }
  #dr-photo-slot[style*="display: block"] + .dr-head::before { top:9px !important; }
}
</style>
HTML;
$page = str_replace('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">', '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">' . "\n" . $standaloneHead, $page);
$page = str_replace('/auth.js?v=1', '/auth.js?v=2', $page);
$page = preg_replace('/<title>.*?<\/title>/', '<title>' . htmlspecialchars($dest) . ' · Itinerary</title>', $page);
echo $page;
