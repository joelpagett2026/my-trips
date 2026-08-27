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
place_photo = read('place-photo.php')
record_delete = read('record-delete.php')
state_guard = read('itinerary-state-guard.js')
db = read('db.js')
auth = read('auth.js')
auth_v2 = read('auth-v2.php')
auth_session = read('auth-session.php')
settings = read('settings.html')
db_config = read('db-config.php')

# Legacy write/creation paths that bypass modern conflict/PIN/registry handling
# must be unreachable.
require('action=(save|set_setting|create_page)' in htaccess and 'RewriteRule ^api\\.php$ - [R=410,L]' in htaccess,
        'legacy api save/set_setting/create_page routes must be retired at the web edge')
require(not (ROOT / 'new-trip.html').exists(),
        'retired V1 itinerary editor must not remain in the repository')
require('RewriteRule ^new-trip\\.html$ - [R=410,L]' in htaccess,
        'a stale deployed V1 editor must be blocked at the web edge')

# Generic record deletion must not be able to orphan an itinerary or destroy the
# shared registry/snapshot state.
require('action=delete' in htaccess and 'RewriteRule ^api\\.php$ record-delete.php [L,QSA]' in htaccess,
        'generic delete calls must be routed through the protected endpoint')
require("'record-delete.php'" in deploy,
        'protected generic deletion endpoint must be deployed')
require("['trip-registry']" in record_delete and "str_ends_with(strtolower($id), '-snaps')" in record_delete,
        'registry and snapshot records must be protected from generic deletion')
require("trip['slug']" in record_delete and 'trip deletion endpoint' in record_delete,
        'active trip records must be rejected by generic deletion')
require('beginTransaction()' in record_delete and "trip-registry' FOR UPDATE" in record_delete,
        'generic deletion must serialize against trip creation/deletion')
require('Trip registry not found; generic deletion is disabled' in record_delete
        and 'Trip registry is invalid; generic deletion is disabled' in record_delete,
        'generic deletion must fail closed when registry integrity cannot be verified')

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

# Google Places server keys must never be returned to the browser inside a photo
# URL. Historical API action names are retained only as routes to the safe proxy.
require('action=(place_photo_v2|place_photo)' in htaccess
        and 'RewriteRule ^api\\.php$ place-photo.php [L,QSA]' in htaccess,
        'legacy place-photo calls must be intercepted by the safe proxy')
require("'place-photo.php'" in deploy,
        'place-photo proxy must be part of the deployment manifest')
require("str_contains($location, $key)" in place_photo and "str_contains($location, 'key=')" in place_photo,
        'place-photo proxy must reject redirect URLs that expose the server key')
require("optionalConfigValue('PLACES_API_KEY')" in place_photo,
        'place-photo proxy must source the Places key only from server configuration')
require("photoOk($photoUrl)" not in place_photo and "'key=' . $key" not in place_photo,
        'place-photo proxy must not return a Google URL containing the server key')

# Auth should no longer be a catch-all home for unrelated visual fixes.
require('MutationObserver' not in auth and 'TravelDayFrontCard' not in auth,
        'auth.js must stay authentication-only')

# PIN-derived hashes must never be constructed or sent by browser code. The raw
# four digits travel only over same-origin HTTPS and are hashed/compared server-side.
require('sha256(' not in auth and 'pin_hash' not in auth,
        'auth.js must not derive or transmit PIN hashes')
require("JSON.stringify({ pin: entered })" in auth,
        'PIN overlay must submit only the raw PIN to auth-v2')
require('sha256(' not in settings and 'pin_hash' not in settings,
        'Settings must not derive or transmit PIN hashes')
require("JSON.stringify({pin:pinEntered})" in settings and "dbChangePin(pinEntered)" in settings,
        'Settings PIN verification/change must submit raw four-digit PINs')
require("JSON.stringify({ pin })" in db and "JSON.stringify({ new_pin: newPin })" in db,
        'database auth helpers must submit raw PIN fields only')
require("validatedPin" in auth_v2 and "hash('sha256', $pin)" in auth_v2 and "hash('sha256', $newPin)" in auth_v2,
        'auth-v2 must validate and hash PINs on the server')
require("$body['pin_hash']" not in auth_v2 and "$body['new_hash']" not in auth_v2,
        'auth-v2 must not accept browser-supplied PIN hashes')
require('Access-Control-Allow-Origin' not in auth_v2,
        'authentication endpoint must not emit permissive CORS headers itself')

# Session expiry and brute-force windows must use one clock. Comparing MySQL
# DATETIME values with PHP time()/strtotime() can drift when their timezones differ.
require('DATE_ADD(NOW(), INTERVAL 12 HOUR)' in auth_session,
        'session expiry must be created using database time')
require('expires_at > NOW()' in auth_session,
        'session validity must be checked using database time')
require('TIMESTAMPDIFF(SECOND, window_started, NOW())' in auth_session,
        'login rate-limit age must be measured using database time')
require("date('Y-m-d H:i:s'" not in auth_session and 'strtotime(' not in auth_session,
        'auth timing must not mix PHP and database clocks')

# Authenticated APIs are same-origin only. Apache strips any legacy API CORS
# header and rejects explicit foreign browser origins before PHP executes.
require('<FilesMatch "^(api|auth-v2|record|record-delete|trip-create|trip-delete|place-photo)\\.php$">' in htaccess,
        'authenticated API response header policy must include all protected endpoints')
require('Header always unset Access-Control-Allow-Origin' in htaccess,
        'authenticated APIs must not expose wildcard cross-origin responses')
require('%{HTTP:Sec-Fetch-Site} ^cross-site$' in htaccess,
        'cross-site Fetch Metadata requests must be rejected')
require('%{HTTP:Origin} !^https://(?:www\\.)?joelpagett\\.co\\.uk$' in htaccess,
        'foreign Origin headers must be rejected')

# Snapshot baseline must come from the real server-loaded record, not whichever
# temporary/default STATE happens to exist when the safety script loads.
require('__mytripsLoadedRecords' in db and 'mytrips:record-loaded' in db,
        'db.js must expose authoritative loaded-record state')
require('__mytripsLoadedRecords' in state_guard and 'mytrips:record-loaded' in state_guard,
        'snapshot guard must initialize from authoritative server state')
require('temporary template/default data' in state_guard,
        'snapshot guard must explicitly avoid default-state baselines')
require('pushSnapshot(lastPersistedState)' in state_guard,
        'takeSnapshot must make the last persisted state immediately available for Undo')
require('currentTopKey' in state_guard,
        'snapshot history must de-duplicate against an already-loaded top snapshot')

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
