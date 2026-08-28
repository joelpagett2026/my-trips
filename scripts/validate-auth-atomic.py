#!/usr/bin/env python3
"""Regression checks for authentication atomicity and hot-path DB behaviour."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def require(ok: bool, message: str) -> None:
    if not ok:
        raise SystemExit(f"auth contract failed: {message}")


auth_v2 = read("auth-v2.php")
auth_session = read("auth-session.php")

# PIN changes must be all-or-nothing: update the PIN, revoke old sessions and
# create the replacement session in one transaction.
require("$pdo->beginTransaction()" in auth_v2 and "$pdo->commit()" in auth_v2,
        "PIN change must be transactional")
require("DELETE FROM auth_sessions" in auth_v2 and "INSERT INTO auth_sessions" in auth_v2,
        "PIN change must revoke old sessions and create the replacement session")
require("if ($pdo->inTransaction()) $pdo->rollBack()" in auth_v2,
        "PIN change must roll back on failure")
require("PIN change failed; no changes were applied" in auth_v2,
        "PIN failure response must not imply a partial change")

# A temporary settings-table failure must never resurrect a stale bootstrap PIN.
require("throw new RuntimeException('Could not read the configured PIN'" in auth_session,
        "authoritative PIN lookup must fail closed on database read errors")

# Normal authenticated API traffic must avoid schema DDL/cleanup and avoid a
# last_seen write for every single request.
require("Normal authenticated traffic must not execute CREATE TABLE" in auth_session,
        "session validation must bypass schema setup on the normal hot path")
require("INTERVAL 5 MINUTE" in auth_session,
        "last_seen writes must be throttled")
require("SELECT (expires_at > NOW()) AS is_valid, last_seen_at" in auth_session,
        "session validation must use DB time and read last_seen in one query")

# Logout must not claim server-side revocation if the DB delete failed.
require("Could not revoke the server session" in auth_v2,
        "logout must surface server revocation failures")

print("auth contracts: ok")
