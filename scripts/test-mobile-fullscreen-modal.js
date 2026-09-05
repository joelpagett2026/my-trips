#!/usr/bin/env node
'use strict';

const fs = require('fs');

const runtime = fs.readFileSync('trip-delete.js', 'utf8');
const compatibility = fs.readFileSync('activity-editor.js', 'utf8');
const html = fs.readFileSync('new-trip-v2.html', 'utf8');
const css = fs.readFileSync('itinerary-v2-style.css', 'utf8');
const completion = fs.readFileSync('itinerary-completion.js', 'utf8');
const renderer = fs.readFileSync('trip.php', 'utf8');
const deployer = fs.readFileSync('deploy-webhook.php', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Test the code that actually runs in production. The previous suite inspected
// activity-editor.js even though the live controller in trip-delete.js made that
// file inert via the V1 compatibility guard.
assert(runtime.includes('window.__activityEditorControllerV4'), 'live V4 controller is missing');
assert(runtime.includes("version: '4.0.0'"), 'live controller version is not V4');
assert(runtime.includes("script.src = '/activity-editor.js?v=20260905-2'"), 'compatibility controller cache-bust is missing');
assert(compatibility.includes('window.__activityEditorControllerV1'), 'compatibility file must still honour the V1 guard');
assert(deployer.includes("'activity-editor.js',"), 'production deployer must still copy the compatibility file');

// iPhone interaction architecture: WINDOW capture precedes older document-level
// gesture handlers. Physical touch is converted into one programmatic click by
// button geometry, not by Safari's sometimes-wrong event.target.
assert(runtime.includes("window.addEventListener('touchstart'"), 'window-capture touchstart bridge is missing');
assert(runtime.includes("window.addEventListener('touchend'"), 'window-capture touchend bridge is missing');
assert(runtime.includes('visibleButtonAt('), 'coordinate button hit-testing is missing');
assert(runtime.includes('session.button.click()'), 'touch bridge must activate the resolved button exactly once');
assert(runtime.includes('event.preventDefault();\n      event.stopImmediatePropagation();'), 'touch bridge must block competing legacy gesture handlers');
assert(runtime.includes('suppressTrustedClickUntil'), 'follow-up trusted click suppression is missing');
assert(runtime.includes('state.manualClickDepth'), 'manual click must bypass its own trusted-click guard');
assert(runtime.includes('!overlay.contains(target)'), 'modal-visible click-through shielding is missing');

// Save and Remove remain single-flight and Edit/Remove resolve by stable ID.
assert(runtime.includes('if (!overlay?.classList.contains(\'open\') || !save || state.saveBusy) return false;'), 'Save single-flight guard is missing');
assert(runtime.includes('if (state.removeBusy) return false;'), 'Remove single-flight guard is missing');
assert(runtime.includes("String(item._id || '') === stableId"), 'stable ID must be authoritative for Edit/Remove');
assert(runtime.includes('if (matches.length === 1) itemIdx = matches[0];'), 'ambiguous pre-ID duplicates must not be guessed');

// Fullscreen modal is now pure dynamic-viewport CSS. This avoids the previous
// visualViewport render/hit-test split in the iPhone Home Screen app.
assert(runtime.includes('height:100dvh !important;'), 'mobile editor must use dynamic viewport height');
assert(runtime.includes('border-radius:0 !important;'), 'mobile editor must not regress to a bottom sheet');
assert(runtime.includes('background:#fff !important;'), 'mobile editor must remain opaque');
assert(runtime.includes('touch-action:auto !important;'), 'modal shell must not suppress button taps');
assert(runtime.includes('#modal-overlay .modal-foot .modal-btn.secondary { display:none !important; }'), 'mobile Cancel must remain hidden so X is the manual dismiss control');
assert(!runtime.includes('visualViewport.offsetTop'), 'mobile editor must never apply visualViewport.offsetTop');
assert(!runtime.includes('visualViewport.pageTop'), 'mobile editor must never apply visualViewport.pageTop');

// Old bottom-sheet styles are still present elsewhere, so V4 must remain strong
// enough to override them rather than assuming they were removed.
assert(completion.includes('align-items:flex-end !important'), 'fixture no longer contains legacy bottom-sheet rule');
assert(completion.includes('border-radius:24px 24px 0 0 !important'), 'fixture no longer contains legacy rounded-sheet rule');

const completionPos = renderer.indexOf('<script src="/itinerary-completion.js?v=');
const tripDeletePos = renderer.indexOf('<script src="/trip-delete.js?v=');
assert(completionPos >= 0 && tripDeletePos > completionPos, 'V4 runtime must load after legacy completion code so it is final authority');
assert(html.includes('<button class="modal-close" onclick="closeModal()">×</button>'), 'template must retain the X control for V4 capture takeover');
assert(/\.modal-overlay\{[^}]*pointer-events:none/i.test(css), 'closed overlay must not intercept touches');
assert(/\.modal-overlay\.open\{[^}]*pointer-events:auto/i.test(css), 'only an open overlay may receive touches');

require('./test-activity-editor.js');
console.log('mobile fullscreen Activity Editor V4 architecture: ok');