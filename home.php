<?php
require_once __DIR__ . '/db-config.php';

// TEMPORARY ONE-TIME IMPORT: populate the existing dubai-2025 record from the
// user's historical Google Sheet. The import only writes itinerary content when
// that record is absent/empty, so it cannot replace an already-populated trip.
function importDubai2025HistoryOnce(): void {
    $pdo = null;
    try {
        $pdo = db();

        $existingStmt = $pdo->prepare("SELECT data FROM itinerary WHERE id = ? LIMIT 1");
        $existingStmt->execute(['dubai-2025']);
        $existingRow = $existingStmt->fetch();
        $hasContent = false;
        if ($existingRow && is_string($existingRow['data'] ?? null)) {
            $existing = json_decode((string)$existingRow['data'], true);
            if (is_array($existing)) {
                foreach (($existing['days'] ?? []) as $day) {
                    if (is_array($day) && !empty($day['items']) && is_array($day['items'])) {
                        $hasContent = true;
                        break;
                    }
                }
            }
        }

        $tripData = null;
        if (!$hasContent) {
            $sheetUrl = 'https://docs.google.com/spreadsheets/d/1kjMhv9cjtqwvhrnMiDOD6NYyTJwm9bpvJF-HHWGe7KE/gviz/tq?tqx=out:csv&sheet=Holiday';
            $ch = curl_init($sheetUrl);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_TIMEOUT => 15,
                CURLOPT_HTTPHEADER => ['User-Agent: MyTripsHistoryImport/1.0'],
            ]);
            $csv = curl_exec($ch);
            $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            if (!is_string($csv) || $csv === '' || $status >= 400) {
                throw new RuntimeException('Historical Google Sheet could not be read');
            }

            $stream = fopen('php://temp', 'r+');
            fwrite($stream, $csv);
            rewind($stream);
            $rows = [];
            while (($row = fgetcsv($stream)) !== false) $rows[] = $row;
            fclose($stream);
            if (count($rows) < 2) throw new RuntimeException('Historical Google Sheet contains no itinerary rows');
            array_shift($rows);

            $clean = static fn($v): string => trim((string)($v ?? ''));
            $isBlank = static fn($v): bool => ($v === '' || strtoupper($v) === 'X');
            $dateFmt = static function(string $value): string {
                try { return (new DateTime($value))->format('d/m/Y'); }
                catch (Throwable $e) { return $value; }
            };
            $timeFmt = static function(string $value): string {
                $value = trim($value);
                if ($value === '' || strtoupper($value) === 'X') return '';
                if (!preg_match('/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i', $value, $m)) return '';
                $h = (int)$m[1]; $min = (int)$m[2]; $ampm = strtoupper($m[3] ?? '');
                if ($ampm === 'PM' && $h < 12) $h += 12;
                if ($ampm === 'AM' && $h === 12) $h = 0;
                return sprintf('%02d:%02d', $h, $min);
            };
            $makeId = static function(int $day, string $kind, string $title, int $n): string {
                return $kind . '-' . substr(sha1('dubai-2025|' . $day . '|' . $kind . '|' . $title . '|' . $n), 0, 16);
            };

            $days = [];
            $hotelSpans = [];
            foreach ($rows as $i => $row) {
                $row = array_pad($row, 16, '');
                $dayNo = $i + 1;
                $date = $dateFmt($clean($row[1]));
                $start = $clean($row[2]);
                $finish = $clean($row[3]);
                $transportRaw = $clean($row[4]);
                $depart = $timeFmt($clean($row[5]));
                $arrive = $timeFmt($clean($row[6]));
                $acc = $clean($row[7]);
                $cost = preg_replace('/[^0-9.]/', '', $clean($row[8]));
                $breakfastIncluded = strtolower($clean($row[9])) === 'included';
                $ref = $clean($row[10]);
                $breakfastPlace = $clean($row[11]);
                $morning = $clean($row[12]);
                $afternoon = $clean($row[13]);
                $dinner = $clean($row[14]);
                $dinnerBooking = $clean($row[15]);

                if (!$isBlank($acc)) {
                    if (!isset($hotelSpans[$acc])) {
                        $hotelSpans[$acc] = [
                            'name' => $acc,
                            'first' => $date,
                            'last' => $date,
                            'nightly' => $cost,
                            'ref' => $isBlank($ref) ? '' : $ref,
                            'breakfast' => $breakfastIncluded ? 'included' : 'excluded',
                        ];
                    } else {
                        $hotelSpans[$acc]['last'] = $date;
                    }
                }

                $city = $finish;
                if (stripos($acc, 'Terminus Nord') !== false) $city = 'Paris';
                elseif (stripos($acc, 'Hamad') !== false) $city = 'Doha';
                elseif (stripos($acc, 'Rove City Walk') !== false) $city = 'Dubai';
                elseif (stripos($acc, 'Hilton Abu Dhabi') !== false) $city = 'Abu Dhabi';
                elseif (stripos($acc, 'Crowne Plaza') !== false) $city = 'Dubai';
                if ($city === '' || strtoupper($city) === 'X') $city = $start ?: 'Dubai';

                $items = [];
                $itemNo = 0;

                if (!$isBlank($transportRaw) && ($depart !== '' || $arrive !== '')) {
                    $itemNo++;
                    if (strcasecmp($transportRaw, 'Car') === 0) {
                        $roadTrip = [
                            'from' => $start, 'to' => $finish, 'depart' => $depart, 'arrive' => $arrive,
                            'fromPlaceId' => '', 'fromLat' => null, 'fromLng' => null,
                            'toPlaceId' => '', 'toLat' => null, 'toLng' => null,
                            'distanceMiles' => 0, 'durationMin' => 0, 'recommendedMin' => 0,
                            'estArrival' => $arrive, 'polyline' => '', 'stops' => [],
                        ];
                        $items[] = [
                            '_id' => $makeId($dayNo, 'move', $start . '-' . $finish, $itemNo),
                            'time' => $depart, 'type' => 'move',
                            'period' => ($depart !== '' && $depart < '12:00') ? 'morning' : 'afternoon',
                            'title' => $start . ' → ' . $finish, 'sub' => 'Car Hire / Road Trip',
                            'status' => 'booked',
                            'transport' => ['mode' => 'Car Hire / Road Trip', 'hire' => null, 'roadTrip' => $roadTrip],
                            'icoType' => 'car', 'kicker' => 'Car Hire / Road Trip',
                        ];
                    } else {
                        $mode = strcasecmp($transportRaw, 'Eurostar') === 0 ? 'Train' : $transportRaw;
                        $operator = strcasecmp($transportRaw, 'Eurostar') === 0 ? 'Eurostar' : '';
                        $period = ($depart !== '' && $depart < '12:00') ? 'morning' : (($depart !== '' && $depart < '18:00') ? 'afternoon' : 'evening');
                        $subParts = array_filter([$operator ?: $mode, ($depart && $arrive) ? $depart . ' – ' . $arrive : ($depart ?: $arrive)]);
                        $items[] = [
                            '_id' => $makeId($dayNo, 'move', $start . '-' . $finish, $itemNo),
                            'time' => $depart, 'type' => 'move', 'period' => $period,
                            'title' => $start . ' → ' . $finish, 'sub' => implode(' · ', $subParts),
                            'status' => 'booked',
                            'transport' => ['mode' => $mode, 'from' => $start, 'to' => $finish, 'depart' => $depart, 'arrive' => $arrive, 'operator' => $operator, 'route' => ''],
                            'icoType' => $mode === 'Flight' ? 'plane' : 'move', 'kicker' => $mode,
                        ];
                    }
                }

                if (!$isBlank($breakfastPlace)) {
                    $itemNo++;
                    $items[] = [
                        '_id' => $makeId($dayNo, 'meal', $breakfastPlace, $itemNo),
                        'time' => '', 'type' => 'meal', 'period' => 'morning',
                        'title' => $breakfastPlace, 'sub' => '', 'status' => 'walkin', 'kicker' => 'Breakfast',
                    ];
                }

                foreach ([['morning', $morning], ['afternoon', $afternoon]] as [$period, $block]) {
                    if ($isBlank($block)) continue;
                    foreach (preg_split('/\R+/', $block) ?: [] as $line) {
                        $line = trim($line, " \t\n\r\0\x0B•");
                        if ($line === '' || strtoupper($line) === 'X' || strcasecmp($line, 'Tour Info') === 0) continue;
                        if (stripos($line, 'Breakfast in ') === 0 || stripos($line, 'Dinner at ') === 0) continue;
                        if (stripos($line, 'Drive to Dubai') === 0 && ($depart !== '' || $arrive !== '')) continue;
                        $itemNo++;
                        $itemPeriod = (stripos($line, 'fireworks') !== false || stripos($line, 'from 7pm') !== false) ? 'evening' : $period;
                        $items[] = [
                            '_id' => $makeId($dayNo, 'attraction', $line, $itemNo),
                            'time' => '', 'type' => 'attraction', 'period' => $itemPeriod,
                            'title' => $line, 'sub' => '', 'status' => null,
                        ];
                    }
                }

                if (!$isBlank($dinner)) {
                    $itemNo++;
                    $booked = !$isBlank($dinnerBooking) && strcasecmp($dinnerBooking, 'Not Possible') !== 0;
                    $items[] = [
                        '_id' => $makeId($dayNo, 'meal', $dinner, $itemNo),
                        'time' => $booked ? $timeFmt($dinnerBooking) : '',
                        'type' => 'meal', 'period' => 'evening',
                        'title' => $dinner, 'sub' => '', 'status' => $booked ? 'booked' : 'walkin', 'kicker' => 'Dinner',
                    ];
                }

                $day = ['date' => $date, 'loc' => $city, 'title' => 'Day ' . $dayNo . ' · ' . $city, 'items' => $items];
                if ($isBlank($acc)) $day['noAccommodation'] = true;
                $days[] = $day;
            }

            $hotels = [];
            foreach ($hotelSpans as $h) {
                $co = DateTime::createFromFormat('!d/m/Y', $h['last']);
                if ($co) $co->modify('+1 day');
                $ci = DateTime::createFromFormat('!d/m/Y', $h['first']);
                $nights = ($ci && $co) ? (int)$ci->diff($co)->format('%a') : 1;
                $city = '';
                if (stripos($h['name'], 'Terminus Nord') !== false) $city = 'Paris';
                elseif (stripos($h['name'], 'Hamad') !== false) $city = 'Doha';
                elseif (stripos($h['name'], 'Rove City Walk') !== false) $city = 'Dubai';
                elseif (stripos($h['name'], 'Hilton Abu Dhabi') !== false) $city = 'Abu Dhabi';
                elseif (stripos($h['name'], 'Crowne Plaza') !== false) $city = 'Dubai';
                $hotels[] = [
                    'name' => $h['name'], 'city' => $city,
                    'checkin' => $h['first'], 'checkout' => $co ? $co->format('d/m/Y') : $h['last'],
                    'nights' => $nights, 'nightly' => $h['nightly'], 'ref' => $h['ref'],
                    'breakfast' => $h['breakfast'], 'photo' => '',
                ];
            }

            $tripData = [
                'days' => $days,
                'meta' => [
                    'dest' => 'Dubai & Abu Dhabi', 'dep' => '26/12/2025', 'ret' => '09/01/2026',
                    'trav' => '2', 'status' => 'past', 'hotel' => null, 'hotels' => $hotels,
                    'budget' => null, 'coverPhoto' => '',
                ],
            ];
        }

        $pdo->beginTransaction();
        if (!$hasContent && is_array($tripData)) {
            $lockedTrip = $pdo->prepare("SELECT id FROM itinerary WHERE id = ? FOR UPDATE");
            $lockedTrip->execute(['dubai-2025']);
            $tripJson = json_encode($tripData, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            if ($tripJson === false) throw new RuntimeException('Could not encode imported trip');
            if ($lockedTrip->fetch()) {
                $pdo->prepare("UPDATE itinerary SET data = ?, updated_at = NOW() WHERE id = ?")
                    ->execute([$tripJson, 'dubai-2025']);
            } else {
                $pdo->prepare("INSERT INTO itinerary (id, data, updated_at) VALUES (?, ?, NOW())")
                    ->execute(['dubai-2025', $tripJson]);
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
            'dest' => 'Dubai & Abu Dhabi', 'dep' => '26/12/2025', 'ret' => '09/01/2026',
            'trav' => '2', 'status' => 'past', 'slug' => 'dubai-2025', 'url' => '/dubai-2025',
            'points' => [[48.8566,2.3522],[25.2854,51.5310],[25.2048,55.2708],[24.4539,54.3773]],
            'flags' => ['fr','qa','ae'], 'cities' => ['Paris','Doha','Dubai','Abu Dhabi'],
            'created' => 1766707200000, 'photo' => '',
        ];
        $found = false;
        foreach ($registry['trips'] as &$trip) {
            if (!is_array($trip) || ($trip['slug'] ?? '') !== 'dubai-2025') continue;
            $found = true;
            $trip['dest'] = $entry['dest']; $trip['dep'] = $entry['dep']; $trip['ret'] = $entry['ret'];
            $trip['status'] = 'past'; $trip['url'] = '/dubai-2025';
            if (empty($trip['cities'])) $trip['cities'] = $entry['cities'];
            if (empty($trip['flags'])) $trip['flags'] = $entry['flags'];
            if (empty($trip['points'])) $trip['points'] = $entry['points'];
            break;
        }
        unset($trip);
        if (!$found) $registry['trips'][] = $entry;

        $registryJson = json_encode($registry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($registryJson === false) throw new RuntimeException('Could not encode registry');
        if ($regRow) {
            $pdo->prepare("UPDATE itinerary SET data = ?, updated_at = NOW() WHERE id = 'trip-registry'")
                ->execute([$registryJson]);
        } else {
            $pdo->prepare("INSERT INTO itinerary (id, data, updated_at) VALUES ('trip-registry', ?, NOW())")
                ->execute([$registryJson]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
        error_log('Dubai 2025 historical import failed: ' . $e->getMessage());
    }
}

importDubai2025HistoryOnce();

// MY TRIPS — homepage renderer
// Keep the presentation in index.html but attach cache-busted critical runtimes so
// an old authentication script can never survive a security deployment.
header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

$templatePath = __DIR__ . '/index.html';
$html = @file_get_contents($templatePath);
if ($html === false) {
    http_response_code(500);
    echo '<!doctype html><title>Homepage unavailable</title><p>The homepage could not be loaded.</p>';
    exit;
}

$authVersion = @filemtime(__DIR__ . '/auth.js') ?: time();
$dbVersion = @filemtime(__DIR__ . '/db.js') ?: time();
$html = preg_replace('~src="/auth\.js\?v=[^"]+"~', 'src="/auth.js?v=' . $authVersion . '"', $html);
$html = preg_replace('~src="/db\.js\?v=[^"]+"~', 'src="/db.js?v=' . $dbVersion . '"', $html);

// index.html still references the retired generic "registry" record for the
// Holiday Planner summary. The live planner uses trip-registry via dbLoadRegistry().
// Rewrite that single compatibility call at render time so homepage counts match
// the Trips dashboard without changing or seeding any stored data.
$html = str_replace(
    "const registry = await window.dbLoad('registry');",
    "const registry = { trips: await window.dbLoadRegistry() };",
    $html,
    $registryCount
);
if ($registryCount !== 1) {
    http_response_code(500);
    echo '<!doctype html><title>Homepage unavailable</title><p>The trip summary could not be attached safely.</p>';
    exit;
}

// Add an explicit homepage logout control. It sits alongside the existing
// Private Log and Settings shortcuts, revokes the current server session, clears
// both browser session stores, then immediately returns to the PIN gate.
$logoutStyle = <<<'HTML'
<style>
  .home-logout-btn{position:fixed;top:18px;right:100px;z-index:11;height:36px;padding:0 12px;border:0;border-radius:10px;background:rgba(255,255,255,.82);color:#888;display:flex;align-items:center;justify-content:center;gap:7px;font-family:'Montserrat',sans-serif;font-size:11px;font-weight:700;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.08),0 0 0 .5px rgba(0,0,0,.05);transition:color .15s,background .15s,box-shadow .15s,transform .1s;backdrop-filter:blur(8px)}
  .home-logout-btn:hover{color:#e53e3e;background:#fff;box-shadow:0 3px 10px rgba(0,0,0,.1);transform:translateY(-1px)}
  .home-logout-btn:disabled{opacity:.55;cursor:default;transform:none}
  .home-logout-btn svg{flex:0 0 auto}
  @media(max-width:640px){.home-logout-btn{right:100px;width:36px;padding:0}.home-logout-label{display:none}}
</style>
HTML;

$logoutButton = <<<'HTML'
<button class="home-logout-btn" id="home-logout-btn" type="button" title="Log out" aria-label="Log out">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
  <span class="home-logout-label">Log out</span>
</button>
HTML;

$logoutScript = <<<'HTML'
<script>
(() => {
  const button = document.getElementById('home-logout-btn');
  if (!button) return;

  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    const label = button.querySelector('.home-logout-label');
    if (label) label.textContent = 'Logging out…';

    let token = '';
    try {
      const raw = localStorage.getItem('jh_auth') || sessionStorage.getItem('jh_auth') || 'null';
      token = JSON.parse(raw)?.sessionToken || '';
    } catch {}

    try {
      if (token) {
        await fetch('/auth-v2.php?action=logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
          cache: 'no-store',
          credentials: 'same-origin',
          body: '{}'
        });
      }
    } catch {}

    try { localStorage.removeItem('jh_auth'); } catch {}
    try { sessionStorage.removeItem('jh_auth'); } catch {}
    window._mytripsAuthed = false;

    const existingOverlay = document.getElementById('pin-overlay');
    if (existingOverlay) existingOverlay.remove();
    if (typeof window.showPinOverlay === 'function') {
      window.showPinOverlay();
    } else {
      location.reload();
    }
  });
})();
</script>
HTML;

$headCount = 0;
$html = str_replace('</head>', $logoutStyle . "\n</head>", $html, $headCount);
$bodyOpenCount = 0;
$html = str_replace('<body>', '<body>' . "\n" . $logoutButton, $html, $bodyOpenCount);
$bodyCloseCount = 0;
$html = str_replace('</body>', $logoutScript . "\n</body>", $html, $bodyCloseCount);
if ($headCount !== 1 || $bodyOpenCount !== 1 || $bodyCloseCount !== 1) {
    http_response_code(500);
    echo '<!doctype html><title>Homepage unavailable</title><p>The homepage controls could not be attached safely.</p>';
    exit;
}

echo $html;
