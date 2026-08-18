<?php
// MY TRIPS — Dynamic trip renderer
// Serves /{slug} for every v2 trip by reading new-trip-v2.html + this
// trip's record from the DB fresh on every request. There is no baked
// file for these trips, so an edit to new-trip-v2.html reaches every v2
// trip (past and future) the moment it's deployed — no regeneration step.
//
// Routed here via .htaccess: any bare path with no matching real file
// or directory falls through to trip.php?slug={path}.
require_once __DIR__ . '/db-config.php';

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-cache, must-revalidate');

$slug = preg_replace('/[^a-z0-9\-]/', '', strtolower($_GET['slug'] ?? ''));
if (!$slug) {
  http_response_code(404);
  echo 'Trip not found.';
  exit;
}

// The trip registry (id = 'trip-registry') holds the dest/dep/ret/trav/status
// for every dashboard-created trip — the same record trips/index.html reads.
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
} catch (\Exception $e) {
  http_response_code(500);
  echo 'Could not load trip data.';
  exit;
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

$template = file_get_contents(__DIR__ . '/new-trip-v2.html');
if ($template === false) {
  http_response_code(500);
  echo 'Template not found.';
  exit;
}

// Same bake point new-trip-v2.html defines for api.php's (now-retired)
// one-time bake — reused here, just applied fresh on every request.
$page = str_replace(
  "// Read URL params
  const params = new URLSearchParams(window.location.search);
  const dest   = params.get('dest') || 'New Trip';
  const dep    = params.get('dep')  || '';
  const ret    = params.get('ret')  || '';
  const trav   = params.get('trav') || '2';
  const status = params.get('status') || 'upcoming';
  const slug   = params.get('slug') || 'new-trip';

  // Use slug as the database record ID
  const RECORD_ID = slug;",
  "// Trip data (rendered dynamically from the DB on every request)
  const dest   = " . json_encode($dest) . ";
  const dep    = " . json_encode($dep) . ";
  const ret    = " . json_encode($ret) . ";
  const trav   = " . json_encode($trav) . ";
  const status = " . json_encode($status) . ";
  const slug   = " . json_encode($slug) . ";

  // Use slug as the database record ID
  const RECORD_ID = slug;",
  $template
  );

$page = preg_replace('/<title>.*?<\/title>/', '<title>' . htmlspecialchars($dest) . ' · Itinerary</title>', $page);

echo $page;
