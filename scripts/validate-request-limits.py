#!/usr/bin/env python3
"""Static checks that sensitive JSON endpoints keep explicit body-size limits."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"request-limit contract failed: {message}")


checks = {
    "auth-v2.php": ("AUTH_MAX_REQUEST_BYTES", 16_384),
    "record.php": ("RECORD_MAX_REQUEST_BYTES", 8_000_000),
    "trip-create.php": ("TRIP_CREATE_MAX_REQUEST_BYTES", 3_000_000),
    "trip-delete.php": ("TRIP_DELETE_MAX_REQUEST_BYTES", 65_536),
    "record-delete.php": ("RECORD_DELETE_MAX_REQUEST_BYTES", 65_536),
}

for path, (constant, limit) in checks.items():
    text = read(path)
    require(constant in text, f"{path} must define {constant}")
    require("CONTENT_LENGTH" in text, f"{path} must reject oversized requests before reading the body")
    require("Request too large" in text and "413" in text, f"{path} must return HTTP 413 for oversized bodies")
    require("php://input" in text, f"{path} must read JSON from php://input")
    require(str(limit) in text or f"{limit:_}" in text, f"{path} limit changed unexpectedly")

record = read("record.php")
require("expected_version" in record and "FOR UPDATE" in record,
        "record body limits must not replace conflict-safe save preconditions")

trip_create = read("trip-create.php")
require("2_500_000" in trip_create,
        "trip creation must retain the independent cover-photo size cap")

print("request body limit contracts: ok")
