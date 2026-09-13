<?php
// Section renderer for Theme Park Tracker, Holiday Allowance, Concert Log and Shows.
require_once __DIR__ . '/template-runtime.php';

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

function applySectionPalette(string $source, array $replacement): string {
    return str_ireplace(array_keys($replacement), array_values($replacement), $source);
}

function attachMobileCenteredNavTitle(string $source, string $label): string {
    $mobileNavStyle = <<<'HTML'
<style id="mobile-centered-nav-title">
@media (max-width: 700px), (display-mode: standalone) and (max-width: 900px) {
  .nav {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) !important;
    align-items: center !important;
  }
  .nav .nav-back {
    justify-self: start !important;
    min-width: 0;
    max-width: 100%;
  }
  .nav .nav-title {
    justify-self: center !important;
    text-align: center !important;
    white-space: nowrap;
    line-height: 1.2;
  }
  .nav .nav-actions {
    justify-self: end !important;
    min-width: 0;
    max-width: 100%;
  }
}
</style>
HTML;

    $source = str_replace('</head>', $mobileNavStyle . "\n</head>", $source, $headCount);
    if ($headCount !== 1) {
        http_response_code(500);
        echo $label . ' mobile navigation could not be attached.';
        exit;
    }
    return $source;
}

function attachMobileScrollToBottom(string $source, string $colour, string $label): string {
    $widget = <<<HTML
<style id="mobile-scroll-bottom-style">
#mobile-scroll-bottom { display:none; }
@media (max-width:700px), (display-mode:standalone) and (max-width:900px) {
  #mobile-scroll-bottom {
    position:fixed;
    right:18px;
    bottom:calc(18px + env(safe-area-inset-bottom));
    width:48px;
    height:48px;
    border:0;
    border-radius:50%;
    background:{$colour};
    color:#fff;
    display:flex;
    align-items:center;
    justify-content:center;
    box-shadow:0 7px 22px rgba(0,0,0,.22),0 1px 4px rgba(0,0,0,.18);
    z-index:460;
    cursor:pointer;
    -webkit-tap-highlight-color:transparent;
    transition:opacity .18s ease,transform .18s ease;
  }
  #mobile-scroll-bottom:active { transform:scale(.94); }
  #mobile-scroll-bottom.is-hidden { opacity:0; pointer-events:none; transform:translateY(8px); }
  #mobile-scroll-bottom svg { width:22px; height:22px; }
}
</style>
<script id="mobile-scroll-bottom-script">
(() => {
  const install = () => {
    const isMobileBrowser = window.matchMedia('(max-width: 700px)').matches;
    const isStandalone = window.navigator.standalone === true
      || window.matchMedia('(display-mode: standalone)').matches;
    if (!isMobileBrowser && !(isStandalone && window.innerWidth <= 900)) return;
    if (document.getElementById('mobile-scroll-bottom')) return;

    const button = document.createElement('button');
    button.id = 'mobile-scroll-bottom';
    button.type = 'button';
    button.setAttribute('aria-label', 'Scroll to bottom');
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

    const syncVisibility = () => {
      const scroller = document.scrollingElement || document.documentElement;
      const maxScroll = Math.max(0, scroller.scrollHeight - window.innerHeight);
      button.classList.toggle('is-hidden', window.scrollY >= maxScroll - 28 || maxScroll < 80);
    };

    button.addEventListener('click', () => {
      const scroller = document.scrollingElement || document.documentElement;
      window.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
    });
    window.addEventListener('scroll', syncVisibility, { passive:true });
    window.addEventListener('resize', syncVisibility, { passive:true });
    document.body.appendChild(button);
    requestAnimationFrame(syncVisibility);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once:true });
  } else {
    install();
  }
})();
</script>
HTML;

    // Install in the document head. The script waits for DOMContentLoaded before
    // touching <body>, so this works even when a source template has a non-standard
    // or missing closing body tag. Never replace the whole page with an error just
    // because presentation-only scroll controls cannot find </body>.
    $source = str_replace('</head>', $widget . "\n</head>", $source, $headCount);
    if ($headCount !== 1) {
        $source .= "\n" . $widget;
    }
    return $source;
}

function attachParkMobileFullscreenDetail(string $source): string {
    $enhancement = <<<'HTML'
<style id="park-mobile-fullscreen-detail">
@media (max-width: 700px), (display-mode: standalone) and (max-width: 900px) {
  .detail-overlay {
    padding: 0 !important;
    align-items: flex-start !important;
    justify-content: stretch !important;
    background: #ffffff !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch;
  }
  .detail-card {
    width: 100% !important;
    max-width: none !important;
    min-height: 100vh !important;
    min-height: 100dvh !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }
  .detail-photo { width: 100% !important; }
  .detail-body {
    padding: 20px 18px calc(28px + env(safe-area-inset-bottom)) !important;
  }
  .detail-close {
    top: calc(12px + env(safe-area-inset-top)) !important;
    right: 12px !important;
  }
  html.park-detail-open #mobile-scroll-bottom {
    opacity: 0 !important;
    pointer-events: none !important;
  }

  /* Give Concert and Shows headings more breathing room in full-screen detail. */
  body:has(.concerts-grid) .detail-body > .detail-name,
  body:has(.shows-grid) .detail-body > .detail-name {
    line-height: 1.24 !important;
    margin-bottom: 10px !important;
  }
  body:has(.concerts-grid) .detail-body > .detail-pill-row,
  body:has(.shows-grid) .detail-body > .detail-pill-row {
    margin-top: 0 !important;
    margin-bottom: 10px !important;
  }
  body:has(.concerts-grid) .detail-body > .detail-tour {
    margin-top: 0 !important;
    margin-bottom: 12px !important;
    line-height: 1.4 !important;
  }
  body:has(.shows-grid) .detail-body > .s-card-comedian {
    margin-top: 12px !important;
    margin-bottom: 5px !important;
    line-height: 1.4 !important;
  }
  body:has(.concerts-grid) .detail-body > .detail-meta,
  body:has(.shows-grid) .detail-body > .detail-meta {
    margin-top: 12px !important;
    line-height: 1.4 !important;
  }
}
html.park-detail-open,
html.park-detail-open body {
  overflow: hidden !important;
}
</style>
<script id="park-mobile-fullscreen-detail-script">
(() => {
  const install = () => {
    const isMobileBrowser = window.matchMedia('(max-width: 700px)').matches;
    const isStandalone = window.navigator.standalone === true
      || window.matchMedia('(display-mode: standalone)').matches;
    if (!isMobileBrowser && !(isStandalone && window.innerWidth <= 900)) return;

    const originalOpen = window.openDetail;
    const originalClose = window.closeDetail;
    if (typeof originalOpen !== 'function' || typeof originalClose !== 'function') return;
    if (originalOpen.__parkFullscreenDetail) return;

    const wrappedOpen = function(id) {
      const result = originalOpen(id);
      document.documentElement.classList.add('park-detail-open');
      const overlay = document.getElementById('detail-overlay');
      if (overlay) overlay.scrollTop = 0;
      return result;
    };
    wrappedOpen.__parkFullscreenDetail = true;

    window.openDetail = wrappedOpen;
    window.closeDetail = function() {
      document.documentElement.classList.remove('park-detail-open');
      return originalClose();
    };
    window.addEventListener('pagehide', () => {
      document.documentElement.classList.remove('park-detail-open');
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once:true });
  } else {
    install();
  }
})();
</script>
HTML;

    $source = str_replace('</head>', $enhancement . "\n</head>", $source, $headCount);
    if ($headCount !== 1) {
        $source .= "\n" . $enhancement;
    }
    return $source;
}

$parkPalette = [
    '#0e7a87' => '#6c8966', '#12a0af' => '#7f9d77', '#11a8b9' => '#7f9d77',
    '#0a6570' => '#55704f', '#0e3a3f' => '#40513c', '#1a2a2a' => '#2d382b',
    '#f4fafb' => '#f4f7f3', '#e6f9f7' => '#edf3eb', '#dfe5e5' => '#e4e9e2',
    'rgba(14,122,135,' => 'rgba(108,137,102,', 'rgba(18,160,175,' => 'rgba(127,157,119,',
    'rgba(17,168,185,' => 'rgba(127,157,119,', 'rgba(10,101,112,' => 'rgba(85,112,79,',
    'rgb(14,122,135)' => 'rgb(108,137,102)', 'rgb(18,160,175)' => 'rgb(127,157,119)',
    'rgb(17,168,185)' => 'rgb(127,157,119)', 'rgb(10,101,112)' => 'rgb(85,112,79)',
];

$holidayPalette = [
    '#0e7a87' => '#76699f', '#12a0af' => '#9182bd', '#11a8b9' => '#9182bd',
    '#0a6570' => '#5f5484', '#0e3a3f' => '#453c65', '#1a2a2a' => '#312d3c',
    '#f4fafb' => '#f6f4fa', '#e6f9f7' => '#f0edf7', '#dfe5e5' => '#e8e4f0',
    'rgba(14,122,135,' => 'rgba(118,105,159,', 'rgba(18,160,175,' => 'rgba(145,130,189,',
    'rgba(17,168,185,' => 'rgba(145,130,189,', 'rgba(10,101,112,' => 'rgba(95,84,132,',
    'rgb(14,122,135)' => 'rgb(118,105,159)', 'rgb(18,160,175)' => 'rgb(145,130,189)',
    'rgb(17,168,185)' => 'rgb(145,130,189)', 'rgb(10,101,112)' => 'rgb(95,84,132)',
];

$concertPalette = [
    '#0e7a87' => '#c9792b', '#12a0af' => '#dc9351', '#11a8b9' => '#dc9351',
    '#0a6570' => '#9f5e22', '#0e3a3f' => '#704116', '#1a2a2a' => '#3c3128',
    '#f4fafb' => '#fff8f2', '#e6f9f7' => '#fff1e6', '#dfe5e5' => '#f3e5d8',
    'rgba(14,122,135,' => 'rgba(201,121,43,', 'rgba(18,160,175,' => 'rgba(220,147,81,',
    'rgba(17,168,185,' => 'rgba(220,147,81,', 'rgba(10,101,112,' => 'rgba(159,94,34,',
    'rgb(14,122,135)' => 'rgb(201,121,43)', 'rgb(18,160,175)' => 'rgb(220,147,81)',
    'rgb(17,168,185)' => 'rgb(220,147,81)', 'rgb(10,101,112)' => 'rgb(159,94,34)',
];

$showPalette = [
    '#0e7a87' => '#4f78a8', '#12a0af' => '#6b91bd', '#11a8b9' => '#6b91bd',
    '#0a6570' => '#3d5f86', '#0e3a3f' => '#2f4767', '#1a2a2a' => '#29313a',
    '#f4fafb' => '#f2f6fa', '#e6f9f7' => '#eaf1f7', '#dfe5e5' => '#dfe8f0',
    'rgba(14,122,135,' => 'rgba(79,120,168,', 'rgba(18,160,175,' => 'rgba(107,145,189,',
    'rgba(17,168,185,' => 'rgba(107,145,189,', 'rgba(10,101,112,' => 'rgba(61,95,134,',
    'rgb(14,122,135)' => 'rgb(79,120,168)', 'rgb(18,160,175)' => 'rgb(107,145,189)',
    'rgb(17,168,185)' => 'rgb(107,145,189)', 'rgb(10,101,112)' => 'rgb(61,95,134)',
    'rgba(255,149,0,0.18)' => 'rgba(82,107,130,0.10)', '#c07000' => '#526b82',
    'rgba(255,149,0,0.25)' => 'rgba(82,107,130,0.22)',
];

$privatePalette = [
    '#0e7a87' => '#8f2f36', '#0a6570' => '#8f2f36', '#0fbdcf' => '#d66b70',
    '#12a0af' => '#d66b70', '#11a8b9' => '#d66b70',
    'rgba(14,122,135,' => 'rgba(143,47,54,', 'rgba(10,101,112,' => 'rgba(143,47,54,',
    'rgba(15,189,207,' => 'rgba(214,107,112,',
    'rgb(14,122,135)' => 'rgb(143,47,54)', 'rgb(10,101,112)' => 'rgb(143,47,54)',
    'rgb(15,189,207)' => 'rgb(214,107,112)',
];

function renderSharedCssSection(string $templatePath, array $palette, string $styleId, string $label, ?string $scrollColour = null, bool $fullscreenDetail = false): void {
    $template = @file_get_contents($templatePath);
    $sharedCss = @file_get_contents(__DIR__ . '/holidays/holiday-style.css');
    if ($template === false || $sharedCss === false) {
        http_response_code(500);
        echo $label . ' is unavailable.';
        exit;
    }

    // holiday-style.css also contains a Theme Park-only override block with
    // !important green rules. Other sections share the structural CSS but must
    // never inherit those park-specific rules, so remove that block before
    // recolouring and inlining the shared stylesheet.
    $parkThemeMarker = '/* ── THEME PARK TRACKER — GREEN SECTION THEME ──';
    $parkThemePos = strpos($sharedCss, $parkThemeMarker);
    if ($parkThemePos !== false) {
        $sharedCss = substr($sharedCss, 0, $parkThemePos);
    }

    $template = applySectionPalette($template, $palette);
    $sharedCss = applySectionPalette($sharedCss, $palette);
    $themeStyle = '<style id="' . $styleId . '">' . "\n" . $sharedCss . "\n</style>";
    $pattern = '~<link\s+rel=["\']stylesheet["\']\s+href=["\']/holidays/holiday-style\.css(?:\?[^"\']*)?["\']\s*/?>~i';
    $template = preg_replace($pattern, $themeStyle, $template, 1, $count);
    if ($template === null) {
        http_response_code(500);
        echo $label . ' theme could not be rendered.';
        exit;
    }
    if (($count ?? 0) !== 1) {
        $template = str_replace('</head>', $themeStyle . "\n</head>", $template, $headCount);
        if ($headCount !== 1) {
            http_response_code(500);
            echo $label . ' theme could not be attached.';
            exit;
        }
    }
    $template = attachMobileCenteredNavTitle($template, $label);
    if ($scrollColour !== null) {
        $template = attachMobileScrollToBottom($template, $scrollColour, $label);
    }
    if ($fullscreenDetail) {
        $template = attachParkMobileFullscreenDetail($template);
    }
    echo $template;
    exit;
}

$section = strtolower(trim((string)($_GET['section'] ?? 'parks')));
$defaultPage = in_array($section, ['holidays', 'concerts', 'shows', 'private'], true) ? 'index' : 'map';
$page = strtolower(trim((string)($_GET['page'] ?? $defaultPage)));

if ($section === 'holidays') {
    $templates = [
        'index' => __DIR__ . '/holidays/index.html', '2025-26' => __DIR__ . '/holidays/2025-26.html',
        '2026-27' => __DIR__ . '/holidays/2026-27.html', '2027-28' => __DIR__ . '/holidays/2027-28.html',
        'jonathan' => __DIR__ . '/holidays/jonathan/index.html',
        'jonathan-2026' => __DIR__ . '/holidays/jonathan/2026.html',
        'jonathan-2027' => __DIR__ . '/holidays/jonathan/2027.html',
    ];
    if (!isset($templates[$page])) { http_response_code(404); echo 'Holiday Allowance page not found.'; exit; }
    renderSharedCssSection($templates[$page], $holidayPalette, 'holiday-purple-section-theme', 'Holiday Allowance');
}

if ($section === 'concerts') {
    $templates = [
        'index' => __DIR__ . '/concerts/index.html',
        'artists' => __DIR__ . '/concerts/artists.html',
    ];
    if (!isset($templates[$page])) { http_response_code(404); echo 'Concert Log page not found.'; exit; }
    renderSharedCssSection(
        $templates[$page], $concertPalette, 'concert-orange-section-theme', 'Concert Log',
        $page === 'index' ? '#c9792b' : null,
        $page === 'index'
    );
}

if ($section === 'shows') {
    $templates = [
        'index' => __DIR__ . '/shows/index.html',
        'list' => __DIR__ . '/shows/list.html',
    ];
    if (!isset($templates[$page])) { http_response_code(404); echo 'Shows page not found.'; exit; }
    renderSharedCssSection(
        $templates[$page], $showPalette, 'shows-blue-section-theme', 'Shows',
        $page === 'index' ? '#4f78a8' : null,
        $page === 'index'
    );
}

if ($section === 'private') {
    if ($page !== 'index') { http_response_code(404); echo 'Private Log page not found.'; exit; }
    $template = @file_get_contents(__DIR__ . '/private/index.html');
    if ($template === false) { http_response_code(500); echo 'Private Log is unavailable.'; exit; }
    $template = applySectionPalette($template, $privatePalette);
    $template = attachMobileCenteredNavTitle($template, 'Private Log');
    echo $template;
    exit;
}

if ($section !== 'parks') { http_response_code(404); echo 'Section not found.'; exit; }

$templates = [
    'index' => __DIR__ . '/parks/index.html', 'credits' => __DIR__ . '/parks/credits.html',
    'coasters' => __DIR__ . '/parks/coasters.html', 'map' => __DIR__ . '/parks/map.html',
];
if (!isset($templates[$page])) { http_response_code(404); echo 'Theme Park page not found.'; exit; }
$template = @file_get_contents($templates[$page]);
if ($template === false) { http_response_code(500); echo 'Theme Park Tracker is unavailable.'; exit; }
$template = applySectionPalette($template, $parkPalette);
$template = str_replace('href="/holidays/holiday-style.css"', 'href="/holidays/holiday-style.css?v=parks-green-20260912"', $template);
$template = attachMobileCenteredNavTitle($template, 'Theme Park Tracker');
if ($page === 'index') {
    $template = attachMobileScrollToBottom($template, '#6c8966', 'Theme Park Tracker');
    $template = attachParkMobileFullscreenDetail($template);
}
if ($page === 'map') {
    [$template, $diag] = applyGoogleMapsScriptRuntimeSafety($template);
    if (($diag['maps_script_key_rewritten'] ?? 0) !== 1) { http_response_code(500); echo 'Park map could not be rendered safely.'; exit; }
}
echo $template;