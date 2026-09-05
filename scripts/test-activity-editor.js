#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('trip-delete.js', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class ClassList {
  constructor(values = []) { this.values = new Set(values); }
  contains(v) { return this.values.has(v); }
  add(v) { this.values.add(v); }
  remove(v) { this.values.delete(v); }
}

class FakeElement {
  constructor(id = '', classes = []) {
    this.id = id;
    this.classList = new ClassList(classes);
    this.dataset = {};
    this.disabled = false;
    this.textContent = '';
    this.parentElement = null;
    this.listeners = {};
    this.style = { removeProperty() {}, setProperty() {} };
    this.rect = { left:0, top:0, right:0, bottom:0, width:0, height:0 };
    this.buttons = [];
    this.isConnected = true;
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  getBoundingClientRect() { return this.rect; }
  querySelectorAll(selector) {
    if (selector === 'button') return this.buttons;
    if (selector === '.dr-text-actions .dr-text-btn') return this.buttons.filter(b => b.classList.contains('dr-text-btn'));
    return [];
  }
  querySelector() { return null; }
  contains(target) {
    if (target === this) return true;
    return this.buttons.includes(target);
  }
  closest(selector) {
    if (selector.includes('.modal-close') && this.classList.contains('modal-close')) return this;
    if (selector.includes('.dr-text-actions .dr-text-btn') && this.classList.contains('dr-text-btn')) return this;
    if (selector.includes('#modal-delete-btn') && this.id === 'modal-delete-btn') return this;
    if (selector.includes('#activity-save-btn-v4') && this.id === 'activity-save-btn-v4') return this;
    if (selector.includes('#modal-save-btn') && this.id === 'modal-save-btn') return this;
    return null;
  }
  getAttribute(name) { return name === 'onclick' ? (this.onclickText || '') : null; }
  removeAttribute(name) { if (name === 'onclick') this.onclickText = ''; }
  click() { this.clickCount = (this.clickCount || 0) + 1; }
}

const overlay = new FakeElement('modal-overlay', ['open']);
const drawer = new FakeElement('drawer');
const modal = new FakeElement('', ['modal']);
const save = new FakeElement('modal-save-btn');
save.textContent = 'Save';
save.rect = { left:20, top:430, right:300, bottom:490, width:280, height:60 };
const category = new FakeElement('', ['tt-btn']);
category.textContent = 'Meal';
category.rect = { left:210, top:120, right:310, bottom:175, width:100, height:55 };
overlay.buttons = [category, save];
overlay.querySelector = selector => selector === '.modal' ? modal : null;

const elements = [overlay, drawer, modal, save, category];
const windowListeners = {};
const created = [];
const documentElement = { classList:new ClassList(), dataset:{} };

const document = {
  head: { appendChild(node) { created.push(node); } },
  body: { appendChild() {} },
  documentElement,
  createElement(tag) { const el = new FakeElement(); el.tagName = tag.toUpperCase(); return el; },
  getElementById(id) {
    if (id === 'activity-editor-v4-style') return created.find(x => x.id === id) || null;
    return elements.find(el => el.id === id) || null;
  },
  querySelector(selector) {
    if (selector === 'script[data-activity-editor-controller="1"]') return {};
    return null;
  },
  addEventListener() {},
  dispatchEvent() {},
};

const calls = { save:0, close:0, edit:0, remove:0 };
const ctx = {
  console,
  document,
  Element: FakeElement,
  Event: class Event {},
  MutationObserver: class MutationObserver { constructor(fn) { this.fn = fn; } observe() {} },
  matchMedia: () => ({ matches:true }),
  setTimeout: fn => { fn(); return 1; },
  clearTimeout() {},
  Date,
  Math,
  Array,
  Number,
  String,
  Promise,
  alert() {},
  fetch: async () => ({ text:async()=>'{"ok":true}', ok:true, status:200 }),
  RECORD_ID: 'porto-2026',
  STATE: { days:[{ items:[{ _id:'meal-1', type:'meal', title:'Restaurant', period:'evening' }] }] },
  drawerItem: { dayIdx:0, itemIdx:0, item:{ _id:'meal-1', type:'meal', title:'Restaurant', period:'evening' } },
  editItem: null,
};
ctx.window = ctx;
ctx.window.location = { href:'' };
ctx.window.addEventListener = (type, fn) => (windowListeners[type] ||= []).push(fn);
ctx.openAddItem = () => overlay.classList.add('open');
ctx.openEditItem = () => { calls.edit += 1; overlay.classList.add('open'); };
ctx.openDrawerItem = () => drawer.classList.add('open');
ctx.closeModal = () => { calls.close += 1; overlay.classList.remove('open'); };
ctx.closeDrawer = () => drawer.classList.remove('open');
ctx.saveItem = () => { calls.save += 1; overlay.classList.remove('open'); return true; };
ctx.deleteCurrentItem = async () => { calls.remove += 1; ctx.STATE.days[0].items = []; return true; };

vm.createContext(ctx);
new vm.Script(source, { filename:'trip-delete.js' }).runInContext(ctx);

assert(ctx.__activityEditorControllerV4, 'V4 controller did not install');
assert(ctx.__activityEditorControllerV4.version === '4.0.0', 'unexpected controller version');
assert(windowListeners.touchstart?.length, 'window-capture touchstart bridge is missing');
assert(windowListeners.touchend?.length, 'window-capture touchend bridge is missing');
assert(windowListeners.click?.length, 'trusted follow-up click guard is missing');

// Coordinate lookup must find the visible modal button independently of event.target.
const hit = ctx.__activityEditorControllerV4.actionButtonAt(250, 145);
assert(hit.button === category, 'coordinate hit-testing did not find the visible category button');

function eventBase(extra = {}) {
  let prevented = false;
  let stopped = false;
  return {
    target: category,
    preventDefault() { prevented = true; },
    stopImmediatePropagation() { stopped = true; },
    prevented: () => prevented,
    stopped: () => stopped,
    ...extra,
  };
}

// Simulate the iPhone case where Safari reports the WRONG target underneath the
// painted modal. V4 must still activate the button under the finger by geometry.
const underlying = new FakeElement('', ['tl-item']);
const start = eventBase({
  target: underlying,
  touches:[{ identifier:7, clientX:250, clientY:145 }],
});
windowListeners.touchstart[0](start);
assert(start.prevented() && start.stopped(), 'button touch did not stop older document gesture handlers');

const end = eventBase({
  target: underlying,
  changedTouches:[{ identifier:7, clientX:250, clientY:145 }],
});
windowListeners.touchend[0](end);
assert(end.prevented() && end.stopped(), 'touchend did not suppress Safari synthetic click');
assert(category.clickCount === 1, 'one iPhone tap did not activate exactly one visible button');

// A later trusted synthetic click must be swallowed, preventing duplicate Save/Add.
const follow = eventBase({ target:underlying, isTrusted:true });
windowListeners.click[0](follow);
assert(follow.prevented() && follow.stopped(), 'trusted follow-up click was not suppressed');

// Touches in the modal that are not on buttons remain native so inputs/scroll work.
const field = new FakeElement('f-title');
overlay.contains = target => target === overlay || target === field || overlay.buttons.includes(target);
const fieldStart = eventBase({ target:field, touches:[{ identifier:8, clientX:120, clientY:250 }] });
windowListeners.touchstart[0](fieldStart);
assert(!fieldStart.prevented(), 'normal field touch was incorrectly blocked');

// Stable identity still resolves after an authoritative STATE replacement.
const oldDescriptor = ctx.drawerItem;
ctx.STATE = { days:[{ items:[{ _id:'meal-1', type:'meal', title:'Server copy', period:'evening' }] }] };
const resolved = ctx.__activityEditorControllerV4.resolveTarget(oldDescriptor);
assert(resolved && resolved.item === ctx.STATE.days[0].items[0], 'stable ID resolution failed after STATE replacement');

console.log('activity editor V4 iPhone touch bridge behavior: ok');