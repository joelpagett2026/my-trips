'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function main() {
 const script=fs.readFileSync('christmas/app.js','utf8');
 const elements=new Map(),handlers={},saved=[],storage=new Map();
 const nav=['overview','people','shopping','budget'].map(tab=>({dataset:{tab},setAttribute(){},removeAttribute(){}}));
 function el(selector) {
  if(!elements.has(selector))elements.set(selector,{
   innerHTML:'',textContent:'',hidden:false,value:'',style:{},open:false,dataset:{},
   focus(){},close(){this.open=false;},showModal(){this.open=true;},
   addEventListener(type,fn){handlers[selector+':'+type]=fn;},
  });
  return elements.get(selector);
 }
 const document={
  querySelector:el,querySelectorAll:()=>nav,
  addEventListener(name,fn){handlers['document:'+name]=fn;},
  body:{appendChild(){}},
 };
 const window={_mytripsAuthed:true,scrollTo(){},addEventListener(name,fn){handlers['window:'+name]=fn;}};
 let nextId=0;
 const context={
  document,window,console,Intl,Date,URL,JSON,Number,String,Object,Array,Math,Promise,
  crypto:{randomUUID:()=>String(++nextId)},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  dbLoad:async()=>null,
  dbSave:async(id,data)=>{assert.equal(id,'christmas-list-v1');saved.push(JSON.parse(JSON.stringify(data)));return {version:String(saved.length)};},
  FormData:class{constructor(form){this.values=form.values;}get(key){return this.values[key];}},
  setTimeout:(fn,ms)=>{if(ms===550)queueMicrotask(fn);return 1;},clearTimeout(){},
  confirm:()=>true,
 };
 vm.runInNewContext(script,context);
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 await settle();
 assert.match(el('#content').innerHTML,/People to buy for/,'Overview should render after authentication');
 const click=(action,id)=>handlers['#app:click']({target:{closest:()=>({dataset:{action,id}})}});
 const submit=values=>el('#editor-form').onsubmit({preventDefault(){},currentTarget:{values}});
 click('add-person');
 submit({name:'Mum',budget:'100'});
 await settle();
 assert.equal(saved.at(-1).years['2026'].people[0].name,'Mum');
 click('add-gift');
 submit({name:'Cashmere scarf',personId:'1',status:'to_buy',price:'45',quantity:'1',actualPrice:'',shop:'',url:'',notes:''});
 await settle();
 let data=saved.at(-1);
 assert.equal(data.years['2026'].gifts.length,1,'Adding a present should save to the account');
 assert.equal(data.years['2026'].gifts[0].price,45);
 assert.match(el('#content').innerHTML,/Still to buy/,'New gift should appear in overview');
 handlers['#app:change']({target:{dataset:{statusGift:'2'},value:'ordered',matches:query=>query==='[data-status-gift]'}});
 await settle();
 data=saved.at(-1);
 assert.equal(data.years['2026'].gifts[0].status,'ordered','Status change should save');
 assert.match(el('#content').innerHTML,/£45.00/,'Ordered purchase must be counted as spending');
 click('new-year');
 await settle();
 data=saved.at(-1);
 assert.equal(data.activeYear,2027,'New year should become active');
 assert.equal(data.years['2027'].people.length,1,'Recipients should carry over');
 assert.equal(data.years['2027'].gifts.length,0,'Presents should not carry over');
 assert.equal(data.years['2026'].gifts.length,1,'Old presents should remain archived');
 assert.equal(storage.has('christmas-list-pending-v1'),false,'Successful account saves should clear pending copy');
 console.log('Christmas List: create, status, budget, archive and account save passed');
}
main().catch(err=>{console.error(err);process.exitCode=1;});