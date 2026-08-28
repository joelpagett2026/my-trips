#!/usr/bin/env python3
"""Fail CI if credential-shaped literals are committed to source.

Browser Maps credentials are injected at runtime from MAPS_BROWSER_KEY. This
validator intentionally checks committed source, not generated runtime output.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SKIP_DIRS = {".git", "node_modules", "vendor", "__pycache__"}
SKIP_FILES = {
    # This validator itself necessarily contains the detection regexes below.
    Path("scripts/validate-source-hygiene.py"),
}
TEXT_EXTENSIONS = {
    ".html", ".htm", ".js", ".mjs", ".cjs", ".css", ".php", ".py",
    ".json", ".yml", ".yaml", ".md", ".txt", ".sh", ".xml", ".webmanifest",
}

PATTERNS = {
    "Google API key": re.compile(r"AIza[0-9A-Za-z_-]{20,}"),
    "Anthropic API key": re.compile(r"sk-ant-[0-9A-Za-z_-]{16,}", re.IGNORECASE),
    "AWS access key": re.compile(r"AKIA[0-9A-Z]{16}"),
    "fixed legacy AUTH_TOKEN": re.compile(r"const\s+AUTH_TOKEN\s*=\s*['\"][a-f0-9]{64}['\"]\s*;", re.IGNORECASE),
}


def candidate_files():
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(ROOT)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        if rel in SKIP_FILES:
            continue
        if path.suffix.lower() not in TEXT_EXTENSIONS and path.name not in {".htaccess"}:
            continue
        yield path, rel


def main() -> int:
    findings: list[str] = []
    for path, rel in candidate_files():
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for label, pattern in PATTERNS.items():
            for match in pattern.finditer(text):
                line = text.count("\n", 0, match.start()) + 1
                findings.append(f"{rel}:{line}: {label}")

    if findings:
        print("source hygiene check failed: credential-shaped literals are committed", file=sys.stderr)
        for finding in findings:
            print(" - " + finding, file=sys.stderr)
        return 1

    print("source credential hygiene: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
