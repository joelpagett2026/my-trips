#!/usr/bin/env python3
"""Focused checks for security/state changes that are easy to regress."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def require(ok: bool, message: str) -> None:
    if not ok:
        raise SystemExit(f"security contract failed: {message}")


htaccess = read('.htaccess')
deploy = read('deploy-webhook.php')
runtime = read('template-runtime.php')
park_renderer = read('parks-map.php')
state_guard = read('itinerary-state-guard.js')
db = read('db.js')
auth = read('auth.js')
db_config = read('db-config.php')

# Legacy write paths that bypass modern conflict/PIN handling must be unreachable.
require('action=(save|set_setting)' in htaccess and 'RewriteRule ^api\\.php$ - [R=410,L]' in htaccess,
        'legacy api save/set_setting routes must be retired at the web edge')

# Browser Google Maps keys are public by nature, but there should be one runtime
# source for the active key so it can be restricted/rotated centrally.
require("browserMapsKey()" in runtime and "MAPS_BROWSER_KEY" in runtime,
        'browser Maps key must come from server runtime configuration')
require('applyGoogleMapsScriptRuntimeSafety' in runtime,
        'park-map Google script URL must be sanitized at runtime')
require('applyGoogleMapsScriptRuntimeSafety' in park_renderer,
        'park map must use the safe renderer')
require("RewriteRule ^parks/map\\.html$ parks-map.php [L,QSA]" in htaccess,
        'public park map URL must route through parks-map.php')
require("'parks-map.php'" in deploy,
        'park map renderer must deploy before the route is activated')

# Auth should no longer be a catch-all home for unrelated visual fixes.
require('MutationObserver' not in auth and 'TravelDayFrontCard' not in auth,
        'auth.js must stay authentication-only')

# Snapshot baseline must come from the real server-loaded record, not whichever
# temporary/default STATE happens to exist when the safety script loads.
require('__mytripsLoadedRecords' in db and 'mytrips:record-loaded' in db,
        'db.js must expose authoritative loaded-record state')
require('__mytripsLoadedRecords' in state_guard and 'mytrips:record-loaded' in state_guard,
        'snapshot guard must initialize from authoritative server state')
require('temporary template/default data' in state_guard,
        'snapshot guard must explicitly avoid default-state baselines')

# Source-controlled DB credentials must never return.
for name in ('DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS'):
    require(f"requiredConfigValue('{name}')" in db_config,
            f'{name} must be required from server-only configuration')

# Deploy key is header-only and a preflight must happen before live-file copying.
require("serverConfig('DEPLOY_KEY')" in deploy, 'deploy key must be server-only')
require("HTTP_X_DEPLOY_KEY" in deploy and "$_GET['key']" not in deploy,
        'deploy authentication must be header-only')
require('deploymentPreflight()' in deploy and "live_files_untouched" in deploy,
        'deployment must fail closed before live copy when server config is incomplete')

print('security contracts: ok')
