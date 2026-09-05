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
  contains(value) { return this.values.has(value); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
}

class FakeStyle {
  constructor() { this.values = Object.create(null); }
  setProperty(name, value) { this.values[name] = String(value); }
  removeProperty(name) { delete this.values[name]; }
}

function simpleMatch(el, selector) {
  if (!el) return false;
  selector = selector.trim();
  if (!selector) return false;
  if (selector.startsWith('#')) return el.id === selector.slice(1);
  if (selector.startsWith('.')) {
    return selector.slice(1).split('.').every(cls => el.classList.contains(cls));
  }
  if (selector === 'button') return el.tagName === 'BUTTON';
  return false;
}

class FakeElement {
  constructor(id = '', classes = [], tagName = 'DIV') {
    this.id = id;
    this.classList = new ClassList(classes);
    this.dataset = Object.create(null);
    this.style = new FakeStyle();
    this.attributes = Object.create(null);
    this.listeners = Object.create(null);
    this.children = [];
    this.parentNode = null;
    this.parentElement = null;
    this.textContent = '';
    this.disabled = false;
    this.type = '';
    this.tagName = tagName;
    this.isConnected = true;
  }

  appendChild(child) {
    child.parentNode = this;
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type, handler, options) {
    (this.listeners[type] ||= []).push({ handler, capture: options === true || !!options?.capture });
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }

  descendants() {
    const out = [];
    const visit = node => node.children.forEach(child => { out.push(child); visit(child); });
    visit(this);
    return out;
  }

  matches(selector) {
    return selector.split(',').some(part => simpleMatch(this, part.trim().split(/\s+/).pop()));
  }

  closest(selector) {
    const parts = selector.split(',').map(part => part.trim().split(/\s+/).pop());
    let node = this;
    while (node) {
      if (parts.some(part => simpleMatch(node, part))) return node;
      node = node.parentElement;
    }
    return null;
  }

  querySelector(selector) {
    return this.descendants().find(el => el.matches(selector)) || null;
  }

  querySelectorAll(selector) {
    return this.descendants().filter(el => el.matches(selector));
  }

  dispatch(type, target = this) {
    let prevented = false;
    let immediateStopped = false;
    const event = {
      type,
      target,
      currentTarget: this,
      preventDefault() { prevented = true; },
      stopPropagation() {},
      stopImmediatePropagation() { immediateStopped = true; },
    };
    for (const entry of this.listeners[type] || []) {
      entry.handler.call(this, event);
      if (immediateStopped) break;
    }
    return { prevented: () => prevented, stopped: () => immediateStopped };
  }
}

function makeHarness({ mobile = true, standalone = false } = {}) {
  const all = [];
  const make = (id = '', classes = [], tag = 'DIV') => {
    const el = new FakeElement(id, classes, tag);
    all.push(el);
    return el;
  };

  const head = make('head', [], 'HEAD');
  const body = make('body', [], 'BODY');
  const overlay = make('modal-overlay', ['modal-overlay']);
  const modal = make('', ['modal']);
  const modalHead = make('', ['modal-head']);
  const title = make('modal-title', ['modal-title']);
  const tabs = make('', ['modal-tabs']);
  const close = make('', ['modal-close'], 'BUTTON');
  const bodySingle = make('modal-body-single', ['modal-body']);
  const categoryButton = make('', ['tt-btn'], 'BUTTON');
  const foot = make('', ['modal-foot']);
  const deleteButton = make('modal-delete-btn', ['modal-btn', 'danger'], 'BUTTON');
  const cancel = make('', ['modal-btn', 'secondary'], 'BUTTON');
  const save = make('modal-save-btn', ['modal-btn', 'primary'], 'BUTTON');
  save.textContent = 'Save';
  close.setAttribute('onclick', 'closeModal()');
  cancel.setAttribute('onclick', 'closeModal()');
  save.setAttribute('onclick', 'saveItem()');
  deleteButton.setAttribute('onclick', 'deleteCurrentItem()');

  modalHead.appendChild(title);
  modalHead.appendChild(tabs);
  modalHead.appendChild(close);
  bodySingle.appendChild(categoryButton);
  foot.appendChild(deleteButton);
  foot.appendChild(cancel);
  foot.appendChild(save);
  modal.appendChild(modalHead);
  modal.appendChild(bodySingle);
  modal.appendChild(foot);
  overlay.appendChild(modal);
  body.appendChild(overlay);

  const drawer = make('drawer', ['drawer']);
  const actions = make('', ['dr-text-actions']);
  const editButton = make('', ['dr-text-btn'], 'BUTTON');
  const removeButton = make('', ['dr-text-btn', 'dr-text-btn--danger'], 'BUTTON');
  editButton.textContent = 'Edit';
  removeButton.textContent = 'Remove';
  editButton.setAttribute('onclick', 'editCurrentItem()');
  removeButton.setAttribute('onclick', 'deleteCurrentItem()');
  actions.appendChild(editButton);
  actions.appendChild(removeButton);
  drawer.appendChild(actions);
  body.appendChild(drawer);

  const documentListeners = Object.create(null);
  const document = {
    head,
    body,
    documentElement: { dataset: Object.create(null) },
    createElement(tag = 'div') { return make('', [], String(tag).toUpperCase()); },
    getElementById(id) { return all.find(el => el.id === id) || null; },
    querySelector(selector) {
      if (selector === 'script[data-activity-editor-controller="1"]') {
        return all.find(el => el.tagName === 'SCRIPT' && el.dataset.activityEditorController === '1') || null;
      }
      return body.querySelector(selector);
    },
    querySelectorAll(selector) { return body.querySelectorAll(selector); },
    addEventListener(type, handler, options) {
      (documentListeners[type] ||= []).push({ handler, capture: options === true || !!options?.capture });
    },
  };

  const calls = {
    addOpen: 0,
    editOpen: 0,
    drawerOpen: 0,
    save: 0,
    remove: 0,
    closeModal: 0,
    closeDrawer: 0,
  };

  const ctx = {
    console,
    document,
    Element: FakeElement,
    navigator: { standalone },
    location: { href: '' },
    RECORD_ID: 'test-trip',
    Event: class { constructor(type) { this.type = type; } },
    fetch: async () => ({ ok:true, status:200, text:async () => '{"ok":true,"data":{}}' }),
    alert() {},
    confirm() { return true; },
    setTimeout(fn) { fn(); return 1; },
    clearTimeout() {},
    requestAnimationFrame(fn) { fn(); return 1; },
    cancelAnimationFrame() {},
    MutationObserver: class { observe() {} disconnect() {} },
    matchMedia() { return { matches: mobile }; },
    visualViewport: { height: 520, addEventListener() {} },
    innerHeight: 812,
    addEventListener() {},
    getComputedStyle(el) { return { pointerEvents: el.style.values['pointer-events'] || 'auto' }; },
    STATE: { days: [{ items: [] }] },
    activeDay: 0,
    editItem: null,
    drawerItem: null,
    setStatus() {},
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.window.matchMedia = ctx.matchMedia;
  ctx.window.visualViewport = ctx.visualViewport;
  ctx.window.addEventListener = ctx.addEventListener;

  ctx.openAddItem = function () {
    calls.addOpen += 1;
    ctx.editItem = null;
    overlay.classList.add('open');
  };
  ctx.openEditItem = function (dayIdx, itemIdx) {
    calls.editOpen += 1;
    const item = ctx.STATE.days[dayIdx]?.items?.[itemIdx];
    ctx.editItem = { dayIdx, itemIdx, item };
    ctx.drawerItem = { dayIdx, itemIdx, item };
    overlay.classList.add('open');
  };
  ctx.openDrawerItem = function (dayIdx, itemIdx) {
    calls.drawerOpen += 1;
    const item = ctx.STATE.days[dayIdx]?.items?.[itemIdx];
    ctx.drawerItem = { dayIdx, itemIdx, item };
    drawer.classList.add('open');
  };
  ctx.closeModal = function () {
    calls.closeModal += 1;
    overlay.classList.remove('open');
  };
  ctx.closeDrawer = function () {
    calls.closeDrawer += 1;
    drawer.classList.remove('open');
  };
  ctx.saveItem = function () {
    calls.save += 1;
    if (ctx.editItem?.item) {
      ctx.editItem.item.title = 'Edited restaurant';
    } else {
      ctx.STATE.days[0].items.push({ _id:'restaurant-' + calls.save, type:'meal', title:'Restaurant', period:'evening' });
    }
    overlay.classList.remove('open');
    return true;
  };
  ctx.deleteCurrentItem = async function () {
    calls.remove += 1;
    const target = ctx.drawerItem;
    const items = ctx.STATE.days[target.dayIdx].items;
    const idx = items.findIndex(item => item === target.item || (item._id && item._id === target.item?._id));
    if (idx >= 0) items.splice(idx, 1);
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    return true;
  };

  vm.createContext(ctx);
  new vm.Script(source, { filename:'trip-delete.js' }).runInContext(ctx);

  return { ctx, calls, overlay, modal, drawer, save, close, categoryButton, editButton, removeButton };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

async function runScenario(options) {
  const h = makeHarness(options);
  const { ctx, calls, overlay, modal, drawer, save, close, categoryButton, editButton, removeButton } = h;

  assert(ctx.__activityEditorControllerV3, 'V3 controller did not install from directly loaded runtime');
  assert(ctx.__activityEditorControllerV3.version === '3.0.0', 'unexpected V3 controller version');

  // ADD: a native click is the sole activation path. The controller isolates the
  // Save ID from historical document-level handlers before the click occurs.
  ctx.openAddItem();
  assert(save.id === 'activity-save-btn-v3', 'V3 did not take ownership of Save');
  assert(save.getAttribute('onclick') === null, 'legacy inline Save handler remained active');
  overlay.dispatch('click', save);
  overlay.dispatch('click', save); // modal is already closed; cannot save twice
  assert(calls.save === 1, 'one Add action executed Save more than once');
  assert(ctx.STATE.days[0].items.length === 1, 'one Add action created duplicate items');

  // Non-action controls remain native and are not swallowed by the delegated
  // capture handler. This covers category/tab buttons in the activity form.
  ctx.openAddItem();
  const categoryClick = overlay.dispatch('click', categoryButton);
  assert(!categoryClick.prevented(), 'activity form category button was swallowed by modal delegation');
  ctx.closeModal();

  // EDIT: drawer capture delegation must beat the legacy inline handler, open one
  // editor and close the details drawer.
  ctx.openDrawerItem(0, 0);
  drawer.dispatch('click', editButton);
  assert(calls.editOpen === 1, 'Edit did not open exactly one editor');
  assert(overlay.classList.contains('open'), 'Edit did not open the activity modal');
  assert(!drawer.classList.contains('open'), 'details drawer remained open behind Edit');

  // Stable IDs recover the intended item after STATE is replaced by a server copy.
  const previousDescriptor = ctx.drawerItem;
  ctx.STATE = { days:[{ items:[{ _id:previousDescriptor.item._id, type:'meal', title:'Server copy', period:'evening' }] }] };
  ctx.drawerItem = previousDescriptor;
  const resolved = ctx.__activityEditorControllerV3.resolveTarget(previousDescriptor);
  assert(resolved && resolved.item === ctx.STATE.days[0].items[0], 'V3 did not resolve a replaced item by stable ID');

  // REMOVE: exactly one delete from a native click.
  ctx.closeModal();
  ctx.openDrawerItem(0, 0);
  drawer.dispatch('click', removeButton);
  await flush();
  assert(calls.remove === 1, 'Remove did not execute exactly once');
  assert(ctx.STATE.days[0].items.length === 0, 'Remove did not delete the selected item');

  // X must remain independently clickable.
  ctx.openAddItem();
  overlay.dispatch('click', close);
  assert(!overlay.classList.contains('open'), 'X did not close the activity modal');

  if (options.mobile) {
    ctx.openAddItem();
    assert(overlay.style.values['pointer-events'] === 'auto', 'open mobile overlay is not hit-testable');
    assert(overlay.style.values['z-index'] === '2147483000', 'mobile overlay is not above competing page layers');
    assert(overlay.style.values.height === '100vh', 'mobile overlay does not cover the complete layout viewport');
    assert(modal.style.values['--activity-visible-height'] === '520px', 'inner editor does not track keyboard-visible height');
    assert(overlay.style.values.background === '#fff', 'mobile overlay can expose itinerary content behind the editor');
  }
}

(async () => {
  await runScenario({ mobile:true, standalone:false });
  await runScenario({ mobile:true, standalone:true });
  await runScenario({ mobile:false, standalone:false });
  console.log('activity editor V3 add/edit/remove/clickability tests: ok');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
