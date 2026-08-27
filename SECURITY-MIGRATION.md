# Production hardening rollout

This document is intentionally kept with the stability branch so the security changes cannot be merged without the hosting prerequisites being explicit.

## Do not merge the stability PR until the server is ready

The hardened application deliberately has no source-code fallbacks for database credentials, the PIN hash, or the deploy key. The live hosting account must therefore have server-only configuration in `secrets.php` (gitignored) or environment variables before PR #3 is merged.

Required values:

- `DB_HOST`
- `DB_NAME`
- `DB_USER`
- `DB_PASS`
- `DEPLOY_KEY`
- `ANTHROPIC_API_KEY`
- `PLACES_API_KEY` — server-side Google Places/Routes key; never expose this to browser HTML
- `MAPS_BROWSER_KEY` — browser Maps JavaScript key; this is visible to browsers by design and must be restricted in Google Cloud to `https://joelpagett.co.uk/*` (and any deliberately supported subdomains) and only the Maps JavaScript API

`PIN_HASH` is optional as a server-only bootstrap value. If the database already has a valid `settings.pin_hash`, that DB value is authoritative and a server `PIN_HASH` is not required.

## Secrets that must be rotated

Values that have existed in Git history must be treated as disclosed even though current branch source no longer uses them:

1. Rotate the MySQL password and put the new value in server-only `DB_PASS` before the hardened release is deployed.
2. Generate a new random deploy key, put the same value in the hosting `DEPLOY_KEY` and the GitHub Actions `DEPLOY_KEY` repository secret.
3. Verify/restrict or rotate the Google keys. The server Places/Routes key must not be usable from browsers. The browser Maps key must have HTTP-referrer and API restrictions.
4. After the hardened authentication release is live, change the site PIN once from Settings. This invalidates the historical PIN hash that exists in old Git history and revokes all pre-change sessions.
5. Rotate Anthropic/other server API keys if they have ever been exposed outside the hosting secret store.

## First deployment warning

The first merge of this branch is triggered by the **currently live** deploy webhook, not the new hardened webhook contained in the branch. Therefore server-only DB/API configuration must be in place **before merging**. Do not rely on the new deployment preflight to protect that first transition.

## Pre-merge checks

- Download/retain a current data backup.
- Confirm the new database credentials connect successfully from the hosting environment.
- Confirm `settings.pin_hash` exists and is a 64-character SHA-256 hex value, or configure server-only `PIN_HASH`.
- Confirm `DEPLOY_KEY` on hosting exactly matches the GitHub Actions repository secret.
- Confirm `MAPS_BROWSER_KEY` loads Maps JavaScript from the production domain and is blocked from unrelated domains/APIs.
- Confirm `PLACES_API_KEY` supports the server-side Places and Routes calls used by `api.php`.
- Confirm the stability PR CI is green and the branch is not behind `main`.

## Post-deploy smoke tests

Test these in order before making further changes:

1. `/` unlocks with the PIN and creates a random server session.
2. `/trips/` loads the dashboard.
3. Open at least two existing itineraries and confirm Itinerary, Bookings, Map and Budget tabs load.
4. Make a small itinerary edit, wait for Saved, reload and confirm it persisted.
5. Open the same trip in a second browser/device and confirm a stale edit is rejected rather than overwriting newer data.
6. Add/edit two hotels that meet at a checkout/check-in boundary and verify the first hotel is not shown on its checkout night.
7. Create and open a read-only share link without being signed in.
8. Confirm `/new-trip-v2.html` without a share token is not directly accessible.
9. Confirm the park map and itinerary maps load with the restricted browser key.
10. Download a new backup and verify the reported record count is non-zero and expected records are present.
11. Change the PIN once, then confirm old sessions are revoked and the new PIN works.
12. Check GitHub Actions deployment result and the deploy webhook response before declaring the release complete.

## Rollback

If a production smoke test fails, revert `main` to the pre-hardening commit and restore the prior live files before troubleshooting. Do not attempt several unrelated fixes directly on production. Preserve the new rotated credentials; do not reintroduce disclosed source-code secrets as a rollback mechanism.
