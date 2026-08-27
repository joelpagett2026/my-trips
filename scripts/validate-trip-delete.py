#!/usr/bin/env python3
"""Regression checks for atomic itinerary deletion."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def require(ok: bool, message: str) -> None:
    if not ok:
        raise SystemExit(f"trip deletion contract failed: {message}")


endpoint = read("trip-delete.php")
client = read("trip-delete.js")
renderer = read("trip.php")
deploy = read("deploy-webhook.php")
htaccess = read(".htaccess")

require("beginTransaction()" in endpoint and "commit()" in endpoint,
        "trip deletion must be transactional")
require("trip-registry' FOR UPDATE" in endpoint,
        "registry must be locked before deleting a trip")
require("SELECT id FROM itinerary WHERE id = ? FOR UPDATE" in endpoint,
        "trip row must be locked during deletion")
require("DELETE FROM itinerary WHERE id = ?" in endpoint,
        "itinerary record must be deleted")
require("$id . '-snaps'" in endpoint,
        "snapshot history must be deleted with its trip")
require("DELETE FROM shares WHERE trip_id = ?" in endpoint,
        "share links must be revoked with the trip")
require("array_filter" in endpoint and "['slug']" in endpoint,
        "trip registry card must be removed in the same transaction")
require("Protected record" in endpoint,
        "system records must not be deletable through the trip endpoint")

require("fetch('/trip-delete.php'" in client,
        "itinerary deletion must use the atomic endpoint")
require("dbDelete" not in client and "dbSaveRegistry" not in client,
        "atomic delete client must not repeat the old two-step cleanup")
require("Nothing was partially deleted" in client,
        "failure message must reflect transactional behavior")
require("/trip-delete.js?v=1" in renderer,
        "trip renderer must load the atomic deletion override")

require("api|auth-v2|record|trip-create|trip-delete" in htaccess,
        "trip-delete.php must inherit same-origin API restrictions")
require("trip-dashboard-create|trip-delete|budget-live-redesign" in htaccess,
        "trip-delete.js must bypass the long JavaScript cache")
require("'trip-delete.php'" in deploy and "'trip-delete.js'" in deploy,
        "atomic delete endpoint/client must be deployed")

print("trip deletion contracts: ok")
