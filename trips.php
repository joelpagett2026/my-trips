<?php
// Trips dashboard renderer. Keeps the dashboard source free from active browser
// API credentials at runtime while preserving the existing HTML/JS unchanged.
require_once __DIR__ . '/template-runtime.php';

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');

$template = file_get_contents(__DIR__ . '/trips/index.html');
if ($template === false) {
    http_response_code(500);
    echo 'Trips dashboard is unavailable.';
    exit;
}

[$page, $diag] = applyTripsDashboardRuntimeSafety($template);
if (($diag['maps_key_rewritten'] ?? 0) !== 1
    || ($diag['travel_day_filter_rewritten'] ?? 0) !== 1
    || ($diag['registry_error_handling_rewritten'] ?? 0) !== 1
    || ($diag['countdown_registry_error_rewritten'] ?? 0) !== 1) {
    http_response_code(500);
    echo 'Trips dashboard could not be rendered safely.';
    exit;
}

// Keep the historical mileage baseline aligned with the latest travelled total.
// Porto is already included in this figure, so its registry entry must not add
// another estimated journey mileage. It still contributes to trip/country stats.
$page = str_replace(
    'const PS_MILES = 205021;',
    'const PS_MILES = 206825;',
    $page,
    $milesBaselineCount
);
$page = str_replace(
    'if (flags.length) liveMiles += estimateMilesForCountries(flags);',
    "if (flags.length && !['porto-2026','porto-2026-v2'].includes(t.slug)) liveMiles += estimateMilesForCountries(flags);",
    $page,
    $portoMileageCount
);
if ($milesBaselineCount !== 1 || $portoMileageCount !== 1) {
    http_response_code(500);
    echo 'Trips dashboard mileage stats could not be attached safely.';
    exit;
}

// Keep the completed-trip/country history explicit as well as registry-driven.
// Porto is the first 2026 entry after China and belongs to Portugal (pt). The
// registry de-duplication below prevents this from appearing twice when live data
// is available, while the static history/card data remains complete on its own.
$tripHistoryNeedle = <<<'JS'
const trips = [
  {name:"China",start:"Mar 2026",codes:["cn"]},
JS;
$tripHistoryReplacement = <<<'JS'
const trips = [
  {name:"Porto",start:"Aug 2026",codes:["pt"]},
  {name:"China",start:"Mar 2026",codes:["cn"]},
JS;
$pastTripsNeedle = <<<'JS'
const psTripList = [
  {name:"China",start:"Mar 2026",codes:["cn"]},
JS;
$pastTripsReplacement = <<<'JS'
const psTripList = [
  {name:"Porto",start:"Aug 2026",codes:["pt"]},
  {name:"China",start:"Mar 2026",codes:["cn"]},
JS;
$page = str_replace($tripHistoryNeedle, $tripHistoryReplacement, $page, $portoTripHistoryCount);
$page = str_replace($pastTripsNeedle, $pastTripsReplacement, $page, $portoPastTripsCount);
if ($portoTripHistoryCount !== 1 || $portoPastTripsCount !== 1) {
    http_response_code(500);
    echo 'Trips dashboard Porto history could not be attached safely.';
    exit;
}

// Dubai & Abu Dhabi starts on 26 Dec 2025 but most of the holiday is in January
// 2026. Keep the actual displayed dates unchanged, while filing the trip under
// the 2026 holiday group on both the main cards and the Past Trips history.
$page = str_replace(
    "    const year = extractYear(t.dep) || '0';",
    "    const year = t.slug === 'dubai-2025' ? '2026' : (extractYear(t.dep) || '0');",
    $page,
    $dubaiCardYearCount
);
$page = str_replace(
    '  {name:"Dubai & Abu Dhabi",start:"Dec 2025",codes:["ae","fr"]},',
    '  {name:"Dubai & Abu Dhabi",start:"Dec 2025",groupYear:"2026",codes:["ae","fr"]},',
    $page,
    $dubaiHistoryMetaCount
);
$page = str_replace(
    'const year = t.start.match(/(\\d{4})/)?.[1];',
    'const year = t.groupYear || t.start.match(/(\\d{4})/)?.[1];',
    $page,
    $dubaiHistoryGroupingCount
);
// The Dubai entry occurs in both historical arrays, so the metadata replacement
// and both history-grouping loops must all be updated exactly as expected.
if ($dubaiCardYearCount !== 1 || $dubaiHistoryMetaCount !== 2 || $dubaiHistoryGroupingCount !== 2) {
    http_response_code(500);
    echo 'Trips dashboard Dubai year grouping could not be attached safely.';
    exit;
}

// Merge registry flags with any known multi-country metadata. Older records can
// have a legacy/renamed slug, so match known trips by slug first and destination
// name second. Only valid two-letter country codes are passed to FlagCDN.
$oldRegistryReturn = <<<'JS'
    clearRegistryLoadError();
    return trips;
  } catch (err) {
JS;
$newRegistryReturn = <<<'JS'
    clearRegistryLoadError();
    return trips.map(t => {
      let planned = null;
      if (typeof PLANNED !== 'undefined' && t) {
        if (t.slug && PLANNED[t.slug]) {
          planned = PLANNED[t.slug];
        } else {
          const destKey = String(t.dest || '').trim().toLowerCase();
          planned = Object.values(PLANNED).find(p =>
            String((p && p.name) || '').trim().toLowerCase() === destKey
          ) || null;
        }
      }
      const mergedFlags = Array.from(new Set([
        ...((t && Array.isArray(t.flags)) ? t.flags : []),
        ...((planned && Array.isArray(planned.countries)) ? planned.countries : [])
      ].map(cc => String(cc || '').trim().toLowerCase()).filter(cc => /^[a-z]{2}$/.test(cc))));
      return mergedFlags.length ? {...t, flags: mergedFlags} : t;
    });
  } catch (err) {
JS;
$page = str_replace($oldRegistryReturn, $newRegistryReturn, $page, $multiCountryRegistryCount);
$page = str_replace(
    'const reg = await window.dbLoadRegistry();',
    'const reg = await loadRegistry();',
    $page,
    $countdownRegistryCount
);
if ($multiCountryRegistryCount !== 1 || $countdownRegistryCount !== 1) {
    http_response_code(500);
    echo 'Trips dashboard multi-country flags could not be attached safely.';
    exit;
}

// The homepage already uses cache-busted authentication/database assets. The
// dashboard must use the exact same current runtimes so navigation from the
// homepage keeps the existing session instead of ever loading a stale PIN gate.
$authVersion = @filemtime(__DIR__ . '/auth.js') ?: time();
$dbVersion = @filemtime(__DIR__ . '/db.js') ?: time();
$page = preg_replace('~src="/auth\\.js\\?v=[^"]+"~', 'src="/auth.js?v=' . $authVersion . '"', $page);
$page = preg_replace('~src="/db\\.js\\?v=[^"]+"~', 'src="/db.js?v=' . $dbVersion . '"', $page);

// Remove a grey city tag only when it repeats the card's main destination AND
// the card has at least one other distinct place tag. Single-destination trips
// such as Gothenburg and Hamburg keep their one useful destination pill.
// Porto is intentionally kept as a destination pill alongside Aveiro, Braga and
// Guimarães so the card lists the main city as well as the day-trip locations.
// Cards are populated asynchronously, so observe additions and clean them as
// they appear rather than depending on a brittle source-code replacement.
$cityTagCleanupScript = <<<'HTML'
<script>
(() => {
  const normalize = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const cleanDuplicateDestinationTags = () => {
    document.querySelectorAll('.trip-card').forEach(card => {
      const destination = card.querySelector('.card-dest');
      if (!destination) return;
      const destinationKey = normalize(destination.textContent);
      const tags = Array.from(card.querySelectorAll('.city-tag'));

      if (destinationKey === 'porto') {
        const hasPorto = tags.some(tag => normalize(tag.textContent) === 'porto');
        if (!hasPorto && tags.length) {
          const portoTag = document.createElement('span');
          portoTag.className = 'city-tag';
          portoTag.textContent = 'Porto';
          tags[0].parentNode.insertBefore(portoTag, tags[0]);
        }
        return;
      }

      const hasOtherPlace = tags.some(tag => normalize(tag.textContent) !== destinationKey);
      if (!hasOtherPlace) return;
      tags.forEach(tag => {
        if (normalize(tag.textContent) === destinationKey) tag.remove();
      });
    });
  };
  cleanDuplicateDestinationTags();
  new MutationObserver(cleanDuplicateDestinationTags)
    .observe(document.body, {childList: true, subtree: true});
})();
</script>
HTML;

// Porto had a historical porto-2026-v2 registry slug, while all legacy Porto
// routes now redirect to the canonical porto-2026 itinerary record. Read the
// canonical itinerary cover and apply it to either registry/card identity so the
// dashboard cannot stay on an older image because of that alias.
$legacyPortoCoverScript = <<<'HTML'
<script>
(() => {
  let running = false;
  let repaired = false;

  async function repairPortoCover() {
    if (running || repaired || typeof window.dbLoad !== 'function') return;
    running = true;
    try {
      const trip = await window.dbLoad('porto-2026');
      const meta = trip && trip.meta ? trip.meta : {};
      const cover = (typeof meta.coverPhoto === 'string' && meta.coverPhoto)
        ? meta.coverPhoto
        : (typeof meta._coverPhoto === 'string' ? meta._coverPhoto : '');
      if (!cover) return;

      let found = false;
      document.querySelectorAll('.trip-card').forEach(card => {
        const destination = String(card.querySelector('.card-dest')?.textContent || '').trim().toLowerCase();
        const href = String(card.getAttribute('href') || '');
        if (destination !== 'porto' && !href.includes('porto-2026')) return;
        const area = card.querySelector('.card-image-area');
        if (!area) return;
        found = true;
        const map = area.querySelector('.card-map');
        if (map) map.remove();
        let image = Array.from(area.children).find(child => child.tagName === 'IMG');
        if (!image) {
          image = document.createElement('img');
          image.alt = 'Porto';
          image.style.cssText = 'width:100%;height:100%;object-fit:cover;';
          area.insertBefore(image, area.firstChild);
        }
        image.src = cover;
      });

      if (found && typeof window.dbLoadRegistry === 'function' && typeof window.dbSaveRegistry === 'function') {
        try {
          const registry = await window.dbLoadRegistry();
          const entry = Array.isArray(registry)
            ? registry.find(t => t && ['porto-2026', 'porto-2026-v2'].includes(t.slug))
            : null;
          if (entry && String(entry.photo || '') !== cover) {
            entry.photo = cover;
            await window.dbSaveRegistry(registry);
          }
        } catch (err) {
          console.warn('Porto card registry repair failed:', err);
        }
      }

      repaired = found;
    } catch (err) {
      console.warn('Porto card cover repair failed:', err);
    } finally {
      running = false;
    }
  }

  const schedule = () => setTimeout(repairPortoCover, 0);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true });
  } else {
    schedule();
  }
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
})();
</script>
HTML;

// Override the legacy two-step dashboard creator only after its original script
// has loaded. The replacement uses trip-create.php to commit the itinerary and
// registry entry atomically.
$createScript = '<script src="/trip-dashboard-create.js?v=2"></script>' . "\n" . $cityTagCleanupScript . "\n" . $legacyPortoCoverScript;
$page = str_replace('</body>', $createScript . "\n</body>", $page, $createScriptCount);
if ($createScriptCount !== 1) {
    http_response_code(500);
    echo 'Trips dashboard creation module could not be loaded.';
    exit;
}

echo $page;
