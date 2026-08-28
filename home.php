<?php
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
