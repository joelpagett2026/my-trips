#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

// Activity Editor V2 is intentionally installed by the directly-loaded
// trip-delete runtime so iOS cannot show a modal before its controller arrives.
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

class FakeElement {
  constructor(id = '', classes = []) {
    this.id = id;
    this.classList = new ClassList(classes);
    this.dataset = Object.create(null);
    this.style = new FakeStyle();
    this.attributes = Object.create(null);
    this.listeners = Object.create(null);
    this.children = [];
    this.parentNode = null;
    this.textContent = '';
    this.disabled = false;
    this.type = '';
    this.isConnected = true;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type, handler) {
    (this.listeners[type] ||= []).push(handler);
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }

  matchesSimple(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (!selector.startsWith('.')) return false;
    return selector.slice(1).split('.').every(cls => this.classList.contains(cls));
  }

  descendants() {
    const out = [];
    const visit = node => node.children.forEach(child => { out.push(child); visit(child); });
    visit(this);
    return out;
  }

  querySelector(selector) {
    if (selector === '.modal-foot .modal-btn.secondary') {
      return this.descendants().find(el => el.classList.contains('modal-btn') && el.classList.contains('secondary')) || null;
    }
    if (selector.startsWith('script[')) return null;
    const last = selector.trim().split(/\s+/).pop();
    return this.descendants().find(el => el.matchesSimple(last)) || null;
  }

  querySelectorAll(selector) {
    const last = selector.trim().split(/\s+/).pop();
    return this.descendants().filter(el => el.matchesSimple(last));
  }

  closest(selector) {
    let node = this;
    if (selector === '#modal-overlay' || selector === '#drawer') {
      const id = selector.slice(1);
      while (node) {
        if (node.id === id) return node;
        node = node.parentNode;
      }
      return null;
    }
    const last = selector.trim().split(/\s+/).pop();
    while (node) {
      if (node.matchesSimple(last)) return node;
      node = node.parentNode;
    }
    return null;
  }

  dispatch(type, extra = {}) {
    let prevented = false;
    let stopped = false;
    const event = {
      type,
      target: this,
      currentTarget: this,
      preventDefault() { prevented = true; },
      stopPropagation() { stopped = true; },
      stopImmediatePropagation() { stopped = true; },
      ...extra,
    };
    for (const handler of this.listeners[type] || []) handler.call(this, event);
    event.prevented = () => prevented;
    event.stopped = () => stopped;
    return event;
  }
}

function makeHarness({ mobile = true, standalone = false } = {}) {
  const all = [];
  const make = (id = '', classes = []) => {
    const el = new FakeElement(id, classes);
    all.push(el);
    return el;
  };

  const head = make('head');
  const body = make('body');
  const overlay = make('modal-overlay', ['modal-overlay']);
  const modal = make('', ['modal']);
  const modalHead = make('', ['modal-head']);
  const title = make('modal-title', ['modal-title']);
  const tabs = make('', ['modal-tabs']);
  const close = make('', ['modal-close']);
  const bodySingle = make('modal-body-single', ['modal-body']);
  const foot = make('', ['modal-foot']);
  const deleteButton = make('modal-delete-btn', ['modal-btn', 'danger']);
  const cancel = make('', ['modal-btn', 'secondary']);
  const save = make('modal-save-btn', ['modal-btn', 'primary']);
  save.textContent = 'Save';
  close.setAttribute('onclick', 'closeModal()');
  cancel.setAttribute('onclick', 'closeModal()');
  save.setAttribute('onclick', 'saveItem()');
  deleteButton.setAttribute('onclick', 'deleteCurrentItem()');

  modalHead.appendChild(title);
  modalHead.appendChild(tabs);
  modalHead.appendChild(close);
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
  const editButton = make('', ['dr-text-btn']);
  const removeButton = make('', ['dr-text-btn', 'dr-text-btn--danger']);
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
    createElement() { return make(); },
    getElementById(id) { return all.find(el => el.id === id) || null; },
    querySelector(selector) {
      if (selector.startsWith('script[')) return null;
      if (selector === '#activity-save-btn') return all.find(el => el.id === 'activity-save-btn') || null;
      if (selector === '#modal-save-btn') return all.find(el => el.id === 'modal-save-btn') || null;
      return body.querySelector(selector);
    },
    querySelectorAll(selector) {
      if (selector === '#drawer .dr-text-actions .dr-text-btn') return [editButton, removeButton];
      return body.querySelectorAll(selector);
    },
    addEventListener(type, handler) {
      (documentListeners[type] ||= []).push(handler);
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
    navigator: { standalone },
    crypto: { randomUUID: () => 'uuid-test' },
    alert() {},
    confirm() { return true; },
    fetch: async () => ({ ok:true, status:200, text:async () => '{"ok":true,"data":{}}' }),
    setTimeout(fn) { fn(); return 1; },
    clearTimeout() {},
    requestAnimationFrame(fn) { fn(); return 0; },
    cancelAnimationFrame() {},
    MutationObserver: class { observe() {} disconnect() {} },
    matchMedia() { return { matches: mobile }; },
    visualViewport: { height: 520, addEventListener() {} },
    innerHeight: 812,
    addEventListener() {},
    location: { href: '' },
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
      ctx.STATE.days[0].items.push({ _id: 'restaurant-' + calls.save, type: 'meal', title: 'Restaurant', period: 'evening' });
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
  new vm.Script(source, { filename: 'trip-delete.js' }).runInContext(ctx);

  return { ctx, calls, overlay, drawer, save, editButton, removeButton, deleteButton };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

function touchPress(button, pointerId = 1) {
  const start = button.dispatch('touchstart', { touches:[{ identifier:pointerId, clientX:10, clientY:10 }] });
  button.dispatch('pointerdown', { pointerType:'touch', pointerId, clientX:10, clientY:10 });
  button.dispatch('pointerup', { pointerType:'touch', pointerId, clientX:10, clientY:10 });
  return start;
}

async function runScenario(options) {
  const h = makeHarness(options);
  const { ctx, calls, overlay, drawer, save, editButton, removeButton } = h;

  assert(ctx.__activityEditorControllerV2, 'V2 controller did not install from directly loaded runtime');
  assert(ctx.__activityEditorControllerV2.version === '2.0.0', 'unexpected V2 controller version');

  // ADD — iPhone path: pointerup performs exactly one save. The later synthetic
  // click must not perform a second save, which is the five-restaurant regression.
  ctx.openAddItem();
  assert(save.id === 'activity-save-btn', 'controller did not isolate Save from legacy touch handlers');
  assert(save.getAttribute('onclick') === null, 'inline Save handler was not removed');
  if (options.mobile) {
    const saveTouch = touchPress(save, 11);
    assert(saveTouch.stopped(), 'Save touchstart did not stop competing gesture propagation');
    save.dispatch('click');
  } else {
    save.dispatch('click');
    save.dispatch('click');
  }
  assert(calls.save === 1, 'one Add activation executed Save more than once');
  assert(ctx.STATE.days[0].items.length === 1, 'one Add activation created duplicate items');

  // EDIT — touch must execute on pointerup before Safari can retarget a click.
  ctx.openDrawerItem(0, 0);
  if (options.mobile) {
    const editTouch = touchPress(editButton, 12);
    assert(editTouch.stopped(), 'Edit touchstart did not stop drawer swipe propagation');
    editButton.dispatch('click');
  } else {
    editButton.dispatch('click');
  }
  assert(calls.editOpen === 1, 'Edit did not open exactly one editor');
  assert(overlay.classList.contains('open'), 'Edit did not open the modal');
  assert(!drawer.classList.contains('open'), 'detail drawer stayed open behind Edit');

  // Stable ID must recover the intended row after server persistence replaces
  // STATE with a fresh object graph.
  const previousDescriptor = ctx.drawerItem;
  ctx.STATE = { days: [{ items: [{ _id: previousDescriptor.item._id, type:'meal', title:'Server copy', period:'evening' }] }] };
  ctx.drawerItem = previousDescriptor;
  const resolved = ctx.__activityEditorControllerV2.resolveTarget(previousDescriptor);
  assert(resolved && resolved.item === ctx.STATE.days[0].items[0], 'Edit/Remove did not recover a replaced item by stable ID');

  // REMOVE — exactly one delete and no click-through follow-up action.
  ctx.closeModal();
  ctx.openDrawerItem(0, 0);
  if (options.mobile) {
    const removeTouch = touchPress(removeButton, 13);
    assert(removeTouch.stopped(), 'Remove touchstart did not stop drawer swipe propagation');
    removeButton.dispatch('click');
  } else {
    removeButton.dispatch('click');
  }
  await flush();
  assert(calls.remove === 1, 'Remove did not execute exactly once');
  assert(ctx.STATE.days[0].items.length === 0, 'Remove did not delete the selected item');

  if (options.mobile) {
    assert(overlay.style.values.top === '0', 'mobile overlay is not pinned to top:0');
    assert(overlay.style.values.height === '520px', 'mobile overlay does not use visual viewport height');
    assert(overlay.style.values.background === '#fff', 'mobile overlay is transparent and exposes itinerary content');
  } else {
    assert(!('height' in overlay.style.values), 'desktop unexpectedly received forced mobile fullscreen height');
  }
}

(async () => {
  await runScenario({ mobile:true, standalone:false });
  await runScenario({ mobile:true, standalone:true });
  await runScenario({ mobile:false, standalone:false });
  console.log('activity editor V2 add/edit/remove behavioral tests: ok');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
