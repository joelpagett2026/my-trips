#!/usr/bin/env python3
"""Regression checks for client-side stale-save conflict latching."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
db = (ROOT / "db.js").read_text(encoding="utf-8")
state_guard = (ROOT / "itinerary-state-guard.js").read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"save-conflict contract failed: {message}")


require("const _recordConflicts = new Set();" in db,
        "db.js must remember records that have hit a stale-write conflict")
require("if (_recordConflicts.has(id)) throw staleRecordError(id);" in db,
        "queued autosaves must stop after a stale-write conflict")
require("_recordConflicts.add(id)" in db and "err.status === 409" in db,
        "HTTP 409 responses must latch the conflicted record")
require("_recordConflicts.delete(id)" in db and "async function dbLoad(id)" in db,
        "a deliberate reload must clear the conflict latch after observing server state")
require("mytrips:save-conflict" in db,
        "the first server conflict must remain observable by the UI")
require("conflict = e && e.status === 409" in state_guard and "reload" in state_guard.lower(),
        "the itinerary UI must tell the user to reload after a conflict")

print("save conflict contracts: ok")
