#!/usr/bin/env python3
"""Focused contracts for browser security headers and safe delivery caching."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
htaccess = (ROOT / '.htaccess').read_text(encoding='utf-8')
runtime = (ROOT / 'template-runtime.php').read_text(encoding='utf-8')


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

# A strict CSP and HSTS still need their own compatibility pass because this
# application uses inline itinerary scripts, Google Maps and public share links.
print('safe response header + delivery contracts: ok')
