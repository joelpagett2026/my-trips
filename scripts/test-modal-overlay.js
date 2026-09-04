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
// a full-screen pointer-catching layer alive after Save. The V5 shell is the
// final layout authority and may use visualViewport.height, but it must remain
// class-driven and must never translate itself by a visual viewport top offset.
assert(tripDelete.includes("style.id = 'mobile-entry-fullscreen-v5'"), 'the final-authority mobile fullscreen shell must be installed');
assert(tripDelete.includes('window.visualViewport'), 'the fullscreen shell must use the visible iOS viewport height');
assert(!tripDelete.includes('keyboard-open'), 'the fullscreen shell must not reintroduce legacy keyboard-open state');
assert(tripDelete.includes('releaseShell()'), 'the fullscreen shell must release transient state when the modal closes');
assert(!tripDelete.includes('--entry-fullscreen-top'), 'fullscreen shell must not maintain a synthetic top offset');
assert(!tripDelete.includes('vv?.offsetTop'), 'fullscreen shell must not double-apply iOS visual viewport offset');
assert(tripDelete.includes("setImportant(overlay, 'top', '0')"), 'fullscreen shell must be pinned to top:0 as inline important geometry');
assert(tripDelete.includes("setImportant(modal, 'border-radius', '0')"), 'legacy rounded bottom-sheet geometry must not win the cascade');

// itinerary-completion.js still contains the historical bottom-sheet/focused-
// field controller. V5 intentionally wins through inline important geometry and
// delayed installation rather than depending on stylesheet order.
assert(completion.includes('function setMobileViewportHeight()'), 'focused-field viewport assistance must remain available');
assert(tripDelete.includes("el.style.setProperty(property, value, 'important')"), 'fullscreen authority must use inline important geometry');
assert(tripDelete.includes("document.addEventListener('DOMContentLoaded'"), 'fullscreen authority must install after completion styles when necessary');

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
