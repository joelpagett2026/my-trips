#!/usr/bin/env python3
"""One-time deterministic migration from committed runtime literals to placeholders.

No credential value is embedded here: replacements operate on credential-shaped
patterns. This file is removed by the one-time workflow after the migration.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def regex_replace(path: str, pattern: str, replacement: str, expected: int) -> None:
    file_path = ROOT / path
    text = file_path.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, text, flags=re.MULTILINE)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected} replacements, got {count}")
    file_path.write_text(updated, encoding="utf-8")


def exact_replace(path: str, old: str, new: str, expected: int = 1) -> None:
    file_path = ROOT / path
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected} exact matches, got {count}")
    file_path.write_text(text.replace(old, new), encoding="utf-8")


# Shared/source templates contain placeholders only. Runtime PHP injects the
# configured browser Maps key and disables the old bearer-token constant.
regex_replace(
    "new-trip-v2.html",
    r"const AUTH_TOKEN = '[a-f0-9]{64}';",
    "const AUTH_TOKEN = '__DISABLED_LEGACY_AUTH_TOKEN__';",
    1,
)
regex_replace(
    "new-trip-v2.html",
    r"const MAPS_API_KEY = 'AIza[0-9A-Za-z_-]+';",
    "const MAPS_API_KEY = '__MAPS_BROWSER_KEY__';",
    1,
)
regex_replace(
    "trips/index.html",
    r"const GOOGLE_MAPS_API_KEY = 'AIza[0-9A-Za-z_-]+';",
    "const GOOGLE_MAPS_API_KEY = '__MAPS_BROWSER_KEY__';",
    1,
)
regex_replace(
    "parks/map.html",
    r"(https://maps\.googleapis\.com/maps/api/js\?key=)AIza[0-9A-Za-z_-]+(&callback=gmReady)",
    r"\1__MAPS_BROWSER_KEY__\2",
    1,
)

# Runtime transformations accept the new placeholder. Keeping the legacy-pattern
# alternative makes a stale production copy fail-safe during deployment rather
# than breaking rendering halfway through an update.
exact_replace(
    "template-runtime.php",
    '"/const AUTH_TOKEN = \'[a-f0-9]{64}\';/",',
    '"/const AUTH_TOKEN = \'(?:__DISABLED_LEGACY_AUTH_TOKEN__|[a-f0-9]{64})\';/",',
)
exact_replace(
    "template-runtime.php",
    '"/const MAPS_API_KEY = \'AIza[0-9A-Za-z_-]+\';/",',
    '"/const MAPS_API_KEY = \'(?:__MAPS_BROWSER_KEY__|AIza[0-9A-Za-z_-]+)\';/",',
)
exact_replace(
    "template-runtime.php",
    '"/const GOOGLE_MAPS_API_KEY = \'AIza[0-9A-Za-z_-]+\';/",',
    '"/const GOOGLE_MAPS_API_KEY = \'(?:__MAPS_BROWSER_KEY__|AIza[0-9A-Za-z_-]+)\';/",',
)
exact_replace(
    "template-runtime.php",
    "'/https:\\\/\\\\/maps\\.googleapis\\.com\\/maps\\/api\\/js\\?key=AIza[0-9A-Za-z_-]+([^\"\\\']*)/',",
    "'/https:\\\/\\\\/maps\\.googleapis\\.com\\/maps\\/api\\/js\\?key=(?:__MAPS_BROWSER_KEY__|AIza[0-9A-Za-z_-]+)([^\"\\\']*)/',",
)

# Renderer fixtures use a clearly synthetic value that does not resemble a real
# Google credential, while still proving runtime injection works.
exact_replace(
    "scripts/validate-renderers.php",
    "AIzaRendererContractTestKey1234567890",
    "RendererContractTestKey1234567890",
    expected=4,
)

print("source placeholder migration: ok")
