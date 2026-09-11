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
auth_js = read("auth.js")

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

# The real browser credential must live in a host-only Secure/HttpOnly cookie.
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
        "temporary legacy header migration must remain available")
require("$resolved = requestAuthToken($token);" in auth_session,
        "all isAuthorizedToken callers must transparently gain cookie support")

# Stage two: authentication JSON may expose only a non-secret compatibility marker,
# never either generated 256-bit session credential.
require("const AUTH_BROWSER_SESSION_MARKER = 'cookie-session';" in auth_v2,
        "auth endpoint must define the non-secret browser marker")
require(auth_v2.count("'session_token' => AUTH_BROWSER_SESSION_MARKER") >= 3,
        "login/check/PIN-change responses must return only the browser marker")
require("'session_token' => $sessionToken" not in auth_v2,
        "login must never serialize the raw session token")
require("'session_token' => $newSessionToken" not in auth_v2,
        "PIN change must never serialize the replacement raw session token")
require("$sessionToken = issueAuthSession();" in auth_v2 and
        "setAuthSessionCookie($sessionToken);" in auth_v2,
        "successful login must put the real credential only into HttpOnly cookie transport")
require("$pdo->commit();\n        setAuthSessionCookie($newSessionToken);" in auth_v2,
        "PIN change must set the replacement cookie only after transaction commit")
require("$hadCookie = trim((string)($_COOKIE[AUTH_SESSION_COOKIE] ?? '')) !== '';" in auth_v2 and
        "if (!$hadCookie) setAuthSessionCookie($token);" in auth_v2,
        "a successful legacy header check must migrate that session into HttpOnly cookie transport")
require("clearAuthSessionCookie();" in auth_v2,
        "logout must expire the browser cookie")

# Browser storage is now explicitly non-secret. A valid legacy token can be read
# once for migration, but every successful check/login overwrites storage with the
# harmless marker and authority remains locked until /check succeeds server-side.
require("const SESSION_MARKER = 'cookie-session';" in auth_js,
        "browser auth code must use the same non-secret marker")
require("function storeSession()" in auth_js and
        "sessionToken: SESSION_MARKER" in auth_js,
        "browser storage must persist only the marker")
require("storeSession(sessionToken)" not in auth_js,
        "browser storage helper must not accept a raw credential")
require("/^[a-f0-9]{64}$/i.test(value) || value === SESSION_MARKER" in auth_js,
        "browser may recognize a legacy raw token only for one-time migration")
require("fetch('/auth-v2.php?action=check'" in auth_js and
        "credentials: 'same-origin'" in auth_js,
        "browser must ask the server to validate cookie/session authority on startup")
require("if (await validateCurrentSession()) return;" in auth_js,
        "private UI must wait for successful server-side session validation")
require("window._mytripsAuthed === true" in auth_js,
        "isAuthed must reflect validated runtime authority, not storage contents")
require("storeSession();\n        announceAuthed();" in auth_js,
        "successful validation must overwrite any legacy token before unlocking the UI")
require("json.data.session_token !== SESSION_MARKER" in auth_js,
        "new PIN login must require the expected non-secret server marker")

# Every protected data endpoint still funnels through isAuthorizedToken(), so the
# cookie-first helper applies uniformly without risky endpoint rewrites. Existing
# clients may continue sending a harmless X-Auth-Token marker.
for endpoint in (
    "api.php", "record.php", "record-delete.php", "trip-create.php",
    "trip-delete.php", "place-photo.php", "backup-export.php", "share.php",
):
    require("isAuthorizedToken(" in read(endpoint),
            f"{endpoint} must authenticate through the shared session helper")

# Logout must not claim server-side revocation if the DB delete failed.
require("Could not revoke the server session" in auth_v2,
        "logout must surface server revocation failures")

print("auth + non-secret browser session contracts: ok")
