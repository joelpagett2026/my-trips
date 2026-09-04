#!/usr/bin/env node
'use strict';

const fs = require('fs');

const runtime = fs.readFileSync('trip-delete.js', 'utf8');
const html = fs.readFileSync('new-trip-v2.html', 'utf8');
const css = fs.readFileSync('itinerary-v2-style.css', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(runtime.includes("style.id = 'mobile-entry-fullscreen-v3'"), 'mobile fullscreen activity editor runtime is missing');
assert(runtime.includes('window.visualViewport'), 'mobile fullscreen editor must follow the iOS visual viewport');
assert(runtime.includes("attributeFilter:['class']"), 'modal viewport runtime must clean up when the modal closes');
assert(runtime.includes("overlay.style.removeProperty('--entry-fullscreen-height')"), 'modal close must clear fullscreen height state');
assert(runtime.includes("overlay.style.removeProperty('--entry-fullscreen-top')"), 'modal close must clear fullscreen top state');

assert(runtime.includes('border-radius:0 !important'), 'mobile activity editor must be true fullscreen, not a bottom sheet');
assert(runtime.includes('height:100% !important'), 'mobile activity editor must fill the visual viewport shell');
assert(runtime.includes('#modal-overlay .modal::before { display:none !important; }'), 'fullscreen editor must not show a bottom-sheet grab handle');
assert(runtime.includes('#modal-overlay .modal-foot .modal-btn.secondary { display:none !important; }'), 'Cancel must be hidden on mobile so X is the only manual dismiss control');
assert(runtime.includes('background:#fff !important'), 'fullscreen editor must use an opaque surface rather than a translucent backdrop');

assert(html.includes('<button class="modal-close" onclick="closeModal()">×</button>'), 'the editor must retain the X close control');
assert(/\.modal-overlay\{[^}]*pointer-events:none/i.test(css), 'closed overlay must not intercept touches');
assert(/\.modal-overlay\.open\{[^}]*pointer-events:auto/i.test(css), 'only an open overlay may intercept touches');

console.log('mobile fullscreen activity modal: ok');
