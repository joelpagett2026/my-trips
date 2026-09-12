<?php
require_once __DIR__ . '/db-config.php';

// Historical itinerary cleanup: Dubai 2025/26 and China 2026 were imported from
// spreadsheets where sightseeing rows were originally stored as ticketed
// attractions. They are itinerary places, so normalise them to Point of Interest
// records. The migration is idempotent and only touches attraction/ticket items;
// transport, hotels and meals are left unchanged.
function normalizeHistoricalThingsToPointsOfInterest(): void {
    $pdo = null;
    try {
        $pdo = db();
        $pdo->beginTransaction();

        $select = $pdo->prepare("SELECT data FROM itinerary WHERE id = ? FOR UPDATE");
        $update = $pdo->prepare("UPDATE itinerary SET data = ?, updated_at = NOW() WHERE id = ?");

        foreach (['dubai-2025', 'china-2026'] as $tripId) {
            $select->execute([$tripId]);
            $row = $select->fetch();
            if (!$row || !is_string($row['data'] ?? null)) continue;

            $data = json_decode((string)$row['data'], true);
            if (!is_array($data) || !is_array($data['days'] ?? null)) continue;

            $changed = false;
            foreach ($data['days'] as &$day) {
                if (!is_array($day) || !is_array($day['items'] ?? null)) continue;
                foreach ($day['items'] as &$item) {
                    if (!is_array($item)) continue;
                    $type = strtolower(trim((string)($item['type'] ?? '')));
                    if (!in_array($type, ['attraction', 'ticket'], true)) continue;

                    $item['type'] = 'place';
                    $item['status'] = null;

                    // Point-of-interest records may retain a useful website or
                    // note, but no longer carry ticket/booking identifiers or
                    // prices simply because they came from the spreadsheet.
                    if (isset($item['booking']) && is_array($item['booking'])) {
                        $note = trim((string)($item['booking']['note'] ?? ''));
                        $url  = trim((string)($item['booking']['url'] ?? ''));
                        if ($note !== '' || $url !== '') {
                            $item['booking'] = [
                                'ref' => '', 'price' => '', 'tickets' => '',
                                'url' => $url, 'note' => $note,
                            ];
                        } else {
                            unset($item['booking']);
                        }
                    }

                    if (isset($item['kicker'])) {
                        $kicker = strtolower(trim((string)$item['kicker']));
                        if (in_array($kicker, ['attraction', 'ticket', 'activity', 'things to do'], true)) {
                            unset($item['kicker']);
                        }
                    }
                    if (isset($item['icoType'])) {
                        $icoType = strtolower(trim((string)$item['icoType']));
                        if (in_array($icoType, ['ticket', 'attraction'], true)) $item['icoType'] = 'pin';
                    }

                    $changed = true;
                }
                unset($item);
            }
            unset($day);

            if ($changed) {
                $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
                if ($json === false) throw new RuntimeException('Could not encode historical POI migration');
                $update->execute([$json, $tripId]);
            }
        }

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
        error_log('Historical POI normalisation failed: ' . $e->getMessage());
    }
}

normalizeHistoricalThingsToPointsOfInterest();

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

// Small production polish layer for the redesigned dashboard. Keep this isolated
// in the renderer so the source template remains compatible with the existing
// homepage runtime contract while live data edge cases are normalised safely.
$dashboardPolishStyle = <<<'HTML'
<style id="homepage-dashboard-polish">
  .coming-copy{min-width:0;flex:1;display:block;line-height:1.15}
  .coming-label{display:block;font-size:9.5px;font-weight:700;color:#485357;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .coming-value{display:block;margin-top:4px}
  .coming-meta{display:block;margin-top:3px;font-size:8.5px}

  /* Theme Park Tracker uses the same green family as Attractions. Scope the
     colour to the two homepage links only so every other dashboard card keeps
     its own palette. */
  a.dash-card[href="/parks/"] .card-head-icon,
  a.coming-item[href="/parks/"] .coming-icon{
    color:#6c8966!important;
    background:#edf1ed!important;
  }
  a.dash-card[href="/parks/"] .card-arrow,
  a.dash-card[href="/parks/"] .pill,
  a.dash-card[href="/parks/"] .event-countdown,
  a.dash-card[href="/parks/"] .wide-stats .stat-val,
  a.coming-item[href="/parks/"] .coming-value{
    color:#6c8966!important;
  }
  a.dash-card[href="/parks/"] .pill{
    background:#edf1ed!important;
  }
  a.dash-card[href="/parks/"] .media-placeholder.park{
    background:linear-gradient(135deg,#849b7f,#4f684b 75%)!important;
  }

  /* Holiday Allowance uses its own muted purple family. Keep this scoped to the
     Holiday card and Coming Up item so Trip Planning stays teal. */
  a.dash-card[href="/holidays/"] .card-head-icon,
  a.dash-card[href="/holidays/"] .initials,
  a.coming-item[href="/holidays/"] .coming-icon{
    color:#76699f!important;
    background:#f0edf7!important;
  }
  a.dash-card[href="/holidays/"] .card-arrow,
  a.dash-card[href="/holidays/"] .allow-stat.used strong,
  a.dash-card[href="/holidays/"] .allow-stat.remain strong,
  a.coming-item[href="/holidays/"] .coming-value{
    color:#76699f!important;
  }
  a.dash-card[href="/holidays/"] .progress > span{
    background:linear-gradient(90deg,#76699f,#9182bd)!important;
  }
</style>
HTML;

$dashboardPolishScript = <<<'HTML'
<script id="homepage-dashboard-polish-runtime">
(() => {
  // Registry trip dates are historically a mix of dd/mm/yyyy and ISO strings.
  // Normalise both so upcoming/completed counts and the next-trip card stay live.
  safeDate = function(d) {
    if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : new Date(d.getTime());
    const s = String(d || '').trim();
    if (!s) return null;
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const x = new Date(s);
    return Number.isNaN(x.getTime()) ? null : x;
  };

  // Shows can be stored as either full dates or month/year. Avoid awkward
  // "0 months" wording when an event is this month.
  loadShows = async function() {
    try {
      const rec = await window.dbLoad('shows');
      const list = rec && Array.isArray(rec.list) ? rec.list : [];
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const upcoming = list.filter(c => { const d = parseMY(c.date); return d && d >= monthStart; })
                           .sort((a,b) => parseMY(a.date) - parseMY(b.date));
      const seen = list.filter(c => { const d = parseMY(c.date); return !d || d < monthStart; });
      setText('sh-shows', seen.length);
      setText('sh-theatres', new Set(seen.map(c => (c.theatre || '').trim().toLowerCase()).filter(Boolean)).size);
      setText('sh-year', seen.filter(c => (c.date || '').includes(String(now.getFullYear()))).length);
      const latest = seen.filter(c => parseMY(c.date)).sort((a,b) => parseMY(b.date) - parseMY(a.date))[0];
      const next = upcoming[0];
      const lead = next || latest;
      if (lead) {
        const isNext = !!next;
        const d = parseMY(lead.date);
        const exactDay = /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(lead.date || '').trim());
        let showCountdown = '';
        if (isNext) {
          if (exactDay) {
            const days = daysUntil(d);
            showCountdown = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : countdownText(days);
          } else {
            const months = monthsUntil(d);
            showCountdown = months === 0 ? 'This month' : months === 1 ? 'Next month' : countdownText(months, 'month');
          }
        }
        $('show-pill').textContent = isNext ? 'Upcoming' : 'Latest';
        setText('show-name', lead.name || 'Show');
        setText('show-place', [lead.theatre, lead.location].filter(Boolean).join(', '));
        $('show-countdown').textContent = isNext ? showCountdown + ' ·' : '';
        $('show-date').textContent = fmtMY(lead.date);
        if (lead.thumb) setImg('show-img', lead.thumb);
        setText('cu-show-value', isNext ? showCountdown : 'No upcoming');
        setText('cu-show-meta', isNext ? (lead.name || 'Next show') : (latest ? `Latest: ${latest.name || 'Show'}` : 'No shows logged'));
      } else {
        setText('show-name', 'No shows logged');
        setText('show-place', 'Add your next show');
        setText('cu-show-value', 'Nothing booked');
        setText('cu-show-meta', 'Add your next show');
        $('show-countdown').textContent = '';
        $('show-date').textContent = '';
      }
    } catch(e) {
      ['sh-shows','sh-theatres','sh-year','show-name','show-place','cu-show-value','cu-show-meta'].forEach(id => setText(id,'—'));
    }
  };

  // Park coaster entries support both legacy strings and current object records.
  // The previous dashboard assumed strings, which caused the whole card to fail.
  loadParks = async function() {
    try {
      const rec = await window.dbLoad('parks');
      const list = rec && Array.isArray(rec.list) ? rec.list : [];
      const today = new Date(); today.setHours(0,0,0,0);
      const upcoming = list.filter(v => { const d = parseDMY(v.date); return d && d > today; })
                           .sort((a,b) => parseDMY(a.date) - parseDMY(b.date));
      const seen = list.filter(v => { const d = parseDMY(v.date); return !d || d <= today; });
      const credits = new Set();
      const coasterName = c => typeof c === 'string'
        ? c.replace(/\s*\*\s*$/, '').trim()
        : String(c?.name || '').trim();
      seen.forEach(v => (Array.isArray(v.coasters) ? v.coasters : []).forEach(c => {
        const name = coasterName(c);
        if (name) credits.add((v.park || '').trim().toLowerCase() + '|' + name.toLowerCase());
      }));
      setText('pk-parks', new Set(seen.map(v => (v.park || '').trim().toLowerCase()).filter(Boolean)).size);
      setText('pk-credits', credits.size);
      setText('pk-year', seen.filter(v => { const d = parseDMY(v.date); return d && d.getFullYear() === new Date().getFullYear(); }).length);
      const latest = seen.filter(v => parseDMY(v.date)).sort((a,b) => parseDMY(b.date) - parseDMY(a.date))[0];
      const next = upcoming[0];
      const lead = next || latest;
      if (lead) {
        const isNext = !!next;
        const d = parseDMY(lead.date);
        const days = isNext ? daysUntil(d) : null;
        $('park-pill').textContent = isNext ? 'Upcoming' : 'Latest';
        setText('park-name', lead.park || 'Theme park');
        setText('park-place', [lead.location, lead.country].map(s => (s || '').trim()).filter(Boolean).join(', '));
        $('park-countdown').textContent = isNext ? countdownText(days) + ' ·' : '';
        $('park-date').textContent = lead.date || '';
        if (lead.thumb) setImg('park-img', lead.thumb);
        setText('cu-park-value', isNext ? countdownText(days) : 'No upcoming');
        setText('cu-park-meta', isNext ? (lead.park || 'Next park visit') : (latest ? `Latest: ${latest.park || 'Park'}` : 'No parks logged'));
      } else {
        $('park-pill').textContent = 'No visits';
        setText('park-name', 'No park visits logged');
        setText('park-place', 'Add your next park');
        setText('cu-park-value', 'Nothing booked');
        setText('cu-park-meta', 'Add your next park');
        $('park-countdown').textContent = '';
        $('park-date').textContent = '';
      }
    } catch(e) {
      ['pk-parks','pk-credits','pk-year','park-name','park-place','cu-park-value','cu-park-meta'].forEach(id => setText(id,'—'));
    }
  };
})();
</script>
HTML;

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
$html = str_replace('</head>', $dashboardPolishStyle . "\n" . $logoutStyle . "\n</head>", $html, $headCount);
$bodyOpenCount = 0;
$html = str_replace('<body>', '<body>' . "\n" . $logoutButton, $html, $bodyOpenCount);
$bodyCloseCount = 0;
$html = str_replace('</body>', $dashboardPolishScript . "\n" . $logoutScript . "\n</body>", $html, $bodyCloseCount);
if ($headCount !== 1 || $bodyOpenCount !== 1 || $bodyCloseCount !== 1) {
    http_response_code(500);
    echo '<!doctype html><title>Homepage unavailable</title><p>The homepage controls could not be attached safely.</p>';
    exit;
}

echo $html;