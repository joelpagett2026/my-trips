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
require_once __DIR__ . '/template-runtime.php';

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-cache, must-revalidate');
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
$tripBootstrap = "// Trip data (rendered dynamically from the DB on every request)\nconst dest   = " . json_encode($dest) . ";\nconst dep    = " . json_encode($dep) . ";\nconst ret    = " . json_encode($ret) . ";\nconst trav   = " . json_encode($trav) . ";\nconst status = " . json_encode($status) . ";\nconst slug   = " . json_encode($slug) . ";\n\n// Use slug as the database record ID\nconst RECORD_ID = slug;";
$page = str_replace($sourceBootstrap, $tripBootstrap, $template, $count);
if ($count === 0) { http_response_code(500); echo 'This trip could not be rendered right now. Please try again shortly.'; exit; }

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

/* Mobile itinerary: the time column is the drag handle. Prevent the
   browser from turning that gesture into page scrolling so pointermove
   remains available to the existing reorder logic. Scrolling everywhere
   else in the itinerary remains unchanged. */
@media (max-width: 768px) {
  .tl-time {
    touch-action: none;
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
  }
  .tl-time:active { cursor: grabbing; }
}
</style>
HTML;
$page = str_replace('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">', '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">' . "\n" . $standaloneHead, $page);

// Keep the current authenticated session when navigating from the homepage or
// dashboard into a trip. Dynamic version URLs prevent older cached scripts from
// relocking the page or leaving the mobile map redesign stale.
$authVersion = @filemtime(__DIR__ . '/auth.js') ?: time();
$dbVersion = @filemtime(__DIR__ . '/db.js') ?: time();
$mapVersion = @filemtime(__DIR__ . '/map-mobile-redesign.js') ?: time();
$completionVersion = @filemtime(__DIR__ . '/itinerary-completion.js') ?: time();
$page = preg_replace('~src="/auth\.js\?v=[^"]+"~', 'src="/auth.js?v=' . $authVersion . '"', $page);
$page = preg_replace('~src="/db\.js\?v=[^"]+"~', 'src="/db.js?v=' . $dbVersion . '"', $page);
$drawerSwipeFix = <<<'HTML'
<script>
(function () {
  if (!window.matchMedia || !window.matchMedia('(max-width: 768px)').matches) return;
  const drawer = document.getElementById('drawer');
  if (!drawer || drawer.dataset.mapSwipeFix === '1') return;
  drawer.dataset.mapSwipeFix = '1';

  let startY = 0, lastY = 0, tracking = false, eligible = false;
  const scrollIsAtTop = () => {
    const candidates = [drawer, document.getElementById('dr-body'), drawer.querySelector('.dr-scroll'), drawer.querySelector('.drawer-body')].filter(Boolean);
    return candidates.every(el => (el.scrollTop || 0) <= 1);
  };
  const isOpen = () => drawer.classList.contains('open') || document.getElementById('drawer-overlay')?.classList.contains('open');

  drawer.addEventListener('touchstart', e => {
    if (!isOpen() || !e.touches || e.touches.length !== 1) return;
    const target = e.target;
    const inHeader = !!target.closest('.dr-head');
    eligible = inHeader || scrollIsAtTop();
    if (!eligible) return;
    startY = lastY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  drawer.addEventListener('touchmove', e => {
    if (!tracking || !eligible || !e.touches || e.touches.length !== 1) return;
    lastY = e.touches[0].clientY;
    const dy = Math.max(0, lastY - startY);
    if (dy > 0) {
      drawer.style.transition = 'none';
      drawer.style.transform = `translateY(${Math.min(dy, 180)}px)`;
    }
  }, { passive: true });

  function finish() {
    if (!tracking) return;
    const dy = Math.max(0, lastY - startY);
    tracking = false;
    eligible = false;
    drawer.style.transition = '';
    drawer.style.transform = '';
    if (dy >= 70 && typeof closeDrawer === 'function') closeDrawer();
    startY = lastY = 0;
  }

  drawer.addEventListener('touchend', finish, { passive: true });
  drawer.addEventListener('touchcancel', finish, { passive: true });
})();
</script>
HTML;

$mobileTimelineLongPress = <<<'HTML'
<script>
(function () {
  if (!window.matchMedia || !window.matchMedia('(max-width: 768px)').matches) return;
  const root = document.getElementById('tl-col');
  if (!root || root.dataset.longPressDrag === '1') return;
  root.dataset.longPressDrag = '1';

  const HOLD_MS = 320;
  const CANCEL_DISTANCE = 8;
  const DRAG_POINTER_ID = 987654;
  let timer = null;
  let row = null;
  let touchId = null;
  let startX = 0, startY = 0, lastX = 0, lastY = 0;
  let active = false;
  let suppressClick = false;

  function currentItemForRow(el) {
    if (!el || typeof STATE === 'undefined' || typeof activeDay === 'undefined') return null;
    const idx = parseInt(el.dataset.idx, 10);
    return STATE.days?.[activeDay]?.items?.[idx] || null;
  }

  function eligibleRow(target) {
    if (!target || target.closest('button,a,input,select,textarea,label')) return null;
    const candidate = target.closest('.tl-item');
    if (!candidate) return null;
    const item = currentItemForRow(candidate);
    return item && ['place', 'attraction', 'ticket'].includes(item.type) ? candidate : null;
  }

  function clearTimer() {
    if (timer) window.clearTimeout(timer);
    timer = null;
  }

  function reset() {
    clearTimer();
    if (row) row.classList.remove('tl-longpress-dragging');
    row = null;
    touchId = null;
    active = false;
    startX = startY = lastX = lastY = 0;
  }

  function touchById(list) {
    if (!list) return null;
    for (const t of list) if (t.identifier === touchId) return t;
    return null;
  }

  function dispatchPointer(type, x, y, buttons) {
    const target = type === 'pointerdown' ? row?.querySelector('.tl-time') : window;
    if (!target || typeof PointerEvent !== 'function') return;
    target.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: DRAG_POINTER_ID,
      pointerType: 'touch',
      isPrimary: true,
      clientX: x,
      clientY: y,
      button: type === 'pointerdown' ? 0 : -1,
      buttons: buttons
    }));
  }

  root.addEventListener('touchstart', e => {
    if (!e.touches || e.touches.length !== 1) return;
    const candidate = eligibleRow(e.target);
    if (!candidate) return;

    reset();
    row = candidate;
    const t = e.touches[0];
    touchId = t.identifier;
    startX = lastX = t.clientX;
    startY = lastY = t.clientY;

    timer = window.setTimeout(() => {
      if (!row) return;
      active = true;
      suppressClick = true;
      row.classList.add('tl-longpress-dragging');
      dispatchPointer('pointerdown', startX, startY, 1);
      if (navigator.vibrate) navigator.vibrate(18);
    }, HOLD_MS);
  }, { passive: true });

  root.addEventListener('touchmove', e => {
    if (!row) return;
    const t = touchById(e.touches);
    if (!t) return;
    lastX = t.clientX;
    lastY = t.clientY;

    if (!active) {
      const dx = lastX - startX;
      const dy = lastY - startY;
      if (Math.hypot(dx, dy) > CANCEL_DISTANCE) reset();
      return;
    }

    e.preventDefault();
    dispatchPointer('pointermove', lastX, lastY, 1);
  }, { passive: false });

  function finish(e, cancelled) {
    if (!row) return;
    clearTimer();
    if (active) {
      if (e?.cancelable) e.preventDefault();
      dispatchPointer(cancelled ? 'pointercancel' : 'pointerup', lastX || startX, lastY || startY, 0);
      window.setTimeout(() => { suppressClick = false; }, 350);
    }
    reset();
  }

  root.addEventListener('touchend', e => finish(e, false), { passive: false });
  root.addEventListener('touchcancel', e => finish(e, true), { passive: false });

  root.addEventListener('click', e => {
    if (!suppressClick) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    suppressClick = false;
  }, true);

  root.addEventListener('contextmenu', e => {
    if (active || timer) e.preventDefault();
  });
})();
</script>
HTML;

$page = str_replace(
  '</body>',
  '<script src="/itinerary-state-guard.js?v=1"></script>' . "\n"
  . '<script src="/itinerary-ui.js?v=1"></script>' . "\n"
  . '<script src="/map-mobile-redesign.js?v=' . $mapVersion . '"></script>' . "\n"
  . $drawerSwipeFix . "\n"
  . $mobileTimelineLongPress . "\n"
  . '<script src="/itinerary-completion.js?v=' . $completionVersion . '"></script>' . "\n"
  . '<script src="/trip-delete.js?v=1"></script>' . "\n</body>",
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