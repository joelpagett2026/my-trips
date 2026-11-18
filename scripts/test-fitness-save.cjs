const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const E=require('../fitness/engine.js');
const clone=x=>JSON.parse(JSON.stringify(x));
function memory(){const s={};Object.defineProperties(s,{getItem:{value:k=>s[k]??null},setItem:{value:(k,v)=>s[k]=v},removeItem:{value:k=>delete s[k]}});return s;}
async function boot(saved,{fail=false,storage=memory()}={}){
 const nodes=new Map(),events={},writes=[];let failing=fail;
 const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',hidden:false,value:'',inert:false,dataset:{},addEventListener(name,fn){this['on'+name]=fn;},removeAttribute(){},setAttribute(){},scrollIntoView(){},close(){},showModal(){}});return nodes.get(selector);};
 const document={querySelector:node,querySelectorAll:()=>[],addEventListener:(name,fn)=>events[name]=fn};
 const context={document,FitnessEngine:E,localStorage:storage,window:{_mytripsAuthed:true,addEventListener:(n,fn)=>events[n]=fn,scrollTo(){}},crypto:{randomUUID:()=> 'test-id'},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},URL,Blob,console,dbLoad:async()=>clone(saved),dbSave:async(id,data)=>{assert.equal(id,'fitness-tracker-v1');writes.push(clone(data));if(failing){const err=Error('offline');err.status=503;throw err;}return {version:'new'};},confirm:()=>true};
 vm.runInNewContext(fs.readFileSync(require.resolve('../fitness/app.js'),'utf8'),context);
 await new Promise(resolve=>setImmediate(resolve));return{node,writes,storage,events,connect:()=>failing=false};
}
(async()=>{
 const ex=E.exercise(E.library.find(e=>e.name==='Cable Crossovers'),[]);ex.sets.forEach(s=>{s.weight=10;s.reps=12;s.done=true;});ex.feedback='up';
 const draft={id:'draft',type:'Upper Body',startedAt:'2026-11-17T10:00:00Z',minutes:45,options:{equipment:['Cables'],exclude:[]},exercises:[ex],notes:'Personal notes'};
 const saved={schema:1,sessions:[],draft,preferences:{goal:3},guidance:{}};
 const app=await boot(saved,{fail:true});await app.node('#finish').onclick();
 assert.equal(app.writes.length,1);assert.equal(app.writes[0].sessions.length,1);assert.equal(app.writes[0].draft,null);
 assert.equal(Object.keys(app.storage).length,1,'offline completion is journalled');
 assert(app.node('#content').innerHTML.includes('1 / 3'));
 app.connect();await app.events.online();await new Promise(r=>setImmediate(r));assert.equal(app.writes.length,2);assert.equal(app.writes[1].sessions.length,1,'reconnection does not duplicate completion');assert.equal(Object.keys(app.storage).length,0);assert.equal(app.writes[1].sessions[0].notes,'Personal notes');
 const empty=clone(saved);empty.draft.exercises[0].sets.forEach(s=>s.done=false);const app2=await boot(empty);await app2.node('#finish').onclick();assert.equal(app2.writes.length,0);
 const bad=clone(saved);bad.draft.exercises[0].sets[0].weight=null;const app3=await boot(bad);await app3.node('#finish').onclick();assert.equal(app3.writes.length,0);
 const local=memory();const updated=clone(saved);updated.draft.notes='Recovered notes';local.setItem('fitness-pending-old',JSON.stringify({base:JSON.stringify(saved),data:updated,updatedAt:1}));
 const recovered=await boot(saved,{storage:local});await new Promise(r=>setImmediate(r));assert.equal(recovered.writes[0].draft.notes,'Recovered notes');assert.equal(Object.keys(local).length,0);
 local.setItem('fitness-pending-conflict',JSON.stringify({base:'null',data:updated,updatedAt:1}));const conflict=await boot(saved,{storage:local});assert.equal(conflict.writes.length,0);assert.equal(conflict.node('#content').inert,true);assert.equal(conflict.node('#recovery').hidden,false);
 const warm=clone(saved);warm.draft.exercises[0].sets.forEach(s=>s.type='warmup');const app4=await boot(warm);await app4.node('#finish').onclick();assert.equal(app4.writes.length,0);
 // Journal tests cover edits arriving during a save and conflict latching.
 const store=memory(),writes=[];let release;const wait=new Promise(r=>release=r);let calls=0;
 const j=E.createJournal({storage:store,initial:{v:0},save:async s=>{writes.push(s);if(++calls===1)await wait;}});
 j.change({v:1});const saving=j.sync();j.change({v:2});release();assert.equal(await saving,true);assert.deepEqual(writes,[{v:1},{v:2}]);assert.equal(j.dirty,false);assert.equal(Object.keys(store).length,0);
 let attempts=0;const c=E.createJournal({storage:store,initial:null,save:async()=>{attempts++;throw Object.assign(Error(),{status:409});}});c.change({v:3});assert.equal(await c.sync(),false);c.change({v:4});assert.equal(await c.sync(),false);assert.equal(attempts,1);assert.equal(c.blocked,true);assert.equal(c.data.v,4);
 const unavailable=E.createJournal({storage:{setItem(){throw Error('quota');},removeItem(){}},initial:null,save:async()=>{throw Error('offline');}});unavailable.change({v:1});assert.equal(unavailable.localOK,false);assert.equal(await unavailable.sync(),false);
 console.log('Fitness saving passed: offline finish, reconnect exactly once, valid-set gates, draft recovery, conflict preservation, in-flight edits, storage failure and warm-up-only finish.');
})().catch(e=>{console.error(e);process.exitCode=1;});
