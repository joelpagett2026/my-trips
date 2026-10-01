#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('new-trip-v2.html', 'utf8');
const core = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('function saveItem()'));
new vm.Script(core); // Validate the actual inline/externalized runtime syntax.
function fn(name) {
  const start = core.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name);
  const end = core.indexOf('\n}', start) + 2;
  return core.slice(start, end);
}
const fields = {};
const input = (id, value = '') => fields[id] = { value, focus() {}, classList: { contains: () => false } };
input('f-type', 'attraction'); input('f-period', 'morning'); input('tab-bulk');
input('f-att-name', 'Forbidden City'); input('f-att-time', '09:00');
input('f-att-link', 'https://example.org/ticket'); input('f-att-cost', '£25');
input('f-att-notes', 'Shared notes'); input('f-att-booked', 'booked');
let selected = ['evening', 'morning', 'afternoon'];
const china = { meta: { dest: 'China' }, days: [{ items: [{ type: 'move', title: 'Beijing flight', transport: { from: 'LHR', to: 'PEK' } }], _hiddenPeriods: ['afternoon', 'evening'] }, { items: [{ title: 'Shanghai hotel', type: 'hotel' }] }] };
const untouched = JSON.stringify(china.days[1]);
const ctx = vm.createContext({ STATE: china, activeDay: 0, editItem: null,
  crypto: { randomUUID: () => 'stable-visit-id' },
  document: { getElementById: id => fields[id], querySelectorAll: () => selected.map(value => ({ value })) },
  inferPeriod: item => item.period || 'morning', alert: () => {},
  closeModal() {}, scheduleSave() {}, render() {}, renderTimeline() {}, renderRightPanel() {},
  takeSnapshot() {}, showSnapshotBar() {}, setTimeout() {}, confirm: () => true
});
vm.runInContext(['visitPeriods','visitLabel','saveItem','clearPeriod'].map(fn).join('\n'), ctx);
const json = value => JSON.parse(JSON.stringify(value));
ctx.saveItem();
let visit = china.days[0].items.find(it => it.type === 'attraction');
assert.deepEqual(json(visit.visitPeriods), ['morning','afternoon','evening']);
assert.equal(china.days[0].items.length, 2, 'one saved visit, not three billable/completable records');
assert.equal(ctx.visitLabel(visit, 'morning'), 'ALL-DAY VISIT');
assert.equal(ctx.visitLabel(visit, 'afternoon'), 'CONTINUED');
assert.equal(ctx.visitLabel(visit, 'evening'), 'CONTINUED');
assert.deepEqual(json(china.days[0]._hiddenPeriods), []);
visit.completed = true;
visit.booking.ref = 'KEEP-REFERENCE'; visit.booking.tickets = '2 adults';
ctx.editItem = { dayIdx: 0, itemIdx: china.days[0].items.indexOf(visit), item: visit };
selected = ['evening','afternoon']; fields['f-att-notes'].value = 'Updated from continuation';
ctx.saveItem();
visit = china.days[0].items.find(it => it.type === 'attraction');
assert.equal(visit._id, 'stable-visit-id'); assert.equal(visit.visitGroupId, 'stable-visit-id');
assert.equal(visit.completed, true); assert.equal(visit.booking.ref, 'KEEP-REFERENCE');
assert.equal(visit.booking.tickets, '2 adults'); assert.equal(visit.booking.note, 'Updated from continuation');
assert.equal(visit.period, 'afternoon');
assert.equal(ctx.visitLabel(visit, 'afternoon'), 'AFTERNOON & EVENING VISIT');
selected = ['morning','evening']; ctx.editItem.item = visit; ctx.saveItem();
visit = china.days[0].items.find(it => it.type === 'attraction');
assert.equal(ctx.visitLabel(visit, 'morning'), 'MORNING & EVENING VISIT');
assert.equal(ctx.visitLabel(visit, 'evening'), 'CONTINUED');
selected = []; ctx.editItem.item = visit; ctx.saveItem();
assert.equal(china.days[0].items.find(it => it.type === 'attraction'), visit, 'empty selection must not save');
selected = ['evening']; ctx.saveItem();
visit = china.days[0].items.find(it => it.type === 'attraction');
assert.equal(ctx.visitLabel(visit, 'evening'), ''); assert.equal(visit.visitGroupId, 'stable-visit-id');
ctx.editItem.item = visit; selected = ['morning','afternoon','evening']; ctx.saveItem();
ctx.confirm = () => false; ctx.clearPeriod('evening');
assert.equal(china.days[0].items.length, 2, 'cancel deletion leaves whole visit');
ctx.confirm = () => true; ctx.clearPeriod('evening');
assert.equal(china.days[0].items.length, 1, 'clear continuation removes canonical visit');
assert.equal(china.days[0].items[0].title, 'Beijing flight');
assert.equal(JSON.stringify(china.days[1]), untouched, 'unrelated China data preserved');
assert.deepEqual(json(ctx.visitPeriods({ type: 'ticket', period: 'afternoon' })), ['afternoon']);
assert.deepEqual(json(ctx.visitPeriods({ type: 'meal', period: 'evening', visitPeriods: ['morning'] })), ['evening']);

// Render each appearance against one canonical index; edit/delete use that index.
ctx.document.createElement = () => ({ dataset: {}, querySelector: () => ({ addEventListener() {} }) });
ctx.icoForType = () => ({ cls: 'ticket', html: '' }); ctx.badgeHtml = () => '';
vm.runInContext(fn('isHotelBreakfastItem') + '\n' + fn('makeItemNode'), ctx);
const fixture = { type: 'attraction', title: 'Palace', time: '09:00', visitPeriods: ['morning','afternoon','evening'] };
for (const [index, period] of fixture.visitPeriods.entries()) {
  const row = ctx.makeItemNode(fixture, 7, period);
  assert.equal(row.dataset.idx, 7);
  assert.equal(row.dataset.visitContinued, index ? '1' : '0');
  assert.ok(row.innerHTML.includes(index ? 'CONTINUED' : 'ALL-DAY VISIT'));
  assert.equal(row.innerHTML.includes('09:00'), !index, 'later appearances must not repeat morning time');
}
// Reordering an ordinary row must not duplicate a visit or drop hidden records.
const hidden = { type: 'hotel', title: 'Preserve hidden stay' };
const meal = { type: 'meal', period: 'evening', title: 'Dinner' };
ctx.STATE.days[0].items = [fixture, meal, hidden];
ctx.dragMoved = true; ctx.dragEl = {style:{}}; ctx.dragOver = null;
ctx.dragCleanup = () => {}; ctx.onDragMove = () => {}; ctx.window = {removeEventListener(){}};
ctx.document.querySelector = () => null;
ctx.document.querySelectorAll = () => ['morning','afternoon','evening'].map(period => ({
  dataset:{period},querySelectorAll:()=> (period==='evening' ? [1,0] : [0]).map(idx=>({dataset:{idx}}))
}));
vm.runInContext(fn('onDragEnd'),ctx);ctx.onDragEnd();
assert.equal(ctx.STATE.days[0].items.length,3);
assert.equal(ctx.STATE.days[0].items.filter(x=>x===fixture).length,1);
assert.ok(ctx.STATE.days[0].items.includes(hidden));
assert.deepEqual(fixture.visitPeriods,['morning','afternoon','evening']);
console.log('linked visits: creation, edits, labels, identity, single totals, cancellation, deletion, reorder and China preservation: ok');
