# Production hardening and operations

This document describes the **current production security/reliability model** for `joelpagett.co.uk`.
The earlier bootstrap/stability migration is complete; do not use the old PR/bootstrap procedure as an operating guide.

## Current production model

### Authentication

- The site uses a four-digit PIN only to establish a random server session.
- PIN hashing and comparison happen server-side in `auth-v2.php`.
- The authoritative PIN hash is stored only in the database at `settings.pin_hash`.
- There is **no runtime `PIN_HASH` bootstrap/fallback**. A missing or invalid database PIN fails closed.
- Browser auth state contains only a random session token, never the PIN hash.
- Sessions are stored server-side as token hashes, expire after 12 hours, and are revoked on logout.
- Changing the PIN revokes all older sessions and issues a replacement session in the same transaction.
- Repeated incorrect PIN attempts are rate-limited by IP hash.

If a `PIN_HASH` line still exists in hosting `secrets.php`, it is obsolete and should be removed during the next hosting-maintenance pass. The runtime no longer reads it.

### Server-only configuration

Production secrets belong in `public_html/secrets.php` (not committed) or hosting environment variables:

- `DB_HOST`
- `DB_NAME`
- `DB_USER`
- `DB_PASS`
- `DEPLOY_KEY`
- `ANTHROPIC_API_KEY`
- `PLACES_API_KEY` — server-only Google Places/Routes key
- `MAPS_BROWSER_KEY` — browser-visible Maps JavaScript key, restricted by referrer and API

Never commit literal credentials to this repository.

### Database protection

- `trip-registry` is the authoritative itinerary index.
- Itinerary saves use `record.php` with optimistic version checks and `SELECT ... FOR UPDATE` locking.
- Stale writes return HTTP 409 instead of silently overwriting a newer version.
- Browser saves are serialized per record.
- Trip creation and deletion update the itinerary record, registry and related data transactionally.
- Generic deletion cannot remove active trip records, the registry or snapshot records.
- Deployment preflight refuses to proceed if the configured database is missing, has an invalid registry, or has no active itineraries.

The deploy workflow also checks the deploy webhook response and refuses to declare success unless the production registry is non-empty and no file copies failed.

### API surface

`api.php` is intentionally narrow. It no longer contains the retired whole-record save, generic setting write, legacy trip creation/deletion or place-photo implementations.

Dedicated endpoints are used for sensitive operations:

- `record.php` — conflict-safe record load/save
- `record-delete.php` — guarded generic deletion
- `trip-create.php` — atomic trip creation
- `trip-delete.php` — atomic trip deletion
- `auth-v2.php` — login/session/PIN lifecycle
- `place-photo.php` — server-side Places photo proxy
- `backup-export.php` — authenticated consistent backup export

The web edge blocks explicit cross-site requests to protected PHP endpoints. The general API does not emit permissive CORS headers.

### Request size limits

Sensitive JSON endpoints reject oversized requests before parsing them. Current limits are deliberate and covered by CI:

- Authentication: 16 KB
- Whole itinerary save: 8 MB
- Trip creation: 3 MB
- Trip deletion: 64 KB
- Generic record deletion: 64 KB

The trip-creation cover-photo field also retains its independent 2.5 MB cap.

### Backups

`backup-export.php` reads one repeatable-read database snapshot so records cannot come from different points in time.

Backups include itinerary records and ordinary application settings, but exclude security-sensitive settings. Filtering is defensive: setting names associated with PINs, passwords, secrets, credentials, tokens, authentication or API keys are excluded automatically.

Authentication sessions, failed-login records and share tokens are not exported.

### Rendering and browser caching

- Individual itineraries are rendered by `trip.php` from the shared `new-trip-v2.html` source.
- Read-only shares render through `share.php`.
- The raw shared template is not directly served.
- `/trips/` is rendered through `trips.php`.
- `/` is rendered through `home.php`.
- Settings is rendered through `settings.php`.
- Critical authentication/database/runtime scripts use current versioned URLs and no-cache headers.

This prevents different parts of the site from accidentally loading different generations of auth/session code.

### Maps and third-party APIs

- `PLACES_API_KEY` stays server-side and is used by server API calls.
- `MAPS_BROWSER_KEY` is intentionally browser-visible and must remain restricted to the production domain and required Maps JavaScript API(s).
- Place-photo requests are proxied server-side so the server Places key is not exposed in browser image URLs.
- Anthropic calls are made server-side only.

## Deployment process

Pushes to `main` run the full validation suite before production deployment.

The deploy webhook:

1. Authenticates using the `X-Deploy-Key` header.
2. Fetches and hard-resets the server checkout to `origin/main`.
3. Preflights required server configuration and database/auth state.
4. Verifies the configured database contains a valid, non-empty `trip-registry`.
5. Copies runtime files atomically.
6. Returns a structured deploy result including the verified active-trip count and any failed/skipped files.

GitHub Actions then performs public production smoke checks for the PIN gate, current auth/database script versions, Trips renderer, an itinerary renderer and unauthenticated API rejection.

A successful GitHub commit alone is **not** enough to call a release live; the deploy job must also complete successfully.

## CI contracts

The current workflow validates:

- JavaScript syntax
- PHP syntax
- web-app manifest JSON
- runtime rendering contracts
- focused security contracts
- request-body limits
- reduced API surface
- production database deployment guard
- authentication transaction/session contracts
- backup consistency and secret filtering
- atomic trip creation
- atomic trip deletion
- renderer integration

When changing one of these subsystems, update the corresponding contract deliberately rather than weakening or removing it to make CI pass.

## Production smoke-test checklist

After a material release, use this order:

1. Unlock `/` with the current PIN.
2. Open `/trips/` without another PIN prompt.
3. Open at least two itineraries and check Itinerary, Bookings, Map and Budget.
4. Make a harmless edit, wait for **Saved**, reload and confirm it persists.
5. Open the same itinerary in a second tab/device, save from one, then confirm the stale tab is rejected rather than overwriting the newer state.
6. Verify a hotel checkout/check-in boundary displays the correct hotel on each night.
7. Create a read-only share link and open it while signed out/incognito.
8. Confirm raw `/new-trip-v2.html` is not directly accessible.
9. Confirm itinerary maps and the park map load.
10. Download a backup and verify its record count is non-zero and expected records are present.
11. Use the homepage Logout control and confirm the PIN gate returns.
12. Check the GitHub Actions deploy result before declaring the release complete.

## Remaining maintenance work

The main architectural debt is the monolithic `new-trip-v2.html` template. It works behind validated renderers, but should eventually be split into smaller itinerary/bookings/map/budget modules with shared utilities. Treat that as a separate refactor with regression tests; do not combine it with unrelated production changes.

Also periodically review:

- hosting `secrets.php` for obsolete values such as old `PIN_HASH`;
- Google API restrictions;
- server/API key rotation status;
- backup downloads;
- stale/unused deployment files;
- CI failures or contract drift.

## Rollback rule

If a material production smoke test fails, stop making unrelated production changes. Revert the specific bad commit or restore the previous known-good runtime, preserve current rotated credentials/PINs, and diagnose from the failed subsystem. Never restore disclosed source-code credentials as a rollback mechanism.
