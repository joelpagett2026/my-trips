#!/usr/bin/env python3
"""Focused static contracts for public itinerary sharing and reference privacy."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"share contract failed: {message}")


share = read("share.php")
ui = read("itinerary-ui.js")
htaccess = read(".htaccess")
template = read("new-trip-v2.html")

# Each capability token stores its own booking-reference visibility mode.
require("show_refs TINYINT(1) NOT NULL DEFAULT 0" in share,
        "share tokens must default to booking references hidden")
require("INSERT INTO shares (token, trip_id, show_refs, created_at)" in share,
        "share creation must persist the per-link reference mode")
require("SELECT token, show_refs, created_at FROM shares" in share,
        "share management must report each link's reference mode")

# Hidden references must be removed server-side, not just hidden with CSS/JS.
require("function stripBookingReferences" in share,
        "share renderer must have a server-side booking-reference redactor")
require("if (!$showRefs) $data = stripBookingReferences($data);" in share,
        "hidden-reference links must redact data before it leaves PHP")
for key in ["'ref'", "'bookingref'", "'bookingreference'", "'confirmationref'", "'confirmationreference'"]:
    require(key in share, f"share redactor must cover {key}")

# A caller must not be able to bypass redaction by using the retired public API
# action directly with the same capability token.
require("action=share_load" in htaccess and "RewriteRule ^api\\.php$ share.php [L,QSA]" in htaccess,
        "legacy share_load calls must route through the privacy-aware renderer")
require("if ($shareAction === 'share_load')" in share,
        "share.php must retain a compatibility JSON loader for cached clients")

# Shared pages preload the already-authorized/redacted payload. This removes the
# second browser request that previously allowed a valid share page to appear blank.
require("const result = await dbLoadShare(SHARE_TOKEN);" in template,
        "shared template preload target changed; update share.php deliberately")
require("'const result = await dbLoadShare(SHARE_TOKEN);'" in share,
        "share.php must replace the browser share-load call")
require("JSON_HEX_TAG" in share and "JSON_HEX_AMP" in share,
        "embedded share data must be safe inside an inline script")
require("Shared itinerary could not be initialized safely." in share,
        "share preload drift must fail closed instead of returning a blank shell")

# Share-management actions other than public load must require the normal random
# authenticated owner session.
require("function requireShareOwnerSession" in share and "isAuthorizedToken($token, false)" in share,
        "share creation/list/revoke must require a real owner session")
require(share.index("if ($shareAction === 'share_load')") < share.index("requireShareOwnerSession();"),
        "only share_load may run before owner-session enforcement")

# Owner UI must expose both explicit choices and never install those controls on a
# public shared copy.
require("createShareLink(false)" in ui and "hide booking references" in ui.lower(),
        "owner share modal must offer a hidden-reference link")
require("createShareLink(true)" in ui and "include booking references" in ui.lower(),
        "owner share modal must offer an included-reference link")
require("params.has('share')" in ui,
        "share-management controls must stay disabled on public shared copies")
require("/share.php?share=1&t=" in ui,
        "new share links must use the sanitized share renderer")

print("share privacy contracts: ok")
