#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('new-trip-v2.html', 'utf8');
const css = fs.readFileSync('itinerary-v2-style.css', 'utf8');
const completion = fs.readFileSync('itinerary-completion.js', 'utf8');
const controller = fs.readFileSync('activity-editor.js', 'utf8');
const tripDelete = fs.readFileSync('trip-delete.js', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Activity UI must be owned by its dedicated controller, not by trip-delete.
assert(controller.includes('window.__activityEditorControllerV1'), 'activity editor controller is missing');
assert(tripDelete.includes("script.src = '/activity-editor.js?v="), 'trip runtime must load the activity editor controller');
assert(!tripDelete.includes('mobile-entry-fullscreen-v5'), 'trip-delete must not own modal geometry anymore');
assert(!tripDelete.includes('__stableDrawerActionsV2'), 'trip-delete must not own item button gestures anymore');

// iPhone fullscreen shell consumes visual viewport height only. It must never
// override pointer-events inline: the class-driven CSS is the safety invariant
// that makes a closed overlay physically unable to block the itinerary.
assert(controller.includes('window.visualViewport'), 'activity editor must use the visible iOS viewport height');
assert(controller.includes("setImportant(overlay, 'top', '0')"), 'mobile editor must remain pinned to top:0');
assert(controller.includes("setImportant(overlay, 'height', height + 'px')"), 'mobile editor must track visible viewport height');
assert(controller.includes("setImportant(modal, 'border-radius', '0')"), 'mobile editor must not fall back to bottom-sheet geometry');
assert(!controller.includes("setImportant(overlay, 'pointer-events'"), 'controller must never leave an inline pointer-events override on the overlay');
assert(!controller.includes('visualViewport.offsetTop'), 'controller must not double-apply iOS offsetTop');
assert(!controller.includes('visualViewport.pageTop'), 'controller must not double-apply iOS pageTop');
assert(!controller.includes("visualViewport.addEventListener('scroll'"), 'visual viewport scrolling must not reposition the editor');

// Historical focused-field CSS still exists, so the new controller must be
// strong enough to coexist without moving activity behavior back into it.
assert(completion.includes('function setMobileViewportHeight()'), 'legacy focused-field assistance unexpectedly disappeared');
assert(controller.includes("el.style.setProperty(property, value, 'important')"), 'fullscreen geometry must be final inline important geometry');

assert(/\.modal-overlay\{[^}]*pointer-events:none/i.test(css), 'closed modal overlay must not intercept pointer events');
assert(/\.modal-overlay\.open\{[^}]*pointer-events:auto/i.test(css), 'only an open modal overlay may receive pointer events');

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

assert(!overlay.classList.contains('open'), 'closeModal() must remove the open class');
assert(context.editItem === null, 'closeModal() must clear edit state');
assert(context.bookingVisible === false, 'closeModal() must clear booking panel state');

console.log('mobile modal overlay release: ok');
