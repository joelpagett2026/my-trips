#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('new-trip-v2.html', 'utf8');
const core = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('function saveItem()'));
function fn(name) {
  const start = core.indexOf('function '+name+'(');
  assert.ok(start >= 0, name);
  return core.slice(start, core.indexOf('\n}', start)+2);
}
class Element {
  constructor(id='') {
    this.id=id; this.value=''; this.dataset={}; this.style={removeProperty(){},setProperty(){}};
    this.listeners={}; this.textContent='Save'; this.disabled=false;
    const classes = new Set();
    this.classList={contains:x=>classes.has(x),add:x=>classes.add(x),remove:x=>classes.delete(x),toggle(x,on){if(on)classes.add(x);else classes.delete(x);}};
  }
  appendChild(){}
  addEventListener(type, cb){(this.listeners[type] ||= []).push(cb);}
  removeAttribute(){} setAttribute(){} focus(){} blur(){} matches(){return false;}
  closest(s){return s.includes('#'+this.id)?this:null;}
  querySelector(){return null;} querySelectorAll(){return [];}
  contains(el){return el===this;} getBoundingClientRect(){return {left:0,top:0,right:0,bottom:0,width:0,height:0};}
}
const elements = [...html.split('<script>')[0].matchAll(/\bid="([^"]+)"/g)].map(m=>new Element(m[1]));
const periods=['morning','afternoon','evening'].map(value=>({value,checked:false}));
const docListeners={};
const document={
  readyState:'complete',documentElement:new Element(),body:new Element(),head:{appendChild(el){elements.push(el);}},
  activeElement:null,createElement:()=>new Element(),
  getElementById:id=>elements.find(el=>el.id===id)||null,
  querySelector:()=>null,
  querySelectorAll:s=>s==='#f-att-periods input'?periods:s==='#f-att-periods input:checked'?periods.filter(p=>p.checked):[],
  addEventListener(type,cb){(docListeners[type] ||= []).push(cb);},dispatchEvent(){},
};
let server={meta:{},days:[{items:[{_id:'disney',type:'attraction',title:'Shanghai Disney',period:'morning',status:null,visitPeriods:['morning','afternoon']}]}]};
const clone=v=>JSON.parse(JSON.stringify(v));
const statuses=[];
let releaseWrite=null;
const ctx={document,Element,HTMLElement:Element,MutationObserver:class {observe(){} disconnect(){}},
  STATE:clone(server),activeDay:0,editItem:null,drawerItem:null,RECORD_ID:'china-2026',snapshotList:[],
  crypto:{randomUUID:()=> 'new-id'},inferPeriod:()=> 'morning',
  console,Promise,Map,Set,Date,Math,JSON,performance:{now:()=>1000},
  setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},
  matchMedia:()=>({matches:false}),addEventListener(){},location:{},
  currentView:'bookings', renderedBooking:null,
  renderSidebar(){},renderDaySelector(){},renderMobNav(){},renderDaySummary(){},renderTimeline(){},renderRightPanel(){},
  renderBookingsView(){ctx.renderedBooking=clone(ctx.STATE.days[0].items[0]);},
  scheduleSave(){},setStatus:s=>statuses.push(s),syncRegistryCities(){},
  setTransportType(){},setMoveStatus(){},setMealStatus(){},setMealKind(){},updateCarHireMapsLinks(){},
  alert:message=>{throw new Error(message);},
  __mytripsLoadedRecords:new Map(),
  async dbUpsertItineraryItem(id,day,index,item,original){
    await new Promise(resolve=>{releaseWrite=resolve;});
    assert.deepEqual(clone(original),server.days[day].items[index],'edit must compare against persisted item');
    server.days[day].items[index]=clone(item);
    return {data:clone(server)};
  },
};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(['render','visitPeriods','setVisitPeriods','openEditItem','clearForm','setCategory','onCategoryChange','setAttBooked','openModal','shouldAutoFocusModalInput','setModalTab','closeModal','saveItem','isLegacyTicketedAttraction'].map(fn).join('\n'),ctx);
vm.runInContext(fs.readFileSync('itinerary-state-guard.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('trip-delete.js','utf8'),ctx);
async function drain(){for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));}
function pressSave(){
  const save=document.getElementById('activity-save-btn-v4')||document.getElementById('modal-save-btn');
  const overlay=document.getElementById('modal-overlay');
  for(const cb of overlay.listeners.click||[])cb({target:save,preventDefault(){},stopImmediatePropagation(){}});
}
(async()=>{
  ctx.openEditItem(0,0);
  ctx.setAttBooked('booked');
  document.getElementById('f-att-cost').value='£150';
  pressSave();await drain();
  assert.equal(document.getElementById('modal-overlay').classList.contains('open'),true,'editor stays open until server confirmation');
  assert.equal(document.getElementById('modal-save-btn').disabled,true,'Save stays busy during request');
  releaseWrite();await drain();
  assert.equal(document.getElementById('modal-overlay').classList.contains('open'),false,'close only after confirmed save');
  assert.equal(server.days[0].items[0].status,'booked');
  assert.equal(server.days[0].items[0].booking.price,'£150');
  assert.equal(ctx.renderedBooking?.status,'booked','visible Bookings must refresh after save');
  assert.equal(ctx.renderedBooking?.booking.price,'£150','visible Bookings must use latest price');
  ctx.STATE=clone(server); // full reload of persisted data
  ctx.openEditItem(0,0);
  assert.equal(document.getElementById('f-att-booked').value,'booked');
  assert.equal(document.getElementById('f-att-cost').value,'£150');
  ctx.closeModal(); // cancelling leaves the controller's renamed Save button
  ctx.openEditItem(0,0);
  document.getElementById('f-att-notes').value='Keep booking on second edit';
  pressSave();await drain();releaseWrite();await drain();
  assert.equal(server.days[0].items[0].status,'booked');
  assert.equal(server.days[0].items[0].booking.price,'£150');
  assert.equal(server.days[0].items[0].booking.note,'Keep booking on second edit');
  console.log('actual attraction editor + controller: booking, price, save, reload, reopen and second edit: ok');
})().catch(e=>{console.error(e);process.exitCode=1;});
