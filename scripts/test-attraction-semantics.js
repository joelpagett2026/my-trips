'use strict';
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('new-trip-v2.html', 'utf8');
const core = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).find(s => s.includes('function enforceAttractionSemantics'));
if (!core) throw new Error('runtime script not found');

function extract(name) {
  const start = core.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' not found');
  let i = core.indexOf('{', start), depth = 0;
  for (; i < core.length; i++) {
    if (core[i] === '{') depth++;
    else if (core[i] === '}') {
      depth--;
      if (depth === 0) return core.slice(start, i + 1);
    }
  }
  throw new Error('unterminated ' + name);
}

const ctx = vm.createContext({});
vm.runInContext([
  extract('attractionSemanticKey'),
  extract('isLegacyTicketedAttraction'),
  extract('buildAttractionSemanticRegistry'),
  extract('enforceAttractionSemantics')
].join('\n'), ctx);

const genuinePoi = { _id:'poi-1', type:'place', title:'Xujiahui Park', time:'10:00', period:'morning' };
const corruptedAttraction = { _id:'att-1', type:'place', title:'Forbidden City', time:'09:00', period:'morning' };
const state = { meta:{}, days:[{items:[genuinePoi, corruptedAttraction]}] };
const evidence = { meta:{}, days:[{items:[
  { _id:'att-1', type:'attraction', title:'Forbidden City', time:'09:00', period:'morning', booking:{url:'https://example.com'} },
  { _id:'poi-1', type:'place', title:'Xujiahui Park', time:'10:00', period:'morning' }
]}] };

if (!ctx.enforceAttractionSemantics(state, [evidence])) throw new Error('repair should report a change');
if (state.days[0].items[1].type !== 'attraction') throw new Error('historic attraction was not restored');
if (state.days[0].items[1]._semanticType !== 'attraction') throw new Error('semantic marker missing');
if (state.days[0].items[0].type !== 'place') throw new Error('genuine POI was changed');

const key = ctx.attractionSemanticKey(0, state.days[0].items[1]);
if (!state.meta._attractionSemanticKeys.includes(key)) throw new Error('registry did not retain attraction identity');

// Simulate a future controller/UI bug demoting the item before persistence.
state.days[0].items[1].type = 'place';
state.days[0].items[1]._semanticType = 'attraction';
ctx.enforceAttractionSemantics(state);
if (state.days[0].items[1].type !== 'attraction') throw new Error('semantic marker failed to prevent demotion');

// Even without marker, the persisted registry must restore the item.
delete state.days[0].items[1]._semanticType;
state.days[0].items[1].type = 'place';
ctx.enforceAttractionSemantics(state);
if (state.days[0].items[1].type !== 'attraction') throw new Error('registry failed to prevent demotion');

console.log('attraction semantic integrity: restore, preserve POIs, and prevent future demotion: ok');
