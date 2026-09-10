<?php
// Trips dashboard renderer. Keeps the dashboard source free from active browser
// API credentials at runtime while preserving the existing HTML/JS unchanged.
require_once __DIR__ . '/template-runtime.php';
require_once __DIR__ . '/db-config.php';

// One-time, non-destructive historical import for the China 2026 itinerary.
// The seed was transcribed from the user's April 2026 China spreadsheet. It is
// only written when china-2026 has no real itinerary items, so any owner edits
// already stored in the database always win.
function importChina2026HistoryOnce(): void {
    static $ran = false;
    if ($ran) return;
    $ran = true;

    try {
        $pdo = db();
        $existingStmt = $pdo->prepare("SELECT data FROM itinerary WHERE id = ? LIMIT 1");
        $existingStmt->execute(['china-2026']);
        $existingRow = $existingStmt->fetch();
        $hasContent = false;
        if ($existingRow && is_string($existingRow['data'] ?? null)) {
            $existing = json_decode((string)$existingRow['data'], true);
            if (is_array($existing) && is_array($existing['days'] ?? null)) {
                foreach ($existing['days'] as $day) {
                    if (is_array($day) && !empty($day['items']) && is_array($day['items'])) {
                        $hasContent = true;
                        break;
                    }
                }
            }
        }

        $packed = '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';
        $decodedJson = gzdecode(base64_decode($packed, true));
        $tripData = is_string($decodedJson) ? json_decode($decodedJson, true) : null;
        if (!is_array($tripData) || !is_array($tripData['days'] ?? null)) {
            throw new RuntimeException('China history seed could not be decoded');
        }

        $pdo->beginTransaction();
        if (!$hasContent) {
            $tripJson = json_encode($tripData, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            if ($tripJson === false) throw new RuntimeException('Could not encode China history seed');
            $lockedTrip = $pdo->prepare("SELECT id FROM itinerary WHERE id = ? FOR UPDATE");
            $lockedTrip->execute(['china-2026']);
            if ($lockedTrip->fetch()) {
                $pdo->prepare("UPDATE itinerary SET data = ?, updated_at = NOW() WHERE id = ?")
                    ->execute([$tripJson, 'china-2026']);
            } else {
                $pdo->prepare("INSERT INTO itinerary (id, data, updated_at) VALUES (?, ?, NOW())")
                    ->execute(['china-2026', $tripJson]);
            }
        }

        $regStmt = $pdo->prepare("SELECT data FROM itinerary WHERE id = 'trip-registry' FOR UPDATE");
        $regStmt->execute();
        $regRow = $regStmt->fetch();
        $registry = ['trips' => []];
        if ($regRow && is_string($regRow['data'] ?? null)) {
            $decoded = json_decode((string)$regRow['data'], true);
            if (is_array($decoded)) $registry = $decoded;
        }
        if (!isset($registry['trips']) || !is_array($registry['trips'])) $registry['trips'] = [];

        $entry = [
            'dest' => 'China', 'dep' => '31/03/2026', 'ret' => '16/04/2026',
            'trav' => '2', 'status' => 'past', 'slug' => 'china-2026', 'url' => '/china-2026',
            'points' => [[31.2304,121.4737],[31.2989,120.5853],[30.5728,104.0668],[30.9964,103.6673],[34.3416,108.9398],[39.9042,116.4074]],
            'flags' => ['cn'], 'cities' => ['Shanghai','Suzhou','Chengdu','Dujiangyan',"Xi'an",'Beijing'],
            'created' => 1774915200000, 'photo' => '',
        ];

        $found = false;
        foreach ($registry['trips'] as &$trip) {
            if (!is_array($trip) || ($trip['slug'] ?? '') !== 'china-2026') continue;
            $found = true;
            $trip['dest'] = $entry['dest'];
            $trip['dep'] = $entry['dep'];
            $trip['ret'] = $entry['ret'];
            $trip['status'] = 'past';
            $trip['url'] = '/china-2026';
            if (empty($trip['trav'])) $trip['trav'] = '2';
            if (empty($trip['cities'])) $trip['cities'] = $entry['cities'];
            if (empty($trip['flags'])) $trip['flags'] = $entry['flags'];
            if (empty($trip['points'])) $trip['points'] = $entry['points'];
            break;
        }
        unset($trip);
        if (!$found) $registry['trips'][] = $entry;

        $registryJson = json_encode($registry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($registryJson === false) throw new RuntimeException('Could not encode trip registry');
        if ($regRow) {
            $pdo->prepare("UPDATE itinerary SET data = ?, updated_at = NOW() WHERE id = 'trip-registry'")
                ->execute([$registryJson]);
        } else {
            $pdo->prepare("INSERT INTO itinerary (id, data, updated_at) VALUES ('trip-registry', ?, NOW())")
                ->execute([$registryJson]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
        error_log('China 2026 historical import failed: ' . $e->getMessage());
    }
}

importChina2026HistoryOnce();

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
    '    const year = t.start.match(/(\\d{4})/)?.[1];',
    '    const year = t.groupYear || t.start.match(/(\\d{4})/)?.[1];',
    $page,
    $dubaiHistoryGroupingCount
);
if ($dubaiCardYearCount !== 1 || $dubaiHistoryMetaCount !== 1 || $dubaiHistoryGroupingCount !== 2) {
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

// Override the legacy two-step dashboard creator only after its original script
// has loaded. The replacement uses trip-create.php to commit the itinerary and
// registry entry atomically.
$createScript = '<script src="/trip-dashboard-create.js?v=2"></script>' . "\n" . $cityTagCleanupScript;
$page = str_replace('</body>', $createScript . "\n</body>", $page, $createScriptCount);
if ($createScriptCount !== 1) {
    http_response_code(500);
    echo 'Trips dashboard creation module could not be loaded.';
    exit;
}

echo $page;
