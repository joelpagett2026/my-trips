#!/usr/bin/env python3
"""Regression checks for atomic dashboard trip creation."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def require(ok: bool, message: str) -> None:
    if not ok:
        raise SystemExit(f"trip creation contract failed: {message}")


endpoint = read("trip-create.php")
client = read("trip-dashboard-create.js")
renderer = read("trips.php")
deploy = read("deploy-webhook.php")
htaccess = read(".htaccess")

require("beginTransaction()" in endpoint and "commit()" in endpoint,
        "trip and registry must be created in one transaction")
require("trip-registry' FOR UPDATE" in endpoint,
        "registry row must be locked while checking/appending a slug")
require("SELECT id FROM itinerary WHERE id = ? FOR UPDATE" in endpoint,
        "trip record must be checked for an existing slug")
require("INSERT INTO itinerary (id, data, updated_at) VALUES (?, ?, NOW())" in endpoint,
        "new itinerary must use a plain insert")
require("ON DUPLICATE KEY UPDATE data" not in endpoint,
        "new-trip creation must never overwrite an existing itinerary")
require("already exists', 409" in endpoint,
        "duplicate destination/year must be reported as a conflict")
require("$registry['trips'][] = $registryEntry" in endpoint,
        "registry entry must be committed by the same endpoint")

require("fetch('/trip-create.php'" in client,
        "dashboard creation must call the atomic endpoint")
require("dbSaveRegistry" not in client and "create_page" not in client,
        "new dashboard creator must not use the old two-step registry flow")
require("No partial trip was saved" in client,
        "creation failure must not claim a partial trip was retained")
require("trip-dashboard-create.js?v=1" in renderer,
        "dashboard renderer must load the atomic creator after legacy source")

require("action=(save|set_setting|create_page)" in htaccess,
        "unsafe legacy create_page action must be retired at the web edge")
require("api|auth-v2|record|trip-create" in htaccess,
        "trip-create.php must inherit same-origin API restrictions")
require("'trip-create.php'" in deploy and "'trip-dashboard-create.js'" in deploy,
        "atomic creation endpoint/client must be deployed")

print("trip creation contracts: ok")
