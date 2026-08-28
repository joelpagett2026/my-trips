#!/usr/bin/env python3
"""Focused contract for low-risk browser response security headers."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
htaccess = (ROOT / '.htaccess').read_text(encoding='utf-8')


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f'response-header contract failed: {message}')


require('Header always set X-Content-Type-Options "nosniff"' in htaccess,
        'X-Content-Type-Options must remain nosniff')
require('Header always set Referrer-Policy "strict-origin-when-cross-origin"' in htaccess,
        'Referrer-Policy must remain strict-origin-when-cross-origin')

# Intentionally do not enforce CSP/HSTS/frame policy here. Those controls need a
# dedicated compatibility pass because this application uses inline itinerary
# scripts, Google Maps, and public read-only share links.
print('safe response header contracts: ok')
