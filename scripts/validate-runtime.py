#!/usr/bin/env python3
"""Static runtime contract checks for the My Trips deployment."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"runtime contract failed: {message}")


trip = read("trip.php")
share = read("share.php")
trips_renderer = read("trips.php")
runtime = read("template-runtime.php")
auth = read("auth.js")
auth_v2 = read("auth-v2.php")
auth_session = read("auth-session.php")
deploy = read("deploy-webhook.php")
template = read("new-trip-v2.html")
dashboard = read("trips/index.html")
record = read("record.php")
db = read("db.js")
db_config = read("db-config.php")
ui = read("itinerary-ui.js")
settings = read("settings.html")
api = read("api.php")
htaccess = read(".htaccess")

# One shared itinerary runtime, with runtime sanitisation applied before output.
require("new-trip-v2.html" in trip, "trip.php must render the shared V2 template")
require("template-runtime.php" in trip and "applyItineraryRuntimeSafety" in trip,
        "trip.php must sanitize the shared template before output")
require('/itinerary-state-guard.js?v=1' in trip, "trip.php must load the state safety layer")
require('/itinerary-ui.js?v=1' in trip, "trip.php must load itinerary-only UI bootstrap")
require("hotel_lookup_rewritten" in trip, "trip.php must fail closed if the centralized hotel correction drifts")

# The legacy hotel source remains only as a known compatibility target until the
# very large shared template is split into modules; one shared renderer corrects
# it for both owner and share views.
require("dayDate >= ci && dayDate <= co" in template, "shared template hotel compatibility source changed; update renderer deliberately")
require("Fallback: closest upcoming" in template, "shared template hotel compatibility source changed unexpectedly")
require("dayDate >= ci && dayDate < co" in runtime, "central hotel correction must treat checkout as exclusive")
require("hotel_lookup_rewritten" in runtime and "hotel_lookup_rewritten" in share,
        "owner and share renders must use the same hotel correction")
require("$oldHotelLookup" not in trip and "$newHotelLookup" not in trip,
        "hotel compatibility source must not be duplicated in trip.php")

# Raw template compatibility credentials must be stripped from every public render.
require("auth_const_removed" in runtime and "auth_headers_rewritten" in runtime,
        "runtime sanitizer must remove the legacy template auth credential")
require("typeof getToken === 'function' ? getToken() : ''" in runtime,
        "template API calls must obtain the random session at request time")
require("MAPS_BROWSER_KEY" in runtime and "PLACES_API_KEY" not in runtime,
        "browser Maps injection must use its own restricted browser key")
require("share.php?share=1&t=" in runtime, "new share links must use the sanitized share renderer")
require("applyItineraryRuntimeSafety" in share, "share.php must sanitize the same shared template")
require("Location: /share.php?share=1&t=" in share,
        "share renderer must activate share mode before auth.js executes")
require("applyTripsDashboardRuntimeSafety" in trips_renderer,
        "trips.php must inject safe dashboard runtime configuration")
require("travel_day_filter_rewritten" in trips_renderer and "travel day" in runtime.lower(),
        "dashboard Travel Day filtering must happen at render source")
require("removeTravelDayFrontCardTags" not in auth and "MutationObserver" not in auth,
        "auth.js must not contain dashboard presentation patches")

# Never expose the raw monolithic template directly over HTTP. Existing old share
# URLs are internally routed to share.php before the catch-all 404 rule.
require("RewriteRule ^new-trip-v2\\.html$ share.php [L,QSA]" in htaccess,
        "old share links must route through share.php")
require("RewriteRule ^new-trip-v2\\.html$ - [R=404,L]" in htaccess,
        "raw new-trip-v2.html requests must be denied")
require("RewriteRule ^trips/?$ trips.php [L,QSA]" in htaccess,
        "/trips/ must use its validated PHP renderer")

require("loadBudgetLiveRedesign" not in auth, "Budget bootstrap leaked back into auth.js")
require("installHotelLookupFix" not in auth, "hotel monkey patch leaked back into auth.js")
require("budget-live-redesign.js" not in auth, "Budget asset must not be loaded by auth.js")
require("budget-live-redesign.js" in ui, "itinerary-ui.js must load the Budget presentation")

# Conflict-safe saves.
require("FOR UPDATE" in record, "record.php must lock a record while checking its version")
require("expected_version" in record, "record.php must enforce expected versions")
require("array_key_exists('expected_version', $body)" in record,
        "record.php must reject writes that omit the concurrency precondition")
require("Missing expected_version" in record and "428" in record,
        "missing save preconditions must fail closed")
require("409" in record, "record.php must reject stale writes")
require("isAuthorizedToken($token, false)" in record, "record.php must reject legacy PIN-hash bearer tokens")
require("_dbSaveQueues" in db, "db.js must serialize saves per record")
require("expected_version" in db, "db.js must send record versions")
require("return getStoredAuth().sessionToken || ''" in db, "browser API calls must use only the random server session token")
require("s.token" not in db, "db.js must not fall back to the PIN hash token")
require("mytrips:auth-expired" in db, "401 responses must notify the auth layer")

# Authentication v2 must issue random expiring sessions and throttle PIN guesses.
require("random_bytes(32)" in auth_session, "auth sessions must use cryptographically random tokens")
require("AUTH_SESSION_TTL_SECONDS" in auth_session, "auth sessions must expire server-side")
require("AUTH_MAX_FAILURES" in auth_session and "auth_attempts" in auth_session, "PIN login must be rate limited")
require("AUTH_FALLBACK_PIN_HASH" not in auth_session, "PIN hash fallback must not live in source control")
require("configuredPinHash" in auth_session, "fresh installs may bootstrap PIN only from server-only configuration")
require("authTokenHash" in auth_session, "session token hashing must be centralized")
require("revokeAuthSession" in auth_session, "single-session logout helper must exist")
require("last_seen_at = NOW()" in auth_session, "valid server sessions should record last-seen time")
require("issueAuthSession" in auth_v2, "auth-v2 login must issue a server session")
require("loginRateLimitRemaining" in auth_v2, "auth-v2 login must enforce throttling")
require("revokeAllAuthSessions" in auth_v2, "changing PIN must invalidate older sessions")
require("$action === 'check'" in auth_v2 and "isValidAuthSession" in auth_v2, "auth-v2 must expose session validation")
require("revokeAuthSession($token)" in auth_v2, "logout must revoke only the presented session")
require("isAuthorizedToken($token, false)" in auth_v2, "PIN changes must require a real server session")
require("legacy_token" not in auth_v2, "auth-v2 must never return the PIN hash as a bearer token")
require("/auth-v2.php?action=login" in auth, "PIN overlay must use the v2 login endpoint")
require("legacy_token" not in auth and "s.token" not in auth, "browser auth state must not retain legacy PIN-hash tokens")
require("mytrips:auth-expired" in auth and "relockForExpiredSession" in auth, "expired server sessions must relock the UI")

# The general API must require the same random server session as record.php.
require("require_once __DIR__ . '/auth-session.php'" in api, "api.php must load shared session validation")
require("isAuthorizedToken($token, false)" in api, "normal api.php actions must require secure server sessions")
require("$publicActions = ['share_load'];" in api, "share_load must be the only unauthenticated general API action")
require("case 'auth':" not in api and "case 'pin_hash':" not in api, "legacy PIN-hash API endpoints must be removed")
require("AUTH_FALLBACK_PIN_HASH" not in api and "PIN_HASH" not in api, "api.php must not expose PIN-hash compatibility")
require("case 'write_secret':" not in api, "production API must not write server secrets")
require("case 'write_file':" not in api, "production API must not overwrite application files")

# Server credentials must not have source-code fallbacks.
for name in ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASS"]:
    require(f"requiredConfigValue('{name}')" in db_config,
            f"{name} must come from server-only configuration")
require("function requiredConfigValue" in db_config, "database configuration must fail closed when a secret is missing")

# No literal Google server API keys may be committed to the production API.
hardcoded_google_keys = re.findall(r"AIza[0-9A-Za-z_-]{20,}", api)
require(not hardcoded_google_keys, "api.php must not contain literal Google API keys")
require("defined('PLACES_API_KEY') ? PLACES_API_KEY : ''" in api, "Places integrations must use the server-side Places secret")

# Settings must use the same security path and export every listed record ID.
require("dbChangePin(newHash)" in settings, "Settings PIN change must use the v2 session endpoint")
require("/auth-v2.php?action=login" in settings, "Settings current-PIN verification must use rate-limited login")
require("/auth-v2.php?action=logout" in settings, "Settings sign-out must revoke the server session")
require("?.sessionToken || ''" in settings, "Settings must use only the server session token")
require("legacy_token" not in settings, "Settings must not store the PIN hash as a bearer token")
require("typeof row==='string'" in settings and "row?.id" in settings, "Backup exporter must read IDs from list API rows")
require("record_count" in settings, "Backup should record and surface its exported record count")

# Deployment must fail closed before touching live files if hosting secrets are not
# ready, and deploy credentials must never be accepted from the query string.
require("return serverConfig('DEPLOY_KEY')" in deploy, "deploy key must come only from server configuration")
require("$_GET['key']" not in deploy, "deploy key must not be accepted in URLs")
require("deploymentPreflight" in deploy and "live_files_untouched" in deploy,
        "deployment must preflight server configuration before copying live files")
for required in ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASS", "ANTHROPIC_API_KEY", "PLACES_API_KEY", "MAPS_BROWSER_KEY"]:
    require(f"'{required}'" in deploy, f"deployment preflight must require {required}")
require("rename($tmpPath, $destPath)" in deploy, "deploy files must be atomically renamed into place")

for runtime_file in [
    "auth-v2.php",
    "auth-session.php",
    "record.php",
    "template-runtime.php",
    "trip.php",
    "share.php",
    "trips.php",
    "parks-map.php",
    "itinerary-state-guard.js",
    "itinerary-ui.js",
    "budget-live-redesign.js",
    "manifest.webmanifest",
]:
    require(f"'{runtime_file}'" in deploy, f"{runtime_file} missing from deployment manifest")

require("REGENERATE ALL ITINERARY" not in deploy, "legacy baked-itinerary regeneration returned")
require("$templateV1" not in deploy, "V1 itinerary regeneration returned")
require("itinerary-state-guard|itinerary-ui" in htaccess, "critical itinerary scripts must bypass long browser cache")

print("runtime contracts: ok")
