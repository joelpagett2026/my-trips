(function(root){
'use strict';
const groups={chest:['Cable Chest Press','Cable Crossovers','Cable Flyes','Chest Press Machine','Pec Deck'],row:['Cable Row','Low Row','Plate Loaded Seated Row','Seated Row Machine'],pull:['Full Range-Of-Motion Lat Pulldown','Weighted Pull Ups','Wide Grip Lat Pulldown'],shoulder:['Dumbbell Lateral Raise','Shoulder Press Machine','Standing Barbell Shoulder Press','Standing Military Press'],arms:['Bicep Cable Curls','Bicep Curls (Cables)','Cable Bicep Curls','Cable Curls','Cable Single Arm Tricep Extensions','Cable Wrist Curl','Forearm Curls (Palms Down)','Incline Hammer Curls','Overhead Cable Curl','Overhead Tricep Extension','Seated Wrist Curls Palms Up','Single Arm Cable Tricep Extensions','Zottman Curl'],squat:['Dumbbell Squat','Goblet Squats (Kettlebell)','Hack Squat Shoulder Width Stance','Hack Squats','Kettlebell Goblet Squat','Kettlebell Squat','Kettlebell Squats','Leg Press'],hinge:['Cable Deadlifts','Cable Hip Extension','Lying Hamstring Curl'],legs:['Abductor Machine','Abductor Stretch','Adductor Stretch','Leg Extension','Leg Extension (Single Leg)','Seated Calf Raises','Single Leg Leg Extension'],core:['Alternate Heel Touchers','Decline Crunches','Leg Lift','Mountain Climbers','Plank','Sandbag - Leg Raises','Scissor Kick','Weight Plate Sit Ups','Weighted Crunches'],conditioning:["Farmer's Carry",'Medicine Ball Throw','Sandbag Lunges','Sled Push'],cardio:['Assault Bike','Cross Trainer','Cycling','Elliptical Trainer','Rowing - Stationary','Running - Treadmill','Ski Erg','SkiErg','Spin','Stairmaster','Stationary Rowing','Treadmill (Running)','Wind Bike']};
const tips={chest:'Set your position before lifting. Keep the movement controlled and use a comfortable range.',row:'Keep your torso steady. Pull smoothly and return the weight under control.',pull:'Avoid swinging. Pull with control and allow a slow return.',shoulder:'Keep your trunk steady. Use a comfortable range and avoid jerking the weight.',arms:'Keep your upper arms and wrists steady. Move the weight without swinging.',squat:'Set your feet securely. Keep knees in line with your feet and use a comfortable depth.',hinge:'Keep your trunk stable. Move slowly and check the setup for your specific exercise.',legs:'Adjust the seat and pads before starting. Keep the movement controlled.',core:'Breathe throughout and avoid pulling on your neck.',conditioning:'Check the space around you. Keep the load stable and movements controlled.',cardio:'Set up the equipment first. Begin comfortably and choose a sustainable pace.'};
const bodyweight=new Set(['Alternate Heel Touchers','Leg Lift','Mountain Climbers','Plank','Scissor Kick']),timed=new Set(['Plank','Scissor Kick']);
const library=Object.entries(groups).flatMap(([group,names])=>names.map(name=>({id:name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,''),name,group,kind:group==='cardio'?'cardio':timed.has(name)?'timed':'strength',equipment:/Barbell|Military/.test(name)?'Barbells':/Dumbbell|Zottman|Hammer Curls/.test(name)?'Dumbbells':/Kettlebell/.test(name)?'Kettlebells':/Cable|Cables|Low Row/.test(name)?'Cables':bodyweight.has(name)?'Bodyweight':/Sandbag|Medicine|Farmer|Sled/.test(name)?'Functional':'Machines',bodyweight:bodyweight.has(name),tip:tips[group],review:/Stretch|Weighted Pull Ups|Carry/.test(name)})));
function lastResult(sessions,id,profile){for(let i=sessions.length-1;i>=0;i--){const e=sessions[i].exercises.find(e=>e.id===id&&(profile===undefined||(e.profile||'')===profile)&&e.sets.some(s=>s.done&&s.type!=='warmup'));if(e)return {...e,date:sessions[i].finishedAt};}return null;}
function progression(previous,increment){if(!previous||previous.feedback!=='up'||previous.kind!=='strength'||previous.review||previous.bodyweight)return null;if(!previous.sets.length||!previous.sets.every(s=>s.done&&Number.isFinite(s.weight)&&s.weight>0&&Number.isFinite(s.reps)&&s.reps>=s.targetReps))return null;const step=Number(increment);if(!Number.isFinite(step)||step<=0||step>10)return null;return previous.sets.map(s=>Math.round((s.weight+step)*100)/100);}
function exercise(ex,sessions,minutes){const prev=lastResult(sessions,ex.id),done=prev?.sets.filter(s=>s.done&&s.type!=='warmup')||[];let sets;if(ex.kind==='cardio')sets=[{minutes:minutes||10,distance:null,done:false}];else if(ex.kind==='timed')sets=Array.from({length:3},(_,i)=>({seconds:done[i]?.seconds||30,done:false}));else sets=Array.from({length:done.length||3},(_,i)=>({weight:done[i]?.weight??(ex.bodyweight?0:null),reps:done[i]?.reps??12,targetReps:done[i]?.reps??12,done:false}));return {...ex,sets,feedback:null,previous:prev?{date:prev.date,sets:done}:null};}
function movement(e){if(/Running|Treadmill/.test(e.name))return 'running';if(/Ski/.test(e.name))return 'ski';if(/Rowing/.test(e.name))return 'rowing';if(/Elliptical|Cross Trainer/.test(e.name))return 'elliptical';if(/Leg Extension|Single Leg Leg/.test(e.name))return 'leg-extension';if(/Kettlebell.*Squat|Goblet Squat/.test(e.name))return 'kettlebell-squat';return e.id;}
function lastFeedback(sessions,id){for(let i=sessions.length-1;i>=0;i--){const e=sessions[i].exercises.find(e=>e.id===id);if(e)return e.feedback;}return null;}
function generate(options,sessions,rng=Math.random){const minutes=Number(options.minutes),count=minutes<=30?4:minutes<=45?5:6,excluded=new Set(options.exclude||[]),equipment=new Set(options.equipment||[]),pool=library.filter(e=>!e.review&&!excluded.has(e.id)&&lastFeedback(sessions,e.id)!=='pain'&&(!equipment.size||equipment.has(e.equipment)));let slots=options.type==='Upper Body'?['chest','row','pull','shoulder','arms','core']:options.type==='Lower Body'?['squat','hinge','legs','core','legs','conditioning']:['squat','chest','row','hinge','shoulder','core'];if(options.type==='Cardio')slots=Array(Math.min(3,Math.max(1,Math.round(minutes/15)))).fill('cardio');if(options.type==='Running'){const ex=library.find(e=>e.name==='Running - Treadmill');return [exercise({...ex,id:options.running==='Treadmill'?'treadmill-run':'outdoor-running',name:options.running==='Treadmill'?'Treadmill run':'Outdoor run'},sessions,minutes)];}const selected=[];for(const slot of slots.slice(0,options.type==='Cardio'?slots.length:count)){const choices=pool.filter(e=>e.group===slot&&!selected.some(s=>movement(s)===movement(e)));if(choices.length){const recent=options.type!=='Cardio'&&selected.length<3?sessions.slice().reverse().find(s=>s.type===options.type):null;const familiar=recent?.exercises.find(e=>choices.some(c=>c.id===e.id));selected.push(familiar?choices.find(c=>c.id===familiar.id):choices[Math.min(choices.length-1,Math.floor(rng()*choices.length))]);}}return selected.map(e=>exercise(e,sessions,options.type==='Cardio'?Math.round(minutes/selected.length):undefined));}
function weekCount(sessions,date=new Date()){const start=new Date(date);start.setHours(0,0,0,0);start.setDate(start.getDate()-((start.getDay()+6)%7));const end=new Date(start);end.setDate(end.getDate()+7);return sessions.filter(s=>new Date(s.finishedAt)>=start&&new Date(s.finishedAt)<end).length;}
// Profile-specific history prevents loads transferring between different machines.
function prepare(ex,sessions,guidance={},minutes){
 const g=guidance[ex.id]||{},profile=g.profile||'',prev=lastResult(sessions,ex.id,profile);
 const relevant=sessions.map(s=>({...s,exercises:s.exercises.filter(e=>(e.profile||'')===profile)}));
 const e=exercise(ex,relevant,minutes);e.profile=profile;e.loadMeaning=g.loadMeaning||'Confirm load meaning';
 e.restSeconds=g.restSeconds||90;e.sets=e.sets.filter(s=>s.type!=='warmup').map(s=>({...s,type:'work'}));
 if(!prev&&g.baseline?.confirmed&&g.baseline.profile===profile&&e.kind==='strength'){
  e.sets=g.baseline.sets.map(s=>({weight:s.weight,reps:s.reps,targetReps:s.reps,done:false,type:'work'}));e.baseline=true;
 }
 return e;
}
function advice(previous,g={}){
 if(!previous||previous.kind!=='strength'||previous.review||previous.bodyweight||previous.feedback!=='up'||!g.increment||!g.loadMeaning)return null;
 const sets=previous.sets.filter(s=>s.type!=='warmup');
 if(!sets.length||!sets.every(s=>s.done&&Number.isFinite(s.weight)&&s.weight>0&&Number.isInteger(s.reps)&&s.reps>=s.targetReps))return null;
 const max=g.repMax||12;
 if(sets.some(s=>s.reps<max))return {kind:'reps',values:sets.map(s=>Math.min(max,s.reps+1)),reason:'You completed your targets and felt you could do more. Build reps within your chosen range first.'};
 const weights=progression({...previous,sets},g.increment);
 return weights?{kind:'weight',values:weights,reps:g.repMin||8,reason:'You reached the top of your chosen rep range and felt you could do more. Try your equipment’s next increment, returning to the lower rep target.'}:null;
}
function alternatives(old,current,options,sessions){
 // Require matching movement intent: a leg curl is not a deadlift substitute.
 const intent=e=>/Tricep/i.test(e.name)?'triceps':/Wrist|Forearm/i.test(e.name)?'forearms':e.group==='arms'?'biceps':/Hamstring/i.test(e.name)?'leg-curl':/Hip Extension/i.test(e.name)?'hip-extension':/Calf/i.test(e.name)?'calves':/Abductor/i.test(e.name)?'abductor':/Adductor/i.test(e.name)?'adductor':e.group;
 return library.filter(e=>e.id!==old.id&&e.group===old.group&&intent(e)===intent(old)&&!current.some(x=>x.id===e.id)&&!e.review&&lastFeedback(sessions,e.id)!=='pain'&&!(options.exclude||[]).includes(e.id)&&(!(options.equipment||[]).length||options.equipment.includes(e.equipment)));
}
function recommend(sessions){
 const latest=sessions.at(-1);if(!latest)return {type:'Full Body',note:'Start with a familiar full-body session, or choose your preferred focus.'};
 if(latest.type==='Running'||latest.type==='Lower Body')return {type:'Upper Body',note:'Your last session involved running or lower-body work. Upper body is an option today; check how you feel.'};
 return {type:'Lower Body',note:'Lower body is next in your alternating plan. Change it if soreness, time or another activity makes a different session more suitable.'};
}
function importBaselines(raw){
 if(!raw||!Array.isArray(raw.baselines)||raw.baselines.length>200)throw Error('Choose the assigned-baselines.json file.');
 const out={};for(const b of raw.baselines){const ex=library.find(e=>e.name===b.exercise);if(!ex||ex.kind!=='strength'||ex.review)continue;
 const sets=(b.blocks?.[0]?.sets||[]).map(s=>({weight:Number(s['Weight - kg']),reps:Number(s.Reps)}));
 if(!sets.length||sets.length>20||sets.some(s=>!Number.isFinite(s.weight)||s.weight<=1||s.weight>1000||!Number.isInteger(s.reps)||s.reps<2||s.reps>100))continue;
 out[ex.id]={sets,confirmed:false,source:String(b.source_workout||'PT target').slice(0,150),date:String(b.date_updated||'').slice(0,20),flags:Array.isArray(b.flags)?b.flags.map(String).slice(0,10):[]};}
 return out;
}
// Every edit is journalled before the debounced network write. Snapshots are never
// silently adopted when another device has changed the account record.
function createJournal({storage,save,initial,onStatus=()=>{},id='fitness-pending-'+Math.random().toString(36).slice(2)}){
 let base=JSON.stringify(initial),data=initial,rev=0,dirty=false,blocked=false,inFlight=null,localOK=true;
 const copy=x=>JSON.parse(JSON.stringify(x));
 function journal(){try{storage.setItem(id,JSON.stringify({base,data,updatedAt:Date.now()}));localOK=true;}catch{localOK=false;}onStatus(localOK?'Saved on this device':'Device saving unavailable');}
 function change(next){data=copy(next);rev++;dirty=true;journal();}
 async function sync(){
  if(blocked)return false;if(inFlight){await inFlight;return dirty?sync():true;}if(!dirty)return true;
  const snapshot=copy(data),version=rev;
  inFlight=(async()=>{onStatus('Syncing…');try{await save(snapshot);base=JSON.stringify(snapshot);if(version===rev){dirty=false;try{storage.removeItem(id);}catch{}onStatus('Synced to your account');}else journal();return true;}catch(e){if(e.status===409)blocked=true;onStatus(blocked?'Conflict — device copy preserved':localOK?'Saved on this device · sync pending':'Not saved — keep this page open');return false;}})();
  const result=await inFlight;inFlight=null;if(result&&dirty)return sync();return result;
 }
 return {change,sync,get dirty(){return dirty;},get blocked(){return blocked;},get localOK(){return localOK;},get data(){return copy(data);},get base(){return base;}};
}

const api={library,groups,generate,exercise,lastResult,lastFeedback,progression,weekCount,prepare,advice,alternatives,recommend,importBaselines,createJournal};root.FitnessEngine=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
