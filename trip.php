<?php
// ══════════════════════════════════════════════════════════════════════
// MY TRIPS — Single dynamic itinerary renderer
//
// EVERY itinerary uses this renderer and therefore the same
// new-trip-v2.html template. The Itinerary, Bookings, Map and Budget tabs
// are all part of that one shared template, so a template change applies
// to every trip automatically.
// ══════════════════════════════════════════════════════════════════════

function tripRuntimeAssetMap(): array {
  return [
    'trip-json-bootstrap' => 'trip-standalone.js',
    'trip-standalone' => 'trip-standalone.js',
    'trip-drawer-swipe' => 'trip-drawer-swipe.js',
    'trip-mobile-modal-layout' => 'trip-mobile-modal-layout.js',
  ];
}

function tripRuntimeAssetUrl(string $asset): string {
  $filename = tripRuntimeAssetMap()[$asset] ?? '';
  $path = $filename !== '' ? __DIR__ . '/' . $filename : '';
  $version = ($path !== '' && is_file($path)) ? (string)filemtime($path) : '0';
  return '/trip.php?asset=' . rawurlencode($asset) . '&v=' . rawurlencode($version);
}

function serveTripRuntimeAsset(string $asset): void {
  if ($_SERVER['REQUEST_METHOD'] !== 'GET' && $_SERVER['REQUEST_METHOD'] !== 'HEAD') {
    http_response_code(405);
    header('Allow: GET, HEAD');
    exit;
  }

  $filename = tripRuntimeAssetMap()[$asset] ?? '';
  if ($filename === '') {
    http_response_code(404);
    header('Content-Type: text/plain; charset=UTF-8');
    header('Cache-Control: no-store');
    echo 'Runtime asset not found.';
    exit;
  }

  $path = __DIR__ . '/' . $filename;
  if (!is_file($path) || !is_readable($path)) {
    http_response_code(404);
    header('Content-Type: application/javascript; charset=UTF-8');
    header('Cache-Control: no-store');
    echo "throw new Error('Trip runtime asset is unavailable');";
    exit;
  }

  $currentVersion = (string)filemtime($path);
  $requestedVersion = trim((string)($_GET['v'] ?? ''));
  if ($requestedVersion !== $currentVersion) {
    header('Cache-Control: no-store');
    header('Location: ' . tripRuntimeAssetUrl($asset), true, 302);
    exit;
  }

  header('Content-Type: application/javascript; charset=UTF-8');
  header('Cache-Control: public, max-age=31536000, immutable');
  header('X-Robots-Tag: noindex, nofollow, noarchive', true);
  if ($_SERVER['REQUEST_METHOD'] === 'GET') readfile($path);
  exit;
}

// The host currently refuses newly introduced root-level JS URLs even when the
// deployer copies the files successfully. Serve only these four explicit runtime
// derivatives through the already-proven trip.php endpoint instead of exposing a
// generic file reader. The versioned response is still immutable and cacheable.
$runtimeAsset = trim((string)($_GET['asset'] ?? ''));
if ($runtimeAsset !== '') serveTripRuntimeAsset($runtimeAsset);

require_once __DIR__ . '/db-config.php';
require_once __DIR__ . '/template-runtime.php';

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Expires: 0');
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

// One central compatibility/safety pass is shared with read-only share pages.
[$template, $runtimeDiag] = applyItineraryRuntimeSafety($template);
if (($runtimeDiag['auth_const_removed'] ?? 0) !== 1
    || ($runtimeDiag['auth_headers_rewritten'] ?? 0) < 1
    || ($runtimeDiag['maps_key_rewritten'] ?? 0) !== 1
    || ($runtimeDiag['share_url_rewritten'] ?? 0) !== 1
    || ($runtimeDiag['hotel_lookup_rewritten'] ?? 0) !== 1) {
  http_response_code(500);
  echo 'This trip could not be rendered safely because the shared template changed unexpectedly.';
  exit;
}

$sourceBootstrap = "// Read URL params\nconst params = new URLSearchParams(window.location.search);\nconst dest   = params.get('dest') || 'New Trip';\nconst dep    = params.get('dep')  || '';\nconst ret    = params.get('ret')  || '';\nconst trav   = params.get('trav') || '2';\nconst status = params.get('status') || 'upcoming';\nconst slug   = params.get('slug') || 'new-trip';\n\n// Use slug as the database record ID\nconst RECORD_ID = slug;";
$sourceBootstrapScript = "<script>\n// ── BAKE POINT (deploy webhook replaces this block) ──────────────────\n" . $sourceBootstrap . "\n</script>";
$tripData = json_encode([
  'dest' => (string)$dest,
  'dep' => (string)$dep,
  'ret' => (string)$ret,
  'trav' => (string)$trav,
  'status' => (string)$status,
  'slug' => (string)$slug,
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
if ($tripData === false) { http_response_code(500); echo 'This trip could not be rendered right now. Please try again shortly.'; exit; }
$tripJsonBootstrapUrl = htmlspecialchars(tripRuntimeAssetUrl('trip-json-bootstrap'), ENT_QUOTES, 'UTF-8');
$tripBootstrapScript = '<script type="application/json" id="trip-runtime-data">' . $tripData . '</script>' . "\n"
  . '<script src="' . $tripJsonBootstrapUrl . '"></script>';
$page = str_replace($sourceBootstrapScript, $tripBootstrapScript, $template, $count);
if ($count !== 1) { http_response_code(500); echo 'This trip could not be rendered right now. Please try again shortly.'; exit; }

$tripStandaloneUrl = htmlspecialchars(tripRuntimeAssetUrl('trip-standalone'), ENT_QUOTES, 'UTF-8');
$tripDrawerSwipeUrl = htmlspecialchars(tripRuntimeAssetUrl('trip-drawer-swipe'), ENT_QUOTES, 'UTF-8');
$tripMobileModalUrl = htmlspecialchars(tripRuntimeAssetUrl('trip-mobile-modal-layout'), ENT_QUOTES, 'UTF-8');

$standaloneHead = <<<'HTML'
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Trip Planner">
<meta name="theme-color" content="#0e7a87">
<link rel="manifest" href="/manifest.webmanifest">
<script src="__TRIP_STANDALONE_URL__"></script>
<style>
@media (max-width: 700px) {
  html.ios-standalone, html.ios-standalone body { width:100%; min-height:100%; }
  html.ios-standalone body { height:calc(100dvh + env(safe-area-inset-bottom,0px)) !important; background:var(--bg,#e8e8e8) !important; }
  html.ios-standalone .v2-main, html.ios-standalone .v2-sidebar { height:calc(100dvh + env(safe-area-inset-bottom,0px)) !important; min-height:calc(100dvh + env(safe-area-inset-bottom,0px)) !important; }
  html.ios-standalone body::after { display:none !important; content:none !important; }

  .dr-hero-photo { height:230px !important; }
  #dr-photo-slot[style*="display: block"] + .dr-head { padding-top:26px !important; }
  #dr-photo-slot[style*="display: block"] + .dr-head::before { top:9px !important; }

  .modal-overlay {
    overflow:hidden !important;
    overscroll-behavior-x:none;
    touch-action:pan-y;
  }
  .modal {
    width:100% !important;
    max-width:100% !important;
    min-width:0 !important;
    overflow:hidden !important;
    touch-action:pan-y;
  }
  .modal-body,
  #modal-body-single,
  #modal-body-bulk {
    width:100% !important;
    min-width:0 !important;
    max-width:100% !important;
    overflow-x:hidden !important;
    overscroll-behavior-x:none;
    touch-action:pan-y;
  }
  .field-row { grid-template-columns:minmax(0,1fr) minmax(0,1fr) !important; min-width:0; }
  .field-group,
  .field-input,
  .field-select,
  .field-textarea { min-width:0 !important; max-width:100% !important; }
}

/* Prevent iOS text-selection callouts on mobile itinerary rows. The dedicated
   mobile-drag.js handler owns the actual long-press/scroll gesture. */
@media (max-width: 768px) {
  .tl-item,
  .tl-item * {
    -webkit-user-select: none !important;
    user-select: none !important;
    -webkit-touch-callout: none !important;
    -webkit-user-drag: none !important;
  }
}
</style>
HTML;
$standaloneHead = str_replace('__TRIP_STANDALONE_URL__', $tripStandaloneUrl, $standaloneHead);
$page = str_replace('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">', '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">' . "\n" . $standaloneHead, $page);

// Keep the current authenticated session when navigating from the homepage or
// dashboard into a trip. Dynamic version URLs prevent older cached scripts from
// relocking the page or leaving mobile UI helpers stale.
$authVersion = @filemtime(__DIR__ . '/auth.js') ?: time();
$dbVersion = @filemtime(__DIR__ . '/db.js') ?: time();
$stateGuardVersion = @filemtime(__DIR__ . '/itinerary-state-guard.js') ?: time();
$uiVersion = @filemtime(__DIR__ . '/itinerary-ui.js') ?: time();
$mapVersion = @filemtime(__DIR__ . '/map-mobile-redesign.js') ?: time();
$mobileDragVersion = @filemtime(__DIR__ . '/mobile-drag.js') ?: time();
$completionVersion = @filemtime(__DIR__ . '/itinerary-completion.js') ?: time();
$tripDeleteVersion = @filemtime(__DIR__ . '/trip-delete.js') ?: time();
$page = preg_replace('~src="/auth\.js\?v=[^"]+"~', 'src="/auth.js?v=' . $authVersion . '"', $page);
$page = preg_replace('~src="/db\.js\?v=[^"]+"~', 'src="/db.js?v=' . $dbVersion . '"', $page);

// The large itinerary shell has several body-end helpers that must keep their
// existing synchronous execution order. Preloading their exact versioned URLs
// from <head> lets the browser fetch them in parallel while the document parses,
// removing the network waterfall without changing execution timing.
$runtimePreloads =
  '<link rel="preload" href="' . $tripJsonBootstrapUrl . '" as="script">' . "\n"
  . '<link rel="preload" href="/itinerary-state-guard.js?v=' . $stateGuardVersion . '" as="script">' . "\n"
  . '<link rel="preload" href="/itinerary-ui.js?v=' . $uiVersion . '" as="script">' . "\n"
  . '<link rel="preload" href="/map-mobile-redesign.js?v=' . $mapVersion . '" as="script">' . "\n"
  . '<link rel="preload" href="' . $tripDrawerSwipeUrl . '" as="script">' . "\n"
  . '<link rel="preload" href="/mobile-drag.js?v=' . $mobileDragVersion . '" as="script">' . "\n"
  . '<link rel="preload" href="/itinerary-completion.js?v=' . $completionVersion . '" as="script">' . "\n"
  . '<link rel="preload" href="' . $tripMobileModalUrl . '" as="script">' . "\n"
  . '<link rel="preload" href="/trip-delete.js?v=' . $tripDeleteVersion . '" as="script">';
$page = str_replace('</head>', $runtimePreloads . "\n</head>", $page, $runtimePreloadCount);
if ($runtimePreloadCount !== 1) {
  http_response_code(500);
  echo 'This trip could not be rendered safely because the page head is incomplete.';
  exit;
}

$page = str_replace(
  '</body>',
  '<script src="/itinerary-state-guard.js?v=' . $stateGuardVersion . '"></script>' . "\n"
  . '<script src="/itinerary-ui.js?v=' . $uiVersion . '"></script>' . "\n"
  . '<script src="/map-mobile-redesign.js?v=' . $mapVersion . '"></script>' . "\n"
  . '<script src="' . $tripDrawerSwipeUrl . '"></script>' . "\n"
  . '<script src="/mobile-drag.js?v=' . $mobileDragVersion . '"></script>' . "\n"
  . '<script src="/itinerary-completion.js?v=' . $completionVersion . '"></script>' . "\n"
  . '<script src="' . $tripMobileModalUrl . '"></script>' . "\n"
  . '<script src="/trip-delete.js?v=' . $tripDeleteVersion . '"></script>' . "\n</body>",
  $page,
  $guardCount
);
if ($guardCount === 0) {
  http_response_code(500);
  echo 'This trip could not be rendered safely because the page shell is incomplete.';
  exit;
}
$page = preg_replace('/<title>.*?<\/title>/', '<title>' . htmlspecialchars($dest) . ' · Itinerary</title>', $page);
echo $page;