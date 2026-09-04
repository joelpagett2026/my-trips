#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('new-trip-v2.html', 'utf8');
const css = fs.readFileSync('itinerary-v2-style.css', 'utf8');
const completion = fs.readFileSync('itinerary-completion.js', 'utf8');
const tripDelete = fs.readFileSync('trip-delete.js', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Regression for the 3 Sep iOS keyboard work: trip-delete.js is a deletion
// module and must never own the activity editor overlay/visual viewport. Having
// two independent viewport controllers caused the sheet and its full-screen
// overlay to get out of sync after Save.
assert(!tripDelete.includes('modal-overlay'), 'trip-delete.js must not manipulate the activity modal overlay');
assert(!tripDelete.includes('visualViewport'), 'trip-delete.js must not install a second visualViewport controller');
assert(!tripDelete.includes('keyboard-open'), 'trip-delete.js must not own activity-modal keyboard state');

assert(completion.includes('function setMobileViewportHeight()'), 'the activity modal must retain one mobile viewport controller');
assert(completion.includes("window.visualViewport.addEventListener('resize',setMobileViewportHeight"), 'the canonical modal controller must track visual viewport resize');

// The overlay contract is class-driven: closed means invisible and unable to
// intercept touches; only .open can receive pointer events.
assert(/\.modal-overlay\{[^}]*pointer-events:none/i.test(css), 'closed modal overlay must not intercept pointer events');
assert(/\.modal-overlay\.open\{[^}]*pointer-events:auto/i.test(css), 'open modal overlay must receive pointer events');

const closeMatch = html.match(/function closeModal\(\)\s*\{[\s\S]*?\n\}/);
assert(closeMatch, 'could not locate closeModal()');

const overlay = {
  classList: {
    values: new Set(['open']),
    remove(name) { this.values.delete(name); },
    contains(name) { return this.values.has(name); }
  }
};
const context = {
  document: { getElementById(id) { return id === 'modal-overlay' ? overlay : null; } },
  editItem: { item: { title: 'Teatro Colón' } },
  bookingVisible: true,
};
vm.createContext(context);
vm.runInContext(closeMatch[0] + '\ncloseModal();', context);

assert(!overlay.classList.contains('open'), 'closeModal() must release the full-screen overlay');
assert(context.editItem === null, 'closeModal() must clear edit state');
assert(context.bookingVisible === false, 'closeModal() must clear booking panel state');

console.log('mobile modal overlay release: ok');
