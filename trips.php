<?php
// Dynamic wrapper for the trips dashboard.
// Keeps the existing dashboard source as the single UI file, but applies
// small presentation-level fixes before it is sent to the browser.
header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

$path = __DIR__ . '/trips/index.html';
$page = file_get_contents($path);
if ($page === false) {
    http_response_code(500);
    echo 'Trips dashboard unavailable.';
    exit;
}

// Front-card location chips should only contain real destinations/places.
// "Travel Day" is an itinerary day type, not a place, so remove it at the
// card-data rendering stage before any chips are created.
$oldFilter = ".filter((c,i,a) => a.indexOf(c) === i) // dedupe";
$newFilter = ".filter((c,i,a) => a.indexOf(c) === i && String(c).trim().toLowerCase() !== 'travel day') // dedupe + hide day-type labels";
$page = str_replace($oldFilter, $newFilter, $page);

// Force the latest shared helper script rather than a previously cached v3 copy.
$page = str_replace('/auth.js?v=3', '/auth.js?v=4', $page);

// Final defensive cleanup for any card chips added by older/stale registry data.
$cleanup = <<<'HTML'
<script>
(function hideNonPlaceFrontCardTags(){
  function clean(){
    document.querySelectorAll('.trip-card .city-tag').forEach(function(tag){
      var text=(tag.textContent||'').trim().toLowerCase();
      if(text==='travel day') tag.remove();
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', clean, {once:true});
  else clean();
  new MutationObserver(clean).observe(document.documentElement,{childList:true,subtree:true});
})();
</script>
HTML;
$page = str_replace('</body>', $cleanup . "\n</body>", $page);

echo $page;
