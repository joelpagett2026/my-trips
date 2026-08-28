#!/usr/bin/env python3
"""Offline recovery-readiness check for My Trips backup exports.

This script never connects to MySQL and never writes to production. It validates a
backup produced by backup-export.php strongly enough to catch the most common
recovery blockers before a restore is attempted in a temporary/staging database.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

SUPPORTED_VERSIONS = {3}
TRIP_SLUG_RE = re.compile(r"^[a-z0-9-]{1,120}$")
SENSITIVE_SETTING_RE = re.compile(
    r"(?:^|[_-])(pin|password|passwd|secret|token|credential|api[_-]?key|auth)(?:$|[_-])",
    re.IGNORECASE,
)
EXPECTED_EXCLUSIONS = {
    "security-like settings",
    "auth_sessions",
    "auth_attempts",
    "share_tokens",
}


class RecoveryError(ValueError):
    """Raised when a backup is not safe to treat as recovery-ready."""


@dataclass(frozen=True)
class RecoveryReport:
    version: int
    exported_at: str
    record_count: int
    setting_count: int
    registry_trip_count: int
    orphan_trip_record_count: int
    expected_records: tuple[str, ...]
    sha256: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "ok": True,
            "version": self.version,
            "exported_at": self.exported_at,
            "record_count": self.record_count,
            "setting_count": self.setting_count,
            "registry_trip_count": self.registry_trip_count,
            "orphan_trip_record_count": self.orphan_trip_record_count,
            "expected_records": list(self.expected_records),
            "sha256": self.sha256,
        }


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RecoveryError(message)


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_exported_at(value: Any) -> str:
    require(isinstance(value, str) and value.strip() != "", "missing exported_at timestamp")
    text = value.strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise RecoveryError("exported_at is not a valid ISO-8601 timestamp") from exc
    require(parsed.tzinfo is not None, "exported_at must include a timezone")
    return text


def is_trip_record(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and isinstance(value.get("days"), list)
        and isinstance(value.get("meta"), dict)
    )


def validate_backup(payload: Any, *, expected_records: tuple[str, ...], sha256: str) -> RecoveryReport:
    require(isinstance(payload, dict), "backup root must be a JSON object")
    require(payload.get("ok") is True, "backup root must contain ok=true")

    data = payload.get("data")
    require(isinstance(data, dict), "backup data object is missing")

    version = data.get("version")
    require(isinstance(version, int), "backup version is missing or invalid")
    require(version in SUPPORTED_VERSIONS, f"unsupported backup version: {version}")
    exported_at = parse_exported_at(data.get("exported_at"))

    records = data.get("records")
    require(isinstance(records, dict), "records must be a JSON object")
    require(bool(records), "backup contains zero records")
    require(all(isinstance(key, str) and key for key in records), "record ids must be non-empty strings")

    record_count = data.get("record_count")
    require(isinstance(record_count, int) and record_count >= 1, "record_count must be a positive integer")
    require(record_count == len(records), "record_count does not match the records object")

    record_meta = data.get("record_meta")
    require(isinstance(record_meta, dict), "record_meta must be a JSON object")
    require(set(record_meta) == set(records), "record_meta ids do not exactly match record ids")
    for record_id, meta in record_meta.items():
        require(isinstance(meta, dict), f"record_meta for {record_id} must be an object")
        updated_at = meta.get("updated_at")
        require(updated_at is None or isinstance(updated_at, str), f"record_meta.updated_at for {record_id} is invalid")

    settings = data.get("settings")
    require(isinstance(settings, dict), "settings must be a JSON object")
    setting_count = data.get("setting_count")
    require(isinstance(setting_count, int) and setting_count >= 0, "setting_count must be a non-negative integer")
    require(setting_count == len(settings), "setting_count does not match the settings object")
    for key, value in settings.items():
        require(isinstance(key, str) and key.strip() != "", "setting keys must be non-empty strings")
        require(not SENSITIVE_SETTING_RE.search(key.strip().lower()), f"security-like setting leaked into backup: {key}")
        require(isinstance(value, str), f"setting {key} must be stored as a string")

    excluded = data.get("excluded")
    require(isinstance(excluded, list), "excluded must be a JSON array")
    excluded_names = {str(value) for value in excluded}
    missing_exclusions = sorted(EXPECTED_EXCLUSIONS - excluded_names)
    require(not missing_exclusions, "backup does not declare expected exclusions: " + ", ".join(missing_exclusions))

    registry = records.get("trip-registry")
    require(isinstance(registry, dict), "trip-registry record is missing or invalid")
    trips = registry.get("trips")
    require(isinstance(trips, list) and len(trips) > 0, "trip-registry contains no active trips")

    registry_slugs: set[str] = set()
    for index, trip in enumerate(trips):
        require(isinstance(trip, dict), f"trip-registry entry {index} must be an object")
        slug = trip.get("slug")
        require(isinstance(slug, str) and TRIP_SLUG_RE.fullmatch(slug) is not None,
                f"trip-registry entry {index} has an invalid slug")
        require(slug not in registry_slugs, f"duplicate trip slug in registry: {slug}")
        registry_slugs.add(slug)

        require(slug in records, f"active trip is missing its itinerary record: {slug}")
        trip_record = records[slug]
        require(is_trip_record(trip_record), f"active trip record has invalid itinerary shape: {slug}")
        require(len(trip_record["days"]) > 0, f"active trip has zero itinerary days: {slug}")

    for record_id in expected_records:
        require(record_id in records, f"expected record is missing: {record_id}")

    # Orphan trip-shaped records are reported rather than rejected. Historical or
    # migrated itineraries can legitimately remain outside the active registry.
    orphan_trip_records = {
        record_id
        for record_id, value in records.items()
        if record_id != "trip-registry" and is_trip_record(value) and record_id not in registry_slugs
    }

    return RecoveryReport(
        version=version,
        exported_at=exported_at,
        record_count=record_count,
        setting_count=setting_count,
        registry_trip_count=len(registry_slugs),
        orphan_trip_record_count=len(orphan_trip_records),
        expected_records=expected_records,
        sha256=sha256,
    )


def load_backup(path: Path) -> Any:
    require(path.is_file(), f"backup file not found: {path}")
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except UnicodeDecodeError as exc:
        raise RecoveryError("backup is not valid UTF-8") from exc
    except json.JSONDecodeError as exc:
        raise RecoveryError(f"backup is not valid JSON: line {exc.lineno}, column {exc.colno}") from exc


def synthetic_backup() -> dict[str, Any]:
    return {
        "ok": True,
        "data": {
            "exported_at": "2026-08-28T20:00:00+00:00",
            "version": 3,
            "records": {
                "porto-2026": {
                    "days": [{"date": "29/08/2026", "items": []}],
                    "meta": {"dest": "Porto"},
                },
                "trip-registry": {
                    "trips": [{"slug": "porto-2026", "dest": "Porto"}],
                },
            },
            "record_meta": {
                "porto-2026": {"updated_at": "2026-08-28 20:00:00"},
                "trip-registry": {"updated_at": "2026-08-28 20:00:00"},
            },
            "settings": {"currency": "GBP"},
            "record_count": 2,
            "setting_count": 1,
            "excluded": sorted(EXPECTED_EXCLUSIONS),
        },
    }


def run_self_test() -> None:
    valid = synthetic_backup()
    report = validate_backup(valid, expected_records=("porto-2026",), sha256="test")
    require(report.registry_trip_count == 1, "self-test valid fixture did not pass")

    bad_count = json.loads(json.dumps(valid))
    bad_count["data"]["record_count"] = 99
    try:
        validate_backup(bad_count, expected_records=(), sha256="test")
    except RecoveryError:
        pass
    else:
        raise SystemExit("recovery self-test failed: record-count corruption was accepted")

    leaked_secret = json.loads(json.dumps(valid))
    leaked_secret["data"]["settings"]["api_key"] = "should-never-export"
    leaked_secret["data"]["setting_count"] = 2
    try:
        validate_backup(leaked_secret, expected_records=(), sha256="test")
    except RecoveryError:
        pass
    else:
        raise SystemExit("recovery self-test failed: secret-like setting was accepted")

    missing_trip = json.loads(json.dumps(valid))
    del missing_trip["data"]["records"]["porto-2026"]
    del missing_trip["data"]["record_meta"]["porto-2026"]
    missing_trip["data"]["record_count"] = 1
    try:
        validate_backup(missing_trip, expected_records=(), sha256="test")
    except RecoveryError:
        pass
    else:
        raise SystemExit("recovery self-test failed: missing active trip record was accepted")

    print("backup recovery checker self-test: ok")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate a My Trips JSON backup for recovery readiness without writing to a database."
    )
    parser.add_argument("backup", nargs="?", type=Path, help="path to mytrips-backup-*.json")
    parser.add_argument(
        "--expect",
        action="append",
        default=[],
        metavar="RECORD_ID",
        help="record id that must be present; may be supplied more than once",
    )
    parser.add_argument("--json", action="store_true", help="print the recovery report as JSON")
    parser.add_argument("--self-test", action="store_true", help="run built-in regression fixtures")
    args = parser.parse_args()

    if args.self_test:
        run_self_test()
        return 0

    if args.backup is None:
        parser.error("backup path is required unless --self-test is used")

    try:
        digest = file_sha256(args.backup)
        payload = load_backup(args.backup)
        report = validate_backup(payload, expected_records=tuple(args.expect), sha256=digest)
    except (RecoveryError, OSError) as exc:
        if args.json:
            print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        else:
            print(f"RECOVERY CHECK FAILED: {exc}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(report.as_dict(), indent=2))
    else:
        print("RECOVERY CHECK PASSED")
        print(f"Backup version: {report.version}")
        print(f"Exported at: {report.exported_at}")
        print(f"Database records: {report.record_count}")
        print(f"Active registry trips: {report.registry_trip_count}")
        print(f"Ordinary settings: {report.setting_count}")
        print(f"Historical/orphan trip-shaped records: {report.orphan_trip_record_count}")
        if report.expected_records:
            print("Expected records present: " + ", ".join(report.expected_records))
        print(f"SHA-256: {report.sha256}")
        print("No database writes were performed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
