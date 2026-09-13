<?php
header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

$core = __DIR__ . '/home-core.php';
if (is_file($core)) {
    ob_start();
    include $core;
    $page = ob_get_clean();
} else {
    // Recovery-safe fallback: render directly from the checked-in homepage source.
    // This keeps production usable even if a deployment ever copies home.php before
    // its optional helper file.
    $templatePath = __DIR__ . '/index.html';
    $page = @file_get_contents($templatePath);
    if ($page === false) {
        http_response_code(500);
        echo '<!doctype html><title>Homepage unavailable</title><p>The homepage template could not be loaded.</p>';
        exit;
    }

    $authVersion = @filemtime(__DIR__ . '/auth.js') ?: time();
    $dbVersion = @filemtime(__DIR__ . '/db.js') ?: time();
    $page = preg_replace('~src="/auth\\.js\\?v=[^"]+"~', 'src="/auth.js?v=' . $authVersion . '"', $page);
    $page = preg_replace('~src="/db\\.js\\?v=[^"]+"~', 'src="/db.js?v=' . $dbVersion . '"', $page);

    $page = str_replace(
        "const registry = await window.dbLoad('registry');",
        "const registry = { trips: await window.dbLoadRegistry() };",
        $page,
        $registryCount
    );
    if ($registryCount !== 1) {
        http_response_code(500);
        echo '<!doctype html><title>Homepage unavailable</title><p>The trip summary could not be attached safely.</p>';
        exit;
    }

    $quickLinksPanel = <<<'HTML'
<section class="coming-panel quick-links-panel">
  <div class="section-head">
    <div>
      <div class="section-title">Quick links</div>
      <div class="section-sub">Jump straight to a section</div>
    </div>
  </div>
  <div class="coming-grid">
    <a class="coming-item" href="/trips/"><span class="coming-icon"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 9 15"/><path d="m22 2-7 20-4-9-9-4Z"/></svg></span><span class="coming-copy"><span class="coming-label">Trips</span></span><span class="mini-arrow">›</span></a>
    <a class="coming-item" href="/holidays/"><span class="coming-icon orange"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span><span class="coming-copy"><span class="coming-label">Holiday Tracker</span></span><span class="mini-arrow">›</span></a>
    <a class="coming-item" href="/concerts/"><span class="coming-icon"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M18 10v1a6 6 0 0 1-12 0v-1"/></svg></span><span class="coming-copy"><span class="coming-label">Concert Log</span></span><span class="mini-arrow">›</span></a>
    <a class="coming-item" href="/shows/"><span class="coming-icon purple"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 9.5a2.5 2.5 0 0 1 0 5V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3.5a2.5 2.5 0 0 1 0-5V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/></svg></span><span class="coming-copy"><span class="coming-label">Show Tracker</span></span><span class="mini-arrow">›</span></a>
    <a class="coming-item" href="/parks/"><span class="coming-icon green"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 21h20"/><path d="M4 21V9a3 3 0 0 1 6 0c0 6 2 9 5 9s5-4 5-10"/></svg></span><span class="coming-copy"><span class="coming-label">Theme Parks</span></span><span class="mini-arrow">›</span></a>
  </div>
</section>
HTML;
    $page = preg_replace('~<section class="coming-panel">.*?</section>~s', $quickLinksPanel, $page, 1, $quickLinksCount);
    if ($quickLinksCount !== 1) {
        http_response_code(500);
        echo '<!doctype html><title>Homepage unavailable</title><p>The quick links could not be attached safely.</p>';
        exit;
    }

    $fallbackPolish = <<<'CSS'
.quick-links-panel .section-head{padding-bottom:12px}.quick-links-panel .coming-item{min-height:64px;padding:14px 16px}.quick-links-panel .coming-label{font-size:12.5px;font-weight:800;color:#263238}.quick-links-panel .mini-arrow{margin-left:auto;font-size:22px;line-height:1;color:#a7b0b3}.quick-links-panel a[href="/holidays/"] .coming-icon{color:#76699f!important;background:#f0edf7!important}.quick-links-panel a[href="/concerts/"] .coming-icon{color:#c9792b!important;background:#fff1e6!important}.quick-links-panel a[href="/shows/"] .coming-icon{color:#4f78a8!important;background:#eaf1f7!important}.quick-links-panel a[href="/parks/"] .coming-icon{color:#6c8966!important;background:#edf1ed!important}
CSS;
    $page = str_ireplace('</head>', "<style id=\"homepage-fallback-polish\">{$fallbackPolish}</style>\n</head>", $page);
}

// Keep the renderer contract explicit here: the served homepage must use the
// authoritative trip registry, whether it came from home-core.php or the fallback.
$registryNeedle = "const registry = { trips: await window.dbLoadRegistry() };";
$registryCount = substr_count($page, $registryNeedle);
if ($registryCount !== 1) {
    http_response_code(500);
    echo '<!doctype html><title>Homepage unavailable</title><p>The trip summary could not be attached safely.</p>';
    exit;
}

$theme = <<<'CSS'
/* Full colour-backed treatment for the five main homepage sections. */
.main-grid > a.dash-card[href="/trips/"],
.main-grid > a.dash-card[href="/holidays/"],
.main-grid > a.dash-card[href="/concerts/"],
.main-grid > a.dash-card[href="/shows/"],
.main-grid > a.dash-card[href="/parks/"]{
  color:#fff!important;
  border-color:rgba(255,255,255,.16)!important;
  box-shadow:0 12px 32px rgba(39,54,58,.11),0 2px 5px rgba(39,54,58,.08)!important;
}
.main-grid > a.dash-card[href="/trips/"]{background:linear-gradient(145deg,#0d8794 0%,#087582 58%,#096b76 100%)!important}
.main-grid > a.dash-card[href="/holidays/"]{background:linear-gradient(145deg,#8271ad 0%,#73639d 58%,#68598f 100%)!important}
.main-grid > a.dash-card[href="/concerts/"]{background:linear-gradient(145deg,#d58a42 0%,#c9792b 58%,#b96c22 100%)!important}
.main-grid > a.dash-card[href="/shows/"]{background:linear-gradient(145deg,#6289b6 0%,#4f78a8 58%,#456b98 100%)!important}
.main-grid > a.dash-card[href="/parks/"]{background:linear-gradient(145deg,#7f9979 0%,#6c8966 58%,#5e7b59 100%)!important}

.main-grid > a.dash-card[href="/trips/"] .card-title,
.main-grid > a.dash-card[href="/holidays/"] .card-title,
.main-grid > a.dash-card[href="/concerts/"] .card-title,
.main-grid > a.dash-card[href="/shows/"] .card-title,
.main-grid > a.dash-card[href="/parks/"] .card-title,
.main-grid > a.dash-card[href="/holidays/"] .person-name,
.main-grid > a.dash-card[href="/concerts/"] .event-title,
.main-grid > a.dash-card[href="/shows/"] .event-title,
.main-grid > a.dash-card[href="/parks/"] .event-title{color:#fff!important}

.main-grid > a.dash-card[href="/trips/"] .card-sub,
.main-grid > a.dash-card[href="/holidays/"] .card-sub,
.main-grid > a.dash-card[href="/concerts/"] .card-sub,
.main-grid > a.dash-card[href="/shows/"] .card-sub,
.main-grid > a.dash-card[href="/parks/"] .card-sub,
.main-grid > a.dash-card[href="/holidays/"] .person-period,
.main-grid > a.dash-card[href="/holidays/"] .allow-stat span,
.main-grid > a.dash-card[href="/holidays/"] .progress-copy,
.main-grid > a.dash-card[href="/concerts/"] .event-line,
.main-grid > a.dash-card[href="/shows/"] .event-line,
.main-grid > a.dash-card[href="/parks/"] .event-line,
.main-grid > a.dash-card[href="/concerts/"] .stat-lbl,
.main-grid > a.dash-card[href="/shows/"] .stat-lbl,
.main-grid > a.dash-card[href="/parks/"] .stat-lbl{color:rgba(255,255,255,.74)!important}

.main-grid > a.dash-card[href="/trips/"] .card-head-icon,
.main-grid > a.dash-card[href="/holidays/"] .card-head-icon,
.main-grid > a.dash-card[href="/concerts/"] .card-head-icon,
.main-grid > a.dash-card[href="/shows/"] .card-head-icon,
.main-grid > a.dash-card[href="/parks/"] .card-head-icon,
.main-grid > a.dash-card[href="/holidays/"] .initials{
  color:#fff!important;
  background:rgba(255,255,255,.16)!important;
}
.main-grid > a.dash-card[href="/holidays/"] .initials.gray{color:#fff!important;background:rgba(255,255,255,.12)!important}
.main-grid > a.dash-card[href="/trips/"] .card-arrow,
.main-grid > a.dash-card[href="/holidays/"] .card-arrow,
.main-grid > a.dash-card[href="/concerts/"] .card-arrow,
.main-grid > a.dash-card[href="/shows/"] .card-arrow,
.main-grid > a.dash-card[href="/parks/"] .card-arrow{color:rgba(255,255,255,.9)!important}

body .main-grid > a.dash-card[href="/trips/"] .travel-stats-row{
  background:rgba(255,255,255,.95)!important;
  border-color:rgba(255,255,255,.42)!important;
  box-shadow:0 8px 24px rgba(4,67,75,.11)!important;
}

body .main-grid > a.dash-card[href="/holidays/"] .person + .person,
body .main-grid > a.dash-card[href="/holidays/"] .allow-stat{border-color:rgba(255,255,255,.18)!important}
.main-grid > a.dash-card[href="/holidays/"] .allow-stat.used strong,
.main-grid > a.dash-card[href="/holidays/"] .allow-stat.remain strong{color:#fff!important}
.main-grid > a.dash-card[href="/holidays/"] .progress{background:rgba(255,255,255,.18)!important}
.main-grid > a.dash-card[href="/holidays/"] .progress > span{background:linear-gradient(90deg,rgba(255,255,255,.98),rgba(255,255,255,.70))!important}

.main-grid > a.dash-card[href="/concerts/"] .pill,
.main-grid > a.dash-card[href="/shows/"] .pill,
.main-grid > a.dash-card[href="/parks/"] .pill{color:#fff!important;background:rgba(255,255,255,.16)!important}
.main-grid > a.dash-card[href="/concerts/"] .event-countdown,
.main-grid > a.dash-card[href="/shows/"] .event-countdown,
.main-grid > a.dash-card[href="/parks/"] .event-countdown,
.main-grid > a.dash-card[href="/concerts/"] .stat-val,
.main-grid > a.dash-card[href="/shows/"] .stat-val,
.main-grid > a.dash-card[href="/parks/"] .stat-val{color:#fff!important}
body .main-grid > a.dash-card[href="/concerts/"] .event-stats,
body .main-grid > a.dash-card[href="/shows/"] .wide-stats,
body .main-grid > a.dash-card[href="/parks/"] .wide-stats,
body .main-grid > a.dash-card[href="/concerts/"] .stat,
body .main-grid > a.dash-card[href="/shows/"] .stat,
body .main-grid > a.dash-card[href="/parks/"] .stat{border-color:rgba(255,255,255,.18)!important}

.main-grid > a.dash-card[href="/holidays/"] .skeleton,
.main-grid > a.dash-card[href="/concerts/"] .skeleton,
.main-grid > a.dash-card[href="/shows/"] .skeleton,
.main-grid > a.dash-card[href="/parks/"] .skeleton{
  background:linear-gradient(90deg,rgba(255,255,255,.12) 25%,rgba(255,255,255,.22) 37%,rgba(255,255,255,.12) 63%)!important;
  background-size:400% 100%!important;
}

@media (max-width:800px){
  .main-grid > a.dash-card[href="/trips/"],
  .main-grid > a.dash-card[href="/holidays/"],
  .main-grid > a.dash-card[href="/concerts/"],
  .main-grid > a.dash-card[href="/shows/"],
  .main-grid > a.dash-card[href="/parks/"]{box-shadow:0 8px 24px rgba(39,54,58,.10)!important}
}
CSS;

if (stripos($page, '</head>') === false) {
    echo $page;
    exit;
}

echo str_ireplace('</head>', "<style id=\"homepage-section-colours\">\n{$theme}\n</style>\n</head>", $page);
