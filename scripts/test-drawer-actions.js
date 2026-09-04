#!/usr/bin/env node
'use strict';

const fs = require('fs');
const runtime = fs.readFileSync('trip-delete.js', 'utf8');
const html = fs.readFileSync('new-trip-v2.html', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(html.includes('onclick="editCurrentItem()"'), 'drawer Edit action is missing from the template');
assert(html.includes('onclick="deleteCurrentItem()"'), 'drawer Remove action is missing from the template');
assert(runtime.includes('window.__stableDrawerActionsV2'), 'stable drawer action controller is missing');
assert(!runtime.includes('window.__stableDrawerItemEditV1'), 'legacy Edit-only touch controller must be removed');
assert(runtime.includes("onclick.includes('editCurrentItem')"), 'Edit button must be classified independently');
assert(runtime.includes("onclick.includes('deleteCurrentItem')"), 'Remove button must be classified independently');
assert(runtime.includes("if (action === 'edit') return window.editCurrentItem();"), 'Edit touch action must invoke Edit only');
assert(runtime.includes("if (action === 'remove') return window.deleteCurrentItem();"), 'Remove touch action must invoke Remove only');
assert(runtime.includes('function resolveDrawerTarget()'), 'drawer actions must resolve the live itinerary item');
assert(runtime.includes("items.findIndex(item => item && item._id === selected.item._id)"), 'drawer actions must recover items by stable id');
assert(runtime.includes('Array.from(event.changedTouches || [])'), 'touch handling must avoid assuming TouchList is iterable');
assert(runtime.includes("event.stopPropagation();\n    touchId = touch.identifier"), 'touchstart must stop the drawer swipe handler before arming an action');
assert(runtime.includes("document.addEventListener('click', event =>"), 'drawer actions need a click fallback for non-touch input');
assert(runtime.includes("selector: '#drawer .dr-text-actions .dr-text-btn'"), 'drawer actions should be scoped to the action footer');

console.log('drawer Edit/Remove interaction behavior: ok');
