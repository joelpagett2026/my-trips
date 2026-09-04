#!/usr/bin/env node
'use strict';

const fs = require('fs');

const runtime = fs.readFileSync('trip-delete.js', 'utf8');
const html = fs.readFileSync('new-trip-v2.html', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(html.includes('onclick="editCurrentItem()"'), 'drawer Edit control is missing');
assert(runtime.includes('window.__stableDrawerItemEditV1'), 'stable drawer item edit hardening is missing');
assert(runtime.includes('function resolveDrawerEditTarget()'), 'drawer edit target resolver is missing');
assert(runtime.includes("items.findIndex(item => item && item._id === selected._id)"), 'drawer edit must recover moved items by stable id');
assert(runtime.includes('const target = resolveDrawerEditTarget();'), 'drawer edit must resolve the target before closing the drawer');
assert(runtime.includes('window.openEditItem(target.dayIdx, target.itemIdx);'), 'drawer edit must open the resolved itinerary item');
assert(runtime.includes("event.target?.closest?.('#drawer .dr-text-btn')"), 'mobile Edit touch must have a dedicated stable touch path');
assert(runtime.includes('event.preventDefault();'), 'stable Edit touch must suppress the synthetic duplicate click');

console.log('itinerary item edit control: ok');
