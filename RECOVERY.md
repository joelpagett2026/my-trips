# Backup recovery rehearsal

This guide covers recovery readiness for My Trips backups. The production site does **not** expose a restore endpoint. That is deliberate: a compromised browser session must not be able to replace the live database.

## What a valid backup contains

Version 3 backups from `backup-export.php` contain:

- all rows from the `itinerary` table, including `trip-registry`;
- per-record `updated_at` metadata;
- ordinary non-security settings;
- record and setting counts;
- an explicit list of excluded security material.

They deliberately exclude PIN/authentication settings, server sessions, failed-login records and share tokens.

## First-line recovery check

Run the offline checker on the downloaded JSON before doing any restore work:

```bash
python scripts/check-backup-recovery.py mytrips-backup-YYYY-MM-DD.json --expect porto-2026
```

A passing report verifies:

- supported backup format/version;
- valid export timestamp;
- non-zero record set;
- `record_count` and `setting_count` match the actual payload;
- `record_meta` covers exactly the exported records;
- `trip-registry` exists and contains at least one active trip;
- every active registry slug has a corresponding itinerary record with `days` and `meta`;
- requested `--expect` records are present;
- no security-like settings appear in the settings payload;
- the expected security exclusions are declared;
- a SHA-256 digest is produced so the tested file can be identified later.

The checker performs **no database writes**.

## Safe restore rehearsal

Do not rehearse a restore against production. Use a temporary/staging MySQL database with the same schema.

1. Download a fresh backup from Settings.
2. Store it somewhere private and run `check-backup-recovery.py`.
3. Record the SHA-256 printed by the checker.
4. Create a disposable database using the same table/schema definitions as production.
5. Restore only the backup's `records` into `itinerary` and ordinary `settings` into `settings`.
6. Do **not** recreate authentication sessions, failed-login records or share tokens from a backup; they are intentionally absent.
7. Configure a staging copy of the application to use the disposable database and a separate test PIN/session configuration.
8. Confirm `/trips/` shows the expected active trip count.
9. Open at least two restored itineraries and verify Itinerary, Bookings, Map and Budget data.
10. Confirm a known record such as Porto is present and its dates/content match the backup.
11. Destroy the disposable database after the rehearsal.

## Production recovery rule

A production restore should only happen after a failed live-data incident has been diagnosed and a specific backup has passed the offline checker and a staging rehearsal.

Before production recovery:

- put the site into a maintenance window or otherwise stop writes;
- take a final copy of the damaged/current database for forensic rollback;
- verify the chosen backup SHA-256 against the rehearsal report;
- preserve the **current** PIN/credentials/API keys rather than restoring old secrets;
- restore itinerary records and ordinary settings transactionally;
- re-run the normal production smoke-test checklist;
- rotate/revoke sessions if the incident involved authentication or unauthorized access.

Never add a public/browser-accessible whole-database restore endpoint as a convenience feature.
