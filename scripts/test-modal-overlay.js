#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('new-trip-v2.html', 'utf8');
const css = fs.readFileSync('itinerary-v2-style.css', 'utf8');
const runtime = fs.readFileSync('trip-delete.js', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(runtime.includes('window.__activityEditorControllerV4'), 'V4 activity editor runtime is missing');
assert(runtime.includes("document.documentElement.classList.remove('activity-editor-open')"), 'closed modal must release the document lock');
assert(runtime.includes("overlay.style.removeProperty('pointer-events')"), 'closed modal must clear any inline pointer override');
assert(runtime.includes("overlay.style.removeProperty('z-index')"), 'closed modal must clear its top-layer z-index');
assert(runtime.includes("if (target && !overlay.contains(target))"), 'open modal must shield the itinerary from click-through');
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

console.log('mobile modal overlay release V4: ok');