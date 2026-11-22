'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const year=new Date().getFullYear();

async function fixture(remote=null) {
 const source=fs.readFileSync('christmas/app.js','utf8');
 const els=new Map(),events={},saved=[],store=new Map();
 const element=key=>{
  if(!els.has(key))els.set(key,{
   innerHTML:'',textContent:'',value:'',style:{},hidden:false,open:false,dataset:{},attributes:{},
   focus(){},close(){this.open=false;},showModal(){this.open=true;},setAttribute(k,v){this.attributes[k]=v;},
   addEventListener(type,fn){events[key+':'+type]=fn;}
  });
  return els.get(key);
 };
 let next=0;
 const document={querySelector:element,addEventListener:(k,fn)=>events['doc:'+k]=fn,body:{appendChild(){}}};
 const window={_mytripsAuthed:true,addEventListener:(k,fn)=>events['win:'+k]=fn};
 vm.runInNewContext(source,{
  document,window,console,Date,Intl,JSON,Math,Number,Object,String,Set,Array,Promise,
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
  crypto:{randomUUID:()=> 'test-'+(++next)},
  dbLoad:async id=>{assert.equal(id,'christmas-list-v1');return remote;},
  dbSave:async (id,data)=>{assert.equal(id,'christmas-list-v1');saved.push(JSON.parse(JSON.stringify(data)));return {version:String(saved.length)};},
  FormData:class{constructor(form){this.data=form.values;}get(k){return this.data[k];}},
  setTimeout:(fn,ms)=>{if(ms===550)queueMicrotask(fn);return 1;},clearTimeout(){},confirm:()=>true
 });
 const settle=()=>new Promise(r=>setImmediate(r));
 await settle();
 return {
  element,events,saved,store,settle,
  click(action,id,extra={}){events['#app:click']({target:{closest:()=>({dataset:{action,id,...extra}})}});},
  submit(values){element('#editor-form').onsubmit({preventDefault(){},currentTarget:{values}});}
 };
}
async function main(){
 const html=fs.readFileSync('christmas/index.html','utf8');
 assert.match(html,/Montserrat/);
 assert.doesNotMatch(html,/data-tab="budget"|data-tab="shopping"/,'One page, no separate tabs');
 const t=await fixture();
 const view=t.element('#group-grid').innerHTML;
 for(const group of ['Personal Presents',"Jon's Family","Joel's Mums","Joel's Dads",'Other'])
  assert.ok(view.includes(group.replace(/'/g,'&#39;'))||view.includes(group),'Missing family group '+group);
 assert.equal((view.match(/class="family-row"/g)||[]).length,20);
 assert.match(view,/No presents yet/);

 t.click('add-gift',null,{personId:'test-1'});
 t.submit({name:'Christmas scarf',personId:'test-1',bought:null});
 await t.settle();
 let data=t.saved.at(-1),gift=data.years[String(year)].gifts[0];
 assert.equal(gift.status,'to_buy');
 assert.match(t.element('#group-grid').innerHTML,/class="present "/);
 assert.match(t.element('#total-left').textContent,/1 still to buy/);

 t.click('toggle-gift',gift.id);
 await t.settle();
 assert.equal(t.saved.at(-1).years[String(year)].gifts[0].status,'received');
 assert.match(t.element('#group-grid').innerHTML,/class="present bought"/);
 assert.match(t.element('#group-grid').innerHTML,/class="person-name complete"/);
 assert.match(t.element('#total-left').textContent,/All presents bought/);
 t.click('toggle-gift',gift.id);
 await t.settle();
 assert.equal(t.saved.at(-1).years[String(year)].gifts[0].status,'to_buy');

 t.click('new-year');
 await t.settle();
 data=t.saved.at(-1);
 assert.equal(data.activeYear,year+1);
 assert.equal(data.years[String(year+1)].people.length,20);
 assert.equal(data.years[String(year+1)].gifts.length,0);
 assert.equal(data.years[String(year)].gifts.length,1);
 assert.equal(t.store.has('christmas-list-pending-v1'),false);

 const legacy={schema:1,activeYear:year,years:{[String(year)]:{
  people:[{id:'existing-person',name:'Jon',budget:90}],
  gifts:[{id:'existing-gift',name:'Record collection',personId:'existing-person',status:'ordered',price:55,quantity:2,url:'https://example.com',notes:'Keep this'}]
 }}};
 const old=await fixture(legacy);
 assert.match(old.element('#group-grid').innerHTML,/Record collection/);
 old.click('edit-gift','existing-gift');
 old.submit({name:'Record collection updated',personId:'existing-person',bought:'on'});
 await old.settle();
 const saved=old.saved.at(-1).years[String(year)].gifts[0];
 assert.equal(saved.status,'ordered');
 assert.equal(saved.price,55);
 assert.equal(saved.url,'https://example.com');
 assert.equal(saved.notes,'Keep this');
 assert.equal(old.saved.at(-1).years[String(year)].people.length,1);
 console.log('Christmas family sheet: groups, 20 names, colours, buying, archives and existing data passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});