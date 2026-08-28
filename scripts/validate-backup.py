#!/usr/bin/env python3
"""Regression checks for the authenticated consistent backup exporter."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def require(ok: bool, message: str) -> None:
    if not ok:
        raise SystemExit(f"backup contract failed: {message}")


endpoint = read("backup-export.php")
ui = read("settings-backup.js")
renderer = read("settings.php")
htaccess = read(".htaccess")
deploy = read("deploy-webhook.php")

require("isAuthorizedToken($token, false)" in endpoint,
        "backup export must require a real server session")
require("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ" in endpoint and "beginTransaction()" in endpoint,
        "backup must read one repeatable database snapshot")
require("SELECT id, data, updated_at FROM itinerary ORDER BY id" in endpoint,
        "backup must export every itinerary record including the registry")
require("isSensitiveBackupSettingKey" in endpoint,
        "backup must centrally classify security-like settings")
for sensitive in ("pin", "password", "secret", "token", "credential", "api[_-]?key", "auth"):
    require(sensitive in endpoint, f"backup sensitive-setting filter must cover {sensitive}")
for excluded in ("auth_sessions", "auth_attempts", "share_tokens"):
    require(excluded in endpoint, f"backup must document exclusion of {excluded}")
require("record_count" in endpoint and "setting_count" in endpoint,
        "backup must report exported counts")

require("fetch('/backup-export.php'" in ui,
        "Settings must download the server-side consistent snapshot")
require("api.php?action=list" not in ui and "api.php?action=load" not in ui,
        "new backup UI must not reconstruct backups from many API reads")
require("backup.record_count" in ui and "record_count < 1" in ui,
        "browser must reject an unexpectedly empty backup")
require("settings-backup.js?v=" in renderer,
        "Settings renderer must attach the isolated backup UI module")
require("RewriteRule ^settings\\.html$ settings.php [L,QSA]" in htaccess,
        "settings.html must route through the Settings renderer")
require("backup-export" in htaccess,
        "backup endpoint must inherit same-origin web-edge restrictions")
for runtime_file in ("backup-export.php", "settings.php", "settings-backup.js"):
    require(f"'{runtime_file}'" in deploy, f"{runtime_file} must be deployed")

print("backup contracts: ok")
