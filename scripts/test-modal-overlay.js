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

// The old 3 Sep controller used a separate keyboard-open state that could leave
// a full-screen pointer-catching layer alive after Save. The fullscreen shell
// may use visualViewport.height, but it must stay class-driven and must never
// translate itself by visualViewport.offsetTop (fixed elements already follow
// the visible iOS viewport).
assert(tripDelete.includes("style.id = 'mobile-entry-fullscreen-v4'"), 'the mobile fullscreen shell must be installed');
assert(tripDelete.includes('window.visualViewport'), 'the fullscreen shell must use the visible iOS viewport height');
assert(!tripDelete.includes('keyboard-open'), 'the fullscreen shell must not reintroduce legacy keyboard-open state');
assert(tripDelete.includes('releaseViewportState()'), 'the fullscreen shell must release viewport state when the modal closes');
assert(!tripDelete.includes('--entry-fullscreen-top'), 'fullscreen shell must not maintain a synthetic top offset');
assert(!tripDelete.includes('vv?.offsetTop'), 'fullscreen shell must not double-apply iOS visual viewport offset');

// itinerary-completion.js can still use visualViewport to keep focused fields in
// view. Its legacy height variable is no longer the shell geometry authority;
// the fullscreen runtime uses its own entry-fullscreen height variable.
assert(completion.includes('function setMobileViewportHeight()'), 'focused-field viewport assistance must remain available');
assert(tripDelete.includes('--entry-fullscreen-height'), 'fullscreen shell must use an isolated height variable');

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
