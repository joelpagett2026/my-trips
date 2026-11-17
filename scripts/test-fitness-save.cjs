const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const E=require('../fitness/engine.js');
const clone=x=>JSON.parse(JSON.stringify(x));
async function boot(saved,failFirst=false){
 const nodes=new Map(),events={},writes=[];let fail=failFirst;
 const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',hidden:false,value:'',inert:false,dataset:{},addEventListener(){},removeAttribute(){},setAttribute(){},scrollIntoView(){},close(){},showModal(){}});return nodes.get(selector);};
 const document={querySelector:node,querySelectorAll:()=>[],addEventListener:(name,fn)=>events[name]=fn};
 const context={document,FitnessEngine:E,window:{_mytripsAuthed:true,addEventListener(){},scrollTo(){}},crypto:{randomUUID:()=> 'test-id'},setTimeout:()=>0,setInterval:()=>0,clearInterval(){},URL,Blob,console,dbLoad:async()=>clone(saved),dbSave:async(id,data)=>{assert.equal(id,'fitness-tracker-v1');writes.push(clone(data));if(fail){fail=false;const err=Error('offline');err.status=503;throw err;}return {version:'new'};},confirm:()=>true};
 vm.runInNewContext(fs.readFileSync(require.resolve('../fitness/app.js'),'utf8'),context);
 await new Promise(resolve=>setImmediate(resolve));return{node,writes};
}
(async()=>{
 const ex=E.exercise(E.library.find(e=>e.name==='Cable Crossovers'),[]);ex.sets.forEach(s=>{s.weight=10;s.reps=12;s.done=true;});ex.feedback='up';
 const draft={id:'draft',type:'Upper Body',startedAt:'2026-11-17T10:00:00Z',minutes:45,options:{equipment:['Cables'],exclude:[]},exercises:[ex],notes:'Personal notes'};
 const saved={schema:1,sessions:[],draft,preferences:{goal:3},guidance:{}};
 const app=await boot(saved,true);await app.node('#finish').onclick();
 assert.equal(app.node('#save-status').textContent,'Not saved');assert.equal(app.writes.length,1);assert.equal(app.node('#content').inert,false);
 await app.node('#finish').onclick();assert.equal(app.writes.length,2);assert.equal(app.writes[1].sessions.length,1);assert.equal(app.writes[1].draft,null);assert.equal(app.writes[1].sessions[0].notes,'Personal notes');assert.equal(app.node('#save-status').textContent,'Saved to your account');
 const empty=clone(saved);empty.draft.exercises[0].sets.forEach(s=>s.done=false);const app2=await boot(empty);await app2.node('#finish').onclick();assert.equal(app2.writes.length,0);
 const bad=clone(saved);bad.draft.exercises[0].sets[0].weight=null;const app3=await boot(bad);await app3.node('#finish').onclick();assert.equal(app3.writes.length,0);
 const reloaded=await boot(app.writes[1]);assert(reloaded.node('#content').innerHTML.includes('1 / 3'));assert.equal(reloaded.writes.length,0);
 console.log('Fitness save integration passed: failed save retains draft, retry stores once, reload restores totals, invalid/incomplete sessions do not save.');
})().catch(e=>{console.error(e);process.exitCode=1;});
