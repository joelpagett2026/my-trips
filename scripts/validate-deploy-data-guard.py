#!/usr/bin/env python3
"""Ensure production deploys cannot target an empty/wrong itinerary database."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
deploy = (ROOT / "deploy-webhook.php").read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"deploy-data-guard contract failed: {message}")


require("function deploymentPreflight" in deploy,
        "deploymentPreflight must remain the gate before live copies")
require("id = 'trip-registry'" in deploy,
        "preflight must verify the authoritative trip-registry record")
require("Trip registry is missing from the configured database" in deploy,
        "missing registry must fail deployment")
require("Trip registry is invalid in the configured database" in deploy,
        "malformed registry must fail deployment")
require("Trip registry contains no active itineraries" in deploy,
        "empty production registry must fail deployment")
require("registry_trip_count" in deploy,
        "deploy response must expose only a non-sensitive active trip count")
require("live_files_untouched" in deploy,
        "preflight failure must explicitly report that live files were untouched")

# The preflight must run before the deployment starts creating/copying live files.
preflight_call = deploy.find("$preflight = deploymentPreflight();")
copy_start = deploy.find("$directories = [")
require(preflight_call >= 0 and copy_start >= 0 and preflight_call < copy_start,
        "database/data preflight must happen before any live deployment work")

print("deployment database guard contracts: ok")
