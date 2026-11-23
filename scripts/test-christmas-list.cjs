'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const year=new Date().getFullYear();

async function fixture(remote=null){
 const source=fs.readFileSync('christmas/app.js','utf8'),els=new Map(),events={},saved=[],store=new Map(),timers=new Map();
 let next=0,timerId=0;
 const element=key=>{
  if(!els.has(key))els.set(key,{
   innerHTML:'',textContent:'',value:'',style:{},hidden:false,open:false,dataset:{},attributes:{},
   focus(){},close(){this.open=false;},showModal(){this.open=true;},setAttribute(k,v){this.attributes[k]=v;},
   addEventListener(type,fn){events[key+':'+type]=fn;}
  });
  return els.get(key);
 };
 const document={querySelector:element,addEventListener:(k,fn)=>events['doc:'+k]=fn,body:{appendChild(){}}};
 const window={_mytripsAuthed:true,addEventListener:(k,fn)=>events['win:'+k]=fn};
 const context={
  document,window,console,Date,Intl,JSON,Math,Number,Object,String,Set,Array,Promise,
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
  crypto:{randomUUID:()=> 'test-'+(++next)},
  dbLoad:async id=>{assert.equal(id,'christmas-list-v1');return remote;},
  dbSave:async (id,data)=>{assert.equal(id,'christmas-list-v1');saved.push(JSON.parse(JSON.stringify(data)));return {version:String(saved.length)};},
  FormData:class{constructor(form){this.data=form.values;}get(k){return this.data[k];}},
  setTimeout:(fn,ms)=>{const id=++timerId;if(ms===550)queueMicrotask(fn);else if(ms===360)timers.set(id,fn);return id;},
  clearTimeout:id=>timers.delete(id),confirm:()=>true
 };
 vm.runInNewContext(source,context);
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 await settle();
 return {
  element,events,saved,store,settle,
  click(action,id,extra={}){events['#app:click']({target:{closest:()=>({dataset:{action,id,...extra}})}});},
  flushTap(){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());},
  submit(values){element('#editor-form').onsubmit({preventDefault(){},currentTarget:{values}});}
 };
}
async function main(){
 const html=fs.readFileSync('christmas/index.html','utf8');
 const css=fs.readFileSync('christmas/style.css','utf8');
 assert.match(html,/Montserrat/);
 assert.match(html,/Not bought/);
 assert.match(html,/Ordered/);
 assert.match(html,/Bought \/ delivered/);
 assert.match(css,/\.group-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.doesNotMatch(css,/data-group="other"/);
 assert.match(css,/\.present\.ordered\{background:var\(--ordered\)\}/);
 assert.match(css,/\.present\.delivered\{background:var\(--delivered\)\}/);
 const ui=await fixture();
 const view=ui.element('#group-grid').innerHTML;
 for(const group of ['Personal Presents',"Jon's Family","Joel's Mums","Joel's Dads"]){
  assert.ok(view.includes(group.replace(/'/g,'&#39;'))||view.includes(group),'Missing '+group);
 }
 assert.doesNotMatch(view,/>Other</);
 assert.equal((view.match(/class="family-row"/g)||[]).length,18);
 assert.match(view,/No presents yet/);

 ui.click('add-gift',null,{personId:'test-1'});
 ui.submit({name:'Christmas scarf',personId:'test-1',status:'to_buy',price:'25.50'});
 await ui.settle();
 let data=ui.saved.at(-1),gift=data.years[String(year)].gifts[0];
 assert.equal(gift.status,'to_buy');
 assert.match(ui.element('#group-grid').innerHTML,/class="present not-bought"/);
 assert.match(ui.element('#group-grid').innerHTML,/data-price-gift=/,'Each gift has an inline price input');
 assert.match(ui.element('#group-grid').innerHTML,/Spent £0.00/,'Unbought gifts are not spent');
 assert.match(ui.element('#group-grid').innerHTML,/To buy £25.50/,'Planned costs appear below recipient');
 assert.equal(ui.element('#total-spent').textContent,'£0.00');
 assert.equal(ui.element('#total-planned').textContent,'£25.50');

 // One click -> ordered (not delivered). No premature state update.
 const savesBeforeClick=ui.saved.length;
 ui.click('toggle-gift',gift.id);
 assert.equal(ui.saved.length,savesBeforeClick,'Single click waits briefly for possible double click');
 ui.flushTap();await ui.settle();
 assert.equal(ui.saved.at(-1).years[String(year)].gifts[0].status,'ordered');
 assert.match(ui.element('#group-grid').innerHTML,/class="present ordered"/);
 assert.match(ui.element('#group-grid').innerHTML,/class="person-name on-order"/);
 assert.match(ui.element('#total-left').textContent,/1 ordered/);
 assert.match(ui.element('#group-grid').innerHTML,/Spent £25.50/,'Ordered gift counts as spending');
 assert.match(ui.element('#group-grid').innerHTML,/Group spent £25.50/,'Family group shows spending');
 assert.equal(ui.element('#total-spent').textContent,'£25.50');
 assert.equal(ui.element('#total-planned').textContent,'£0.00');

 // One more click -> not bought (grey).
 ui.click('toggle-gift',gift.id);ui.flushTap();await ui.settle();
 assert.equal(ui.saved.at(-1).years[String(year)].gifts[0].status,'to_buy');
 assert.equal(ui.element('#total-planned').textContent,'£25.50');

 // Double click -> delivered (red), without saving an intermediate ordered state.
 const savesBeforeDoubleClick=ui.saved.length;
 ui.click('toggle-gift',gift.id);
 ui.click('toggle-gift',gift.id);
 await ui.settle();
 assert.equal(ui.saved.length,savesBeforeDoubleClick+1,'Double click should save just one completed status');
 assert.equal(ui.saved.at(-1).years[String(year)].gifts[0].status,'received');
 assert.match(ui.element('#group-grid').innerHTML,/class="present delivered"/);
 assert.match(ui.element('#group-grid').innerHTML,/class="person-name complete"/);
 assert.match(ui.element('#total-left').textContent,/All presents delivered/);
 assert.match(ui.element('#total-progress').textContent,/1 of 1 completed/);
 assert.equal(ui.element('#total-track').attributes['aria-valuenow'],'100');
 assert.equal(ui.element('#total-spent').textContent,'£25.50');

 // Editing a gift's cost inline updates totals but does not change the delivery state.
 ui.events['#app:change']({target:{value:'32.25',dataset:{priceGift:gift.id},matches:selector=>selector==='[data-price-gift]'}});
 await ui.settle();
 assert.equal(ui.saved.at(-1).years[String(year)].gifts[0].price,32.25);
 assert.equal(ui.saved.at(-1).years[String(year)].gifts[0].status,'received');
 assert.equal(ui.element('#total-spent').textContent,'£32.25');

 // A completed gift can be returned to ordered with one click.
 ui.click('toggle-gift',gift.id);ui.flushTap();await ui.settle();
 assert.equal(ui.saved.at(-1).years[String(year)].gifts[0].status,'ordered');

 ui.click('new-year');await ui.settle();
 data=ui.saved.at(-1);
 assert.equal(data.activeYear,year+1);
 assert.equal(data.years[String(year+1)].people.length,18);
 assert.equal(data.years[String(year+1)].gifts.length,0);
 assert.equal(data.years[String(year)].gifts.length,1);
 assert.equal(ui.store.has('christmas-list-pending-v1'),false);

 // Legacy groups and gift metadata must survive the visual redesign.
 const legacy={schema:1,activeYear:year,years:{[String(year)]:{
  people:[{id:'existing-person',name:'Mum',group:'other',budget:90}],
  gifts:[{id:'existing-gift',name:'Record collection',personId:'existing-person',status:'wrapped',price:55,quantity:2,url:'https://example.com',notes:'Keep this'}]
 }}};
 const old=await fixture(legacy);
 const legacyView=old.element('#group-grid').innerHTML;
 assert.match(legacyView,/Record collection/);
 assert.ok(legacyView.indexOf("Joel&#39;s Mums")>=0||legacyView.indexOf("Joel's Mums")>=0);
 assert.match(legacyView,/class="present delivered"/);
 assert.match(legacyView,/Spent £110.00/,'Legacy quantities multiply correctly');
 assert.match(legacyView,/Budget remaining £/,'Existing budget remains visible');
 old.click('edit-gift','existing-gift');
 old.submit({name:'Record collection updated',personId:'existing-person',status:'received',price:'55.00'});
 await old.settle();
 const stored=old.saved.at(-1).years[String(year)].gifts[0];
 assert.equal(stored.status,'wrapped','Old wrapped status should stay completed on edit');
 assert.equal(stored.price,55);
 assert.equal(stored.url,'https://example.com');
 assert.equal(stored.notes,'Keep this');
 assert.equal(old.element('#total-spent').textContent,'£110.00');
 old.click('edit-person','existing-person');
 old.submit({name:'Mum',group:'mums',budget:'150'});
 await old.settle();
 assert.equal(old.saved.at(-1).years[String(year)].people[0].budget,150);
 assert.match(old.element('#group-grid').innerHTML,/Budget remaining £40.00/,'Budget remaining is recalculated');
 assert.equal(old.saved.at(-1).years[String(year)].people[0].group,'other','Do not silently rewrite original group data');
 console.log('Christmas List: gift costs, group and person totals, budget editing, quantity totals, three statuses and archives passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});