#!/usr/bin/env node
'use strict';

const fs = require('fs');

const runtime = fs.readFileSync('activity-editor.js', 'utf8');
const tripDelete = fs.readFileSync('trip-delete.js', 'utf8');
const html = fs.readFileSync('new-trip-v2.html', 'utf8');
const css = fs.readFileSync('itinerary-v2-style.css', 'utf8');
const completion = fs.readFileSync('itinerary-completion.js', 'utf8');
const renderer = fs.readFileSync('trip.php', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Architecture regression: trip deletion and activity editing are deliberately
// separate now. This prevents another unrelated mobile patch being appended to
// the trip-delete file and competing for the same events/overlay.
assert(tripDelete.includes("script.src = '/activity-editor.js?v="), 'trip renderer helper must load the dedicated activity editor');
assert(!tripDelete.includes('__stableDrawerActionsV2'), 'trip-delete must not own drawer item actions');
assert(!tripDelete.includes('mobile-entry-fullscreen-v5'), 'trip-delete must not own activity modal geometry');
assert(runtime.includes('window.__activityEditorControllerV1'), 'authoritative activity editor controller is missing');

// One activation model: touch/pointer only stop the drawer gesture; Add/Edit/
// Remove/Save execute from native click. This is the core protection against the
// five-item duplicate and iOS click-through regressions.
assert(runtime.includes("save.addEventListener('click', onSaveClick)"), 'Save must have one native click action');
assert(runtime.includes("button.addEventListener('click', action === 'edit' ? onEditClick : onRemoveClick)"), 'Edit/Remove must have distinct native click actions');
assert(runtime.includes("button.addEventListener('touchstart', stopGesture"), 'drawer actions must stop swipe arming at touchstart');
assert(runtime.includes('Never perform the action here'), 'touch gesture handler must be explicitly non-activating');
assert(!/addEventListener\(['"]touchend['"][\s\S]{0,500}(onSaveClick|onEditClick|onRemoveClick)/.test(runtime), 'touchend must never execute Save/Edit/Remove');
assert(runtime.includes('if (!overlay?.classList.contains(\'open\') || state.saveBusy) return;'), 'Save must have a single-flight guard');
assert(runtime.includes('if (state.removeBusy) return false;'), 'Remove must have a single-flight guard');

// Old state-guard touch handlers remain for backwards compatibility but are made
// inert by removing the inline handler and changing the live Save control ID.
assert(runtime.includes("save.id = 'activity-save-btn'"), 'controller must isolate the live Save button from legacy document handlers');
assert(runtime.includes("save.removeAttribute('onclick')"), 'inline Save onclick must be removed while the controller owns it');
assert(runtime.includes("save.id = 'modal-save-btn'"), 'legacy ID must be restored only inside the controlled Save invocation');

// Stable identity is authoritative for Edit/Remove after a server response
// replaces the STATE object graph. Fingerprints are accepted only when unique.
assert(runtime.includes("String(item._id || '') === stableId"), 'item actions must resolve by stable ID first');
assert(runtime.includes('if (matches.length === 1) itemIdx = matches[0];'), 'legacy fingerprint resolution must refuse ambiguous duplicates');

// Mobile/iPhone geometry: full-screen editor, top pinned, visible-height only.
assert(runtime.includes("setImportant(overlay, 'top', '0')"), 'fullscreen overlay must be pinned to top:0');
assert(runtime.includes("setImportant(overlay, 'height', height + 'px')"), 'fullscreen overlay must track the visible viewport height');
assert(runtime.includes("setImportant(modal, 'height', '100%')"), 'modal must fill the fullscreen overlay');
assert(runtime.includes("setImportant(modal, 'border-radius', '0')"), 'mobile modal must not regress to a bottom sheet');
assert(runtime.includes("setImportant(overlay, 'background', '#fff')"), 'fullscreen overlay must remain opaque');
assert(runtime.includes('window.visualViewport'), 'iPhone editor must use the visual viewport height');
assert(!runtime.includes('visualViewport.offsetTop'), 'iPhone editor must never double-apply visualViewport.offsetTop');
assert(!runtime.includes('visualViewport.pageTop'), 'iPhone editor must never double-apply visualViewport.pageTop');
assert(!runtime.includes("visualViewport.addEventListener('scroll'"), 'visual viewport scroll must not reposition the editor');
assert(runtime.includes("window.visualViewport.addEventListener('resize', queueMobileShell"), 'keyboard resize must resize the editor');
assert(runtime.includes('#modal-overlay .modal-foot .modal-btn.secondary { display:none !important; }'), 'mobile Cancel must stay hidden so X is the manual dismiss control');

// The legacy bottom-sheet CSS still exists, so the controller must remain the
// final authority rather than assuming the old rules disappeared.
assert(completion.includes('align-items:flex-end !important'), 'fixture no longer contains the legacy bottom-sheet rule');
assert(completion.includes('border-radius:24px 24px 0 0 !important'), 'fixture no longer contains the legacy rounded-sheet rule');
assert(runtime.includes("el.style.setProperty(property, value, 'important')"), 'critical mobile geometry must be inline !important');

const completionPos = renderer.indexOf('<script src="/itinerary-completion.js?v=');
const tripDeletePos = renderer.indexOf('<script src="/trip-delete.js?v=');
assert(completionPos >= 0 && tripDeletePos > completionPos, 'late loader must still run after itinerary-completion');
assert(html.includes('<button class="modal-close" onclick="closeModal()">×</button>'), 'template must retain the X control for controller takeover');
assert(/\.modal-overlay\{[^}]*pointer-events:none/i.test(css), 'closed overlay must not intercept touches');
assert(/\.modal-overlay\.open\{[^}]*pointer-events:auto/i.test(css), 'only an open overlay may intercept touches');

require('./test-activity-editor.js');
console.log('mobile fullscreen activity editor architecture: ok');
