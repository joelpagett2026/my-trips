#!/usr/bin/env python3
"""Static runtime contract checks for the My Trips deployment.

These checks are intentionally small and dependency-free. They catch the class of
regressions that previously produced successful commits with broken/stale live UI.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"runtime contract failed: {message}")


trip = read("trip.php")
auth = read("auth.js")
deploy = read("deploy-webhook.php")
template = read("new-trip-v2.html")
record = read("record.php")
db = read("db.js")
ui = read("itinerary-ui.js")

# Shared itinerary architecture.
require("new-trip-v2.html" in trip, "trip.php must render the shared V2 template")
require('/itinerary-state-guard.js?v=1' in trip, "trip.php must load the state safety layer")
require('/itinerary-ui.js?v=1' in trip, "trip.php must load itinerary-only UI bootstrap")
require("$hotelLookupCount === 0" in trip, "hotel source patch must fail closed if the template drifts")
require("dayDate >= ci && dayDate < co" in trip, "hotel coverage must treat checkout as exclusive")

# Ensure the source block that trip.php deliberately replaces still exists.
require("dayDate >= ci && dayDate <= co" in template, "shared template hotel compatibility source changed; update renderer deliberately")
require("Fallback: closest upcoming" in template, "shared template hotel compatibility source changed unexpectedly")

# auth.js should not own itinerary-specific presentation or hotel behaviour.
require("loadBudgetLiveRedesign" not in auth, "Budget bootstrap leaked back into auth.js")
require("installHotelLookupFix" not in auth, "hotel monkey patch leaked back into auth.js")
require("budget-live-redesign.js" not in auth, "Budget asset must not be loaded by auth.js")
require("budget-live-redesign.js" in ui, "itinerary-ui.js must load the Budget presentation")

# Conflict-safe record API and browser queue must remain paired.
require("FOR UPDATE" in record, "record.php must lock a record while checking its version")
require("expected_version" in record, "record.php must enforce expected versions")
require("409" in record, "record.php must reject stale writes")
require("_dbSaveQueues" in db, "db.js must serialize saves per record")
require("expected_version" in db, "db.js must send record versions")

# Every runtime dependency introduced above must actually be deployed.
for runtime_file in [
    "record.php",
    "itinerary-state-guard.js",
    "itinerary-ui.js",
    "budget-live-redesign.js",
    "manifest.webmanifest",
]:
    require(f"'{runtime_file}'" in deploy, f"{runtime_file} missing from deployment manifest")

# No legacy baked itinerary regeneration should return to the deployer.
require("REGENERATE ALL ITINERARY" not in deploy, "legacy baked-itinerary regeneration returned")
require("$templateV1" not in deploy, "V1 itinerary regeneration returned")

print("runtime contracts: ok")
