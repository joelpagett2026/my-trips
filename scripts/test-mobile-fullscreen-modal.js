#!/usr/bin/env node
'use strict';

const fs = require('fs');

const runtime = fs.readFileSync('trip-delete.js', 'utf8');
const html = fs.readFileSync('new-trip-v2.html', 'utf8');
const css = fs.readFileSync('itinerary-v2-style.css', 'utf8');
const completion = fs.readFileSync('itinerary-completion.js', 'utf8');
const renderer = fs.readFileSync('trip.php', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Regression for the 4 Sep iPhone screenshots: itinerary-completion.js injects
// the legacy bottom-sheet CSS during init. A fullscreen style inserted earlier
// can therefore be overwritten even if its script tag appears later in HTML.
// The final fullscreen authority must install after DOMContentLoaded when needed
// and must also set critical shell geometry inline with !important.
assert(runtime.includes("style.id = 'mobile-entry-fullscreen-v5'"), 'final-authority mobile fullscreen runtime is missing');
assert(runtime.includes("document.addEventListener('DOMContentLoaded'"), 'fullscreen authority must wait for late modal style injection when the document is still loading');
assert(runtime.includes("setImportant(overlay, 'top', '0')"), 'fullscreen overlay must be pinned to top:0 inline');
assert(runtime.includes("setImportant(overlay, 'height', height + 'px')"), 'fullscreen overlay must use the visible viewport height inline');
assert(runtime.includes("setImportant(modal, 'height', '100%')"), 'modal must fill the fullscreen overlay inline');
assert(runtime.includes("setImportant(modal, 'border-radius', '0')"), 'modal must not fall back to bottom-sheet rounded corners');
assert(runtime.includes("setImportant(overlay, 'background', '#fff')"), 'fullscreen overlay must remain opaque instead of exposing the itinerary');
assert(runtime.includes("setImportant(foot, 'display', 'flex')"), 'Save footer must remain a normal flex footer above the keyboard');
assert(runtime.includes("setImportant(secondary, 'display', 'none')"), 'Cancel must remain hidden on mobile so X is the only manual dismiss control');
assert(runtime.includes("setImportant(save, 'flex', '1 1 auto')"), 'Save must fill the available footer width');
assert(runtime.includes("overlay.dataset.fullscreenShell = 'v5'"), 'runtime must expose a diagnostic fullscreen-shell marker');

// iOS fixed-position elements already follow the visible viewport. Never add
// the visual viewport top/page offset again; doing so moves the modal down twice.
assert(runtime.includes('window.visualViewport'), 'mobile fullscreen editor must use the iOS visual viewport height');
assert(!runtime.includes('vv?.offsetTop'), 'fullscreen modal must never double-apply visualViewport.offsetTop');
assert(!runtime.includes('visualViewport.offsetTop'), 'fullscreen modal must never read visualViewport.offsetTop');
assert(!runtime.includes('visualViewport.pageTop'), 'fullscreen modal must never read visualViewport.pageTop');
assert(!runtime.includes('--entry-fullscreen-top'), 'fullscreen modal must not maintain a synthetic top offset');
assert(runtime.includes("window.visualViewport.addEventListener('resize', queueApply"), 'fullscreen modal must resize when the keyboard changes visible height');
assert(!runtime.includes("window.visualViewport.addEventListener('scroll', queueApply"), 'visual viewport scrolling must not reposition the fullscreen editor');

// The old controller is still present for focused-field assistance, so the V5
// shell must be demonstrably stronger than it rather than relying on CSS order.
assert(completion.includes('align-items:flex-end !important'), 'fixture no longer contains the legacy bottom-sheet rule this regression protects against');
assert(completion.includes('border-radius:24px 24px 0 0 !important'), 'fixture no longer contains the legacy rounded bottom-sheet rule');
assert(runtime.includes("el.style.setProperty(property, value, 'important')"), 'critical shell geometry must use inline !important styles');

const completionPos = renderer.indexOf('<script src="/itinerary-completion.js?v=');
const tripDeletePos = renderer.indexOf('<script src="/trip-delete.js?v=');
assert(completionPos >= 0 && tripDeletePos > completionPos, 'trip renderer must load the fullscreen authority after itinerary completion code');

assert(runtime.includes('#modal-overlay .modal::before { display:none !important; content:none !important; }'), 'fullscreen editor must not show a bottom-sheet grab handle');
assert(runtime.includes('#modal-overlay .modal-foot .modal-btn.secondary { display:none !important; }'), 'Cancel must be hidden in the final stylesheet too');
assert(html.includes('<button class="modal-close" onclick="closeModal()">×</button>'), 'the editor must retain the X close control');
assert(/\.modal-overlay\{[^}]*pointer-events:none/i.test(css), 'closed overlay must not intercept touches');
assert(/\.modal-overlay\.open\{[^}]*pointer-events:auto/i.test(css), 'only an open overlay may intercept touches');

console.log('mobile fullscreen activity modal final-authority behavior: ok');
