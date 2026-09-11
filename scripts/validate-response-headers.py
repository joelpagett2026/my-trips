#!/usr/bin/env python3
"""Focused contracts for browser security headers and safe delivery caching."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
htaccess = (ROOT / '.htaccess').read_text(encoding='utf-8')
runtime = (ROOT / 'template-runtime.php').read_text(encoding='utf-8')
trip = (ROOT / 'trip.php').read_text(encoding='utf-8')
standalone = (ROOT / 'trip-standalone.js').read_text(encoding='utf-8')
share = (ROOT / 'share.php').read_text(encoding='utf-8')
deploy = (ROOT / 'deploy-webhook.php').read_text(encoding='utf-8')


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f'response-header contract failed: {message}')


require('Header always set X-Content-Type-Options "nosniff"' in htaccess,
        'X-Content-Type-Options must remain nosniff')
require('Header always set Referrer-Policy "strict-origin-when-cross-origin"' in htaccess,
        'Referrer-Policy must remain strict-origin-when-cross-origin')
require('Header always set X-Frame-Options "SAMEORIGIN"' in htaccess,
        'clickjacking protection must remain SAMEORIGIN')
require('Header always set Permissions-Policy "camera=(), microphone=(), payment=(), usb=()"' in htaccess,
        'unused high-risk browser capabilities must stay disabled')

hsts_lines = [
    line.strip() for line in htaccess.splitlines()
    if line.strip().startswith('Header always set Strict-Transport-Security ')
]
require(hsts_lines == ['Header always set Strict-Transport-Security "max-age=86400"'],
        'HSTS pilot must be exactly one day with no subdomain/preload directives')

# CSP is layered so already-proven structural protection remains stable while more
# independent directives can be promoted without touching script/style execution.
structural_csp = (
    'Header always set Content-Security-Policy '
    '"base-uri \'self\'; object-src \'none\'; frame-ancestors \'self\'"'
)
require(structural_csp in htaccess,
        'CSP must enforce self-only base URLs, no plugin objects, and same-origin framing')
low_risk_csp = (
    'Header always add Content-Security-Policy '
    '"form-action \'self\'; manifest-src \'self\'; worker-src \'self\' blob:; '
    'media-src \'self\' data: blob:"'
)
require(low_risk_csp in htaccess,
        'CSP must enforce same-origin forms/manifests and restricted workers/media')

for path in list(ROOT.rglob('*.html')) + list(ROOT.rglob('*.php')):
    if '.git' in path.parts:
        continue
    text = path.read_text(encoding='utf-8', errors='ignore')
    require(not re.search(r'<form\b[^>]*\baction\s*=\s*["\']https?://', text, re.I),
            f'external form action requires CSP review: {path.relative_to(ROOT)}')
    require(not re.search(r'<link\b[^>]*\brel\s*=\s*["\']manifest["\'][^>]*\bhref\s*=\s*["\']https?://', text, re.I),
            f'external manifest requires CSP review: {path.relative_to(ROOT)}')

report_only_prefix = 'Header always set Content-Security-Policy-Report-Only "'
require(report_only_prefix in htaccess,
        'broader CSP source restrictions must remain staged in report-only mode')
for directive in (
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://maps.googleapis.com https://maps.gstatic.com https://photon.komoot.io https://nominatim.openstreetmap.org",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self' data: blob:",
    "frame-src 'self' https://www.google.com https://maps.google.com",
):
    require(directive in htaccess, f'report-only CSP must retain {directive}')
require("'unsafe-eval'" not in htaccess,
        'CSP must not permit eval/new Function execution')
require("script-src *" not in htaccess and "default-src *" not in htaccess,
        'CSP must not use wildcard script/default source permissions')

require('<IfModule mod_deflate.c>' in htaccess and 'AddOutputFilterByType DEFLATE' in htaccess,
        'text compression must remain enabled when mod_deflate is available')
for mime in ('text/html', 'text/css', 'application/javascript', 'application/json', 'image/svg+xml'):
    require(mime in htaccess, f'compression policy must include {mime}')

require('<FilesMatch "^itinerary-v2-style\\.css$">' in htaccess and
        'Header set Cache-Control "public, max-age=31536000, immutable"' in htaccess,
        'versioned itinerary CSS must remain long-lived and immutable')
require("$stylePath = __DIR__ . '/itinerary-v2-style.css';" in runtime and
        "filemtime($stylePath)" in runtime and
        "'itinerary_style_versioned'" in runtime,
        'itinerary CSS cache key must be generated from the deployed file mtime')

immutable_runtime_group = (
    '<FilesMatch "^(?:auth|db|map-mobile-redesign|itinerary-completion|'
    'itinerary-state-guard|itinerary-ui|mobile-drag|trip-delete|trip-standalone|'
    'trip-drawer-swipe|trip-mobile-modal-layout)\\.js$">'
)
require(immutable_runtime_group in htaccess,
        'versioned itinerary runtime files must retain the immutable static-file policy when directly servable')
require('<FilesMatch "^(?:trip-dashboard-create|budget-live-redesign)\\.js$">' in htaccess,
        'unversioned application overrides must remain revalidated')

for filename, version_var in (
    ('itinerary-state-guard.js', '$stateGuardVersion'),
    ('itinerary-ui.js', '$uiVersion'),
    ('map-mobile-redesign.js', '$mapVersion'),
    ('mobile-drag.js', '$mobileDragVersion'),
    ('itinerary-completion.js', '$completionVersion'),
    ('trip-delete.js', '$tripDeleteVersion'),
):
    require(filename in trip and version_var in trip,
            f'{filename} must retain a file-versioned owner itinerary URL')
    require(f'<link rel="preload" href="/{filename}?v=' in trip,
            f'{filename} must be preloaded from the document head')

# The hosting layer currently returns 403 for newly introduced root-level JS paths.
# Keep runtime helpers external, but deliver only explicit derivative aliases
# through trip.php. The JSON bootstrap reuses trip-standalone.js, so no new
# physical file or deploy-manifest entry is required.
require("function tripRuntimeAssetMap(): array" in trip,
        'trip renderer must define the explicit runtime derivative allow-list')
for asset_name, filename in (
    ('trip-json-bootstrap', 'trip-standalone.js'),
    ('trip-standalone', 'trip-standalone.js'),
    ('trip-drawer-swipe', 'trip-drawer-swipe.js'),
    ('trip-mobile-modal-layout', 'trip-mobile-modal-layout.js'),
):
    require(f"'{asset_name}' => '{filename}'" in trip,
            f'trip runtime derivative allow-list must include {asset_name}')
    require((ROOT / filename).is_file(), f'externalized trip helper is missing: {filename}')
    require(f"'{filename}'" in deploy, f'deploy webhook must publish externalized trip helper: {filename}')

require("function serveTripRuntimeAsset(string $asset): void" in trip,
        'trip renderer must serve whitelisted runtime derivatives')
require("header('Content-Type: application/javascript; charset=UTF-8');" in trip,
        'trip runtime derivatives must use the JavaScript content type')
require("header('Cache-Control: public, max-age=31536000, immutable');" in trip,
        'trip runtime derivatives must be immutable when version matches')
require("header('Location: ' . tripRuntimeAssetUrl($asset), true, 302);" in trip,
        'stale runtime derivative versions must canonicalize to the deployed version')
require("readfile($path);" in trip,
        'runtime derivative response must read only the resolved whitelisted file')
require("/trip-standalone.js?v=" not in trip and "/trip-drawer-swipe.js?v=" not in trip and "/trip-mobile-modal-layout.js?v=" not in trip,
        'trip renderer must not regress to host-blocked direct helper URLs')
require("$tripStandaloneUrl = htmlspecialchars(tripRuntimeAssetUrl('trip-standalone')" in trip,
        'iOS standalone helper must use the whitelisted derivative URL')
require("$tripDrawerSwipeUrl = htmlspecialchars(tripRuntimeAssetUrl('trip-drawer-swipe')" in trip,
        'drawer helper must use the whitelisted derivative URL')
require("$tripMobileModalUrl = htmlspecialchars(tripRuntimeAssetUrl('trip-mobile-modal-layout')" in trip,
        'mobile modal helper must use the whitelisted derivative URL')

# Owner per-trip metadata is inert JSON. Only the external derivative parses it,
# so DB-backed values are no longer emitted as executable JavaScript source.
require('<script type="application/json" id="trip-runtime-data">' in trip,
        'owner trip metadata must be rendered as an inert JSON block')
require("$tripJsonBootstrapUrl = htmlspecialchars(tripRuntimeAssetUrl('trip-json-bootstrap')" in trip,
        'owner JSON bootstrap must use the explicit derivative URL')
require("$tripData = json_encode([" in trip and 'JSON_HEX_TAG' in trip and 'JSON_HEX_AMP' in trip,
        'owner trip JSON must be encoded with HTML-safe JSON flags')
require("$tripBootstrap =" not in trip,
        'owner renderer must not rebuild per-trip executable const declarations')
require("// Trip data (rendered dynamically from the DB on every request)" not in trip,
        'legacy executable owner bootstrap marker must remain removed')
require("derivative === 'trip-json-bootstrap'" in standalone,
        'shared runtime helper must distinguish the JSON bootstrap derivative')
require("document.getElementById('trip-runtime-data')" in standalone,
        'JSON bootstrap derivative must read only the inert owner data element')
require("window.RECORD_ID = nextSlug" in standalone,
        'JSON bootstrap derivative must restore the itinerary record identifier contract')

# First event-handler CSP tranche: authenticated owner navigation/chrome is
# converted to declarative data attributes after the large core is externalized.
# Public shares deliberately retain the established markup until their own stage.
require('function externalizeOwnerNavigationHandlers(string $html): array' in trip,
        'owner renderer must externalize its navigation event handlers')
require("'owner_navigation_handlers_externalized' => $total" in trip and
        "'owner_navigation_handler_contract_valid' => $valid ? 1 : 0" in trip,
        'owner navigation migration must publish exact-count diagnostics')
require("($ownerNavDiag['owner_navigation_handlers_externalized'] ?? 0) !== 18" in trip,
        'owner navigation migration must fail closed unless exactly 18 handlers move')
for marker in (
    'data-owner-action="view" data-owner-view="itinerary"',
    'data-owner-action="view" data-owner-view="bookings"',
    'data-owner-action="view" data-owner-view="map"',
    'data-owner-action="view" data-owner-view="budget"',
    'data-owner-action="toggle-days"',
    'data-owner-action="share"',
    'data-owner-action="settings"',
    'data-owner-action="all-trips"',
    'data-owner-action="toggle-menu"',
    'data-owner-action="close-menu"',
    'data-owner-close-menu="1"',
):
    require(marker in trip, f'owner navigation migration must emit {marker}')
require('installOwnerNavigationHandlers' in standalone and
        "closest?.('[data-owner-action]')" in standalone and
        "control.dataset.ownerCloseMenu === '1'" in standalone,
        'external owner runtime must install delegated data-action navigation')
for action in ('view', 'share', 'settings', 'all-trips', 'toggle-menu', 'close-menu'):
    require(f"case '{action}':" in standalone,
            f'delegated owner runtime must handle {action}')
require("action === 'toggle-days'" in standalone and "event.stopPropagation();" in standalone,
        'days-collapse control must retain its stop-propagation behavior')
require('externalizeOwnerNavigationHandlers' not in share,
        'public share renderer must remain outside the owner navigation migration tranche')

# These helpers used to be literal executable blocks in trip.php. They must stay
# external even though delivery passes through a PHP derivative route.
for old_inline_marker in (
    "window.navigator.standalone === true",
    "drawer.dataset.mapSwipeFix === '1'",
    "style.id = 'mobile-entry-modal-layout-fix'",
):
    require(old_inline_marker not in trip,
            f'static trip runtime must remain externalized: {old_inline_marker}')

require("$uiVersion = @filemtime(__DIR__ . '/itinerary-ui.js') ?: time();" in share,
        'share renderer must version itinerary-ui.js from the deployed file')
require('<link rel="preload" href="/itinerary-ui.js?v=' in share,
        'share renderer must start its UI runtime download from the document head')
require("/itinerary-ui.js?v=1" not in share,
        'share renderer must never pin itinerary-ui.js to a fixed cache key')

print('safe response header + layered CSP + JSON bootstrap + owner navigation contracts: ok')