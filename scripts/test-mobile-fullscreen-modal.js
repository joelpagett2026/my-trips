#!/usr/bin/env node
'use strict';

const fs = require('fs');

const runtime = fs.readFileSync('trip-delete.js', 'utf8');
const html = fs.readFileSync('new-trip-v2.html', 'utf8');
const css = fs.readFileSync('itinerary-v2-style.css', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(runtime.includes("style.id = 'mobile-entry-fullscreen-v4'"), 'mobile fullscreen activity editor runtime is missing');
assert(runtime.includes('window.visualViewport'), 'mobile fullscreen editor must use the iOS visual viewport height');
assert(runtime.includes("attributeFilter:['class']"), 'modal viewport runtime must clean up when the modal closes');
assert(runtime.includes("overlay.style.removeProperty('--entry-fullscreen-height')"), 'modal close must clear fullscreen height state');

// iOS fixed-position elements already move with the visible viewport. Adding
// visualViewport.offsetTop/pageTop again pushes the editor down by the amount
// Safari has panned the page, exposing the itinerary above the keyboard.
assert(!runtime.includes('vv?.offsetTop'), 'fullscreen modal must never double-apply visualViewport.offsetTop');
assert(!runtime.includes('visualViewport.offsetTop'), 'fullscreen modal must never read visualViewport.offsetTop');
assert(!runtime.includes('visualViewport.pageTop'), 'fullscreen modal must never read visualViewport.pageTop');
assert(!runtime.includes('--entry-fullscreen-top'), 'fullscreen modal must not maintain a synthetic top offset');
assert(runtime.includes('top:0 !important'), 'fullscreen modal must remain pinned to the top of the visible viewport');
assert(runtime.includes("window.visualViewport.addEventListener('resize', queueSync"), 'fullscreen modal must resize when the keyboard changes visible height');
assert(!runtime.includes("window.visualViewport.addEventListener('scroll', queueSync"), 'visual viewport scrolling must not reposition the fullscreen editor');

assert(runtime.includes('border-radius:0 !important'), 'mobile activity editor must be true fullscreen, not a bottom sheet');
assert(runtime.includes('height:100% !important'), 'mobile activity editor must fill the visual viewport shell');
assert(runtime.includes('#modal-overlay .modal::before { display:none !important; }'), 'fullscreen editor must not show a bottom-sheet grab handle');
assert(runtime.includes('#modal-overlay .modal-foot .modal-btn.secondary { display:none !important; }'), 'Cancel must be hidden on mobile so X is the only manual dismiss control');
assert(runtime.includes('background:#fff !important'), 'fullscreen editor must use an opaque surface rather than a translucent backdrop');

assert(html.includes('<button class="modal-close" onclick="closeModal()">×</button>'), 'the editor must retain the X close control');
assert(/\.modal-overlay\{[^}]*pointer-events:none/i.test(css), 'closed overlay must not intercept touches');
assert(/\.modal-overlay\.open\{[^}]*pointer-events:auto/i.test(css), 'only an open overlay may intercept touches');

console.log('mobile fullscreen activity modal: ok');
