#!/usr/bin/env python3
"""Focused contracts for browser security headers and safe delivery caching."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
htaccess = (ROOT / '.htaccess').read_text(encoding='utf-8')
runtime = (ROOT / 'template-runtime.php').read_text(encoding='utf-8')
trip = (ROOT / 'trip.php').read_text(encoding='utf-8')
share = (ROOT / 'share.php').read_text(encoding='utf-8')


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

# Guard the assumptions behind those promoted directives. There should be no
# source-controlled external form target or external manifest; active media/worker
# additions deserve an explicit policy review before they can land.
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
    'itinerary-state-guard|itinerary-ui|mobile-drag|trip-delete)\\.js$">'
)
require(immutable_runtime_group in htaccess,
        'all dynamically versioned itinerary runtime scripts must share the immutable cache policy')
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

require("$uiVersion = @filemtime(__DIR__ . '/itinerary-ui.js') ?: time();" in share,
        'share renderer must version itinerary-ui.js from the deployed file')
require('<link rel="preload" href="/itinerary-ui.js?v=' in share,
        'share renderer must start its UI runtime download from the document head')
require("/itinerary-ui.js?v=1" not in share,
        'share renderer must never pin itinerary-ui.js to a fixed cache key')

print('safe response header + layered CSP + HSTS pilot + delivery contracts: ok')
