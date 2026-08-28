#!/usr/bin/env python3
"""Fail CI if retired or cross-origin general API behaviours return."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
api = (ROOT / "api.php").read_text(encoding="utf-8")
htaccess = (ROOT / ".htaccess").read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"api-surface contract failed: {message}")


require("$publicActions = ['share_load'];" in api,
        "share_load must remain the only unauthenticated general API action")
require("Access-Control-Allow-Origin" not in api,
        "api.php must not emit permissive CORS headers")

retired = {
    "case 'save':": "whole-record save must use record.php",
    "case 'set_setting':": "generic settings writes must stay retired",
    "case 'get_setting':": "generic settings reads could expose PIN/security hashes",
    "case 'create_page':": "trip creation must use trip-create.php",
    "case 'delete':": "record deletion must use record-delete.php/trip-delete.php",
    "case 'place_photo_v2':": "photo requests must use place-photo.php",
    "case 'place_photo':": "legacy photo requests must use place-photo.php",
}
for needle, reason in retired.items():
    require(needle not in api, reason)

# Keep the web-server rules as a second layer: historical client calls should be
# routed to their dedicated safe endpoint or rejected, never fall through.
require("action=(save|set_setting|create_page)" in htaccess,
        "Apache must keep rejecting retired legacy write actions")
require("action=(place_photo_v2|place_photo)" in htaccess and "place-photo.php" in htaccess,
        "Apache must keep routing historical photo actions to the safe proxy")
require("action=delete" in htaccess and "record-delete.php" in htaccess,
        "Apache must keep routing generic deletion to the guarded endpoint")

print("general API surface contracts: ok")
