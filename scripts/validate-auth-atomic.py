#!/usr/bin/env python3
"""Regression checks for authentication atomicity and session transport behaviour."""
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

# Stage one of the browser-token migration: issue a host-only HttpOnly cookie while
# retaining the header credential as a compatibility fallback. The __Host- prefix
# plus Secure + Path=/ prevents Domain/path weakening by the browser.
require("const AUTH_SESSION_COOKIE = '__Host-jh_session';" in auth_session,
        "session cookie must use the __Host- prefix")
for cookie_flag in (
    "'path' => '/'",
    "'secure' => true",
    "'httponly' => true",
    "'samesite' => 'Strict'",
):
    require(cookie_flag in auth_session, f"session cookie must retain {cookie_flag}")
require("function requestAuthToken(string $headerFallback = '')" in auth_session,
        "server must have one cookie/header credential resolver")
require("$_COOKIE[AUTH_SESSION_COOKIE]" in auth_session,
        "credential resolver must support the HttpOnly session cookie")
require("$_SERVER['HTTP_X_AUTH_TOKEN']" in auth_session,
        "legacy header fallback must remain during the migration stage")
require("$resolved = requestAuthToken($token);" in auth_session,
        "all isAuthorizedToken callers must transparently gain cookie support")

require("$sessionToken = issueAuthSession();" in auth_v2 and
        "setAuthSessionCookie($sessionToken);" in auth_v2,
        "successful login must issue the HttpOnly cookie")
require("$token = requestAuthToken();" in auth_v2,
        "auth check/change/logout paths must resolve cookie credentials")
require("$pdo->commit();\n        setAuthSessionCookie($newSessionToken);" in auth_v2,
        "PIN change must set the replacement cookie only after transaction commit")
require("clearAuthSessionCookie();" in auth_v2,
        "logout must expire the browser cookie")
require("'session_token' => $sessionToken" in auth_v2 and
        "'session_token' => $newSessionToken" in auth_v2,
        "stage one must retain legacy token JSON until browser storage is migrated")

# Every protected data endpoint still funnels through isAuthorizedToken(), so the
# helper-level cookie fallback applies uniformly without risky endpoint rewrites.
for endpoint in (
    "api.php", "record.php", "record-delete.php", "trip-create.php",
    "trip-delete.php", "place-photo.php", "backup-export.php", "share.php",
):
    require("isAuthorizedToken(" in read(endpoint),
            f"{endpoint} must authenticate through the shared session helper")

# Logout must not claim server-side revocation if the DB delete failed.
require("Could not revoke the server session" in auth_v2,
        "logout must surface server revocation failures")

print("auth + HttpOnly cookie migration contracts: ok")
