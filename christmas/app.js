(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'christmas-' + Date.now() + '-' + Math.random().toString(36).slice(2);
const copy = x => JSON.parse(JSON.stringify(x));
const bought = status => ['ordered','received','wrapped'].includes(status);
const GROUPS = [
 {id:'personal',name:'Personal Presents',people:['Joel','Jon']},
 {id:'jon',name:"Jon's Family",people:['Kevin','Valerie','Mark']},
 {id:'mums',name:"Joel's Mums",people:['Joanna','Neil','Blossom','Cohman']},
 {id:'dads',name:"Joel's Dads",people:['Malcolm','Tina','Harry','Emma','Jess','Stanley','Emmy','Sandy','Dave']},
 {id:'other',name:'Other',people:['Lucy','Secret Santa']}
];
const lookupGroup = name => {
 const text=String(name||'').trim().toLowerCase();
 return GROUPS.find(g => g.people.some(n => n.toLowerCase()===text))?.id || 'other';
};
const starterPeople = () => GROUPS.flatMap(g => g.people.map(name => ({id:uid(),name,group:g.id,budget:0})));
const blankYear = (copyMembers=false,existing=[]) => ({people:copyMembers?existing.map(p=>({...p,id:uid(),group:p.group||lookupGroup(p.name)})):starterPeople(),gifts:[]});
const initialState = () => {const y=new Date().getFullYear();return {schema:1,activeYear:y,years:{[String(y)]:blankYear()}};};
const RECORD='christmas-list-v1',PENDING='christmas-list-pending-v1';
let state=null,ready=false,blocked=false,dirty=false,saving=false,revision=0,base='null',timer=null,toastTimer=null;
let editMode='',editId=null;

function yearData(){return state.years[String(state.activeYear)];}
function normalise(remote){
 if(!remote)return initialState();
 if(remote.schema!==1 || !remote.years || typeof remote.years!=='object' || !Object.keys(remote.years).length)throw Error('Unsupported Christmas List data');
 const data=copy(remote);
 Object.values(data.years).forEach(y=>{if(!Array.isArray(y.people)||!Array.isArray(y.gifts))throw Error('Invalid Christmas List year');});
 if(!data.years[String(data.activeYear)])data.activeYear=Number(Object.keys(data.years)[0]);
 return data;
}
function groupFor(person) {return GROUPS.some(g=>g.id===person.group)?person.group:lookupGroup(person.name);}
function totals(){
 const gifts=yearData().gifts;
 const done=gifts.filter(g=>bought(g.status)).length;
 return {total:gifts.length,done,left:gifts.length-done,percent:gifts.length?Math.round(100*done/gifts.length):0};
}
function yearOptions(){return Object.keys(state.years).sort((a,b)=>Number(b)-Number(a)).map(y=>'<option value="'+esc(y)+'"'+(Number(y)===state.activeYear?' selected':'')+'>'+esc(y)+'</option>').join('');}
function renderHeader(){
 const t=totals();
 $('#year-select').innerHTML=yearOptions();
 $('#total-progress').textContent=t.done+' of '+t.total+' bought';
 $('#total-left').textContent=t.total===0?'Add your first present':t.left===0?'All presents bought!':t.left+' still to buy';
 $('#total-bar').style.width=t.percent+'%';
 $('#total-track').setAttribute('aria-valuenow',String(t.percent));
}
function renderGift(g){
 const isDone=bought(g.status);
 const name=esc(g.name);
 return '<span class="present '+(isDone?'bought':'')+'">' +
 '<button class="present-toggle" type="button" data-action="toggle-gift" data-id="'+esc(g.id)+'" aria-label="'+(isDone?'Mark ':'Mark ')+name+(isDone?' as to buy':' as bought')+'" title="'+(isDone?'Bought — tap to undo':'To buy — tap when purchased')+'"><span class="tick '+(isDone?'':'pending')+'" aria-hidden="true">'+(isDone?'✓':'○')+'</span><span>'+name+'</span></button>'+
 '<button class="present-edit" type="button" data-action="edit-gift" data-id="'+esc(g.id)+'" title="Edit '+name+'" aria-label="Edit '+name+'">···</button></span>';
}
function renderPerson(p){
 const gifts=yearData().gifts.filter(g=>g.personId===p.id);
 const done=gifts.length>0&&gifts.every(g=>bought(g.status));
 return '<div class="family-row"><div class="person-name '+(done?'complete':'')+'"><button type="button" data-action="edit-person" data-id="'+esc(p.id)+'" title="Edit '+esc(p.name)+'">'+esc(p.name)+'</button></div>'+
 '<div class="presents">'+(gifts.length?gifts.map(renderGift).join(''):'<span class="empty-person">No presents yet</span>')+
 '<button type="button" class="add-present" data-action="add-gift" data-person-id="'+esc(p.id)+'" aria-label="Add a present for '+esc(p.name)+'" title="Add a present for '+esc(p.name)+'">＋</button></div></div>';
}
function renderGroup(g){
 const d=yearData(),members=d.people.filter(p=>groupFor(p)===g.id);
 const ids=new Set(members.map(p=>p.id));
 const gifts=d.gifts.filter(gift=>ids.has(gift.personId));
 const done=gifts.filter(gift=>bought(gift.status)).length;
 const color=gifts.length===0?'':done===gifts.length?'complete':'partial';
 return '<article class="group-card" data-group="'+esc(g.id)+'" aria-label="'+esc(g.name)+'">'+
 '<header class="group-head"><h2 class="group-heading">'+esc(g.name)+'</h2><div class="group-meta"><span class="count '+color+'">'+done+' / '+gifts.length+' bought</span>'+
 '<button type="button" class="add-small" data-action="add-person" data-group="'+esc(g.id)+'" title="Add someone to '+esc(g.name)+'" aria-label="Add someone to '+esc(g.name)+'">＋</button></div></header>'+
 (members.length?members.map(renderPerson).join(''):'<div class="no-people">Nobody in this group yet. Use + to add someone.</div>')+
 '</article>';
}
function render(){
 if(!ready)return;
 renderHeader();
 $('#group-grid').innerHTML=GROUPS.map(renderGroup).join('');
}
function toast(message){
 const el=$('#toast');el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,3000);
}
function status(message){$('#save-status').textContent=message;}
function error(message){$('#error').textContent=message;$('#error').hidden=false;}
function snapshot(){return copy(state);}
function readPending(){try{return JSON.parse(localStorage.getItem(PENDING)||'null');}catch{return null;}}
function pendingCopy(){try{localStorage.setItem(PENDING,JSON.stringify({base,data:snapshot(),at:Date.now()}));return true;}catch{return false;}}
function changed(){
 if(!ready||blocked)return;
 revision++;dirty=true;
 if(!pendingCopy()){error('Could not save a recovery copy on this device. Keep the page open until your account has synced.');status('Device backup unavailable');}
 else status('Saved on this device · syncing');
 render();
 clearTimeout(timer);timer=setTimeout(sync,550);
}
async function sync(){
 if(!ready||blocked||!dirty||saving)return;
 saving=true;clearTimeout(timer);
 try{
  while(dirty&&!blocked){
   const data=snapshot(),rev=revision;
   status('Syncing…');
   try{
    await dbSave(RECORD,data);
    base=JSON.stringify(data);
    if(rev===revision){dirty=false;try{localStorage.removeItem(PENDING);}catch{}status('Saved to your account');}
    else pendingCopy();
   }catch(e){
    if(e.status===409){
     blocked=true;status('Save conflict — review needed');
     showRecovery('Changes saved on another device conflict with this copy. Export your device copy before reloading.');
    }else{status('Saved on this device · sync pending');timer=setTimeout(sync,14000);}
    break;
   }
  }
 }finally{saving=false;}
}
function exportData(data){
 const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='christmas-list-'+state.activeYear+'-backup.json';document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function showRecovery(message){
 const box=$('#recovery');box.hidden=false;
 box.innerHTML='<strong>Saved changes need attention</strong><p>'+esc(message)+'</p><button class="quiet" type="button" id="export-recovery">Export device copy</button> <button class="quiet" type="button" id="reload-recovery">Reload account version</button>';
 $('#export-recovery').onclick=()=>exportData(readPending()?.data||state);
 $('#reload-recovery').onclick=()=>{
  if(!confirm('Reload the account version? Export any unsynced changes first.'))return;
  try{localStorage.removeItem(PENDING);}catch{}
  location.reload();
 };
}
async function init(){
 if(ready)return;
 try{
  const remote=await dbLoad(RECORD);
  base=JSON.stringify(remote);
  state=normalise(remote);
  const pending=readPending();
  if(pending?.data){
   if(JSON.stringify(pending.data)===base){try{localStorage.removeItem(PENDING);}catch{}}
   else if(pending.base===base){state=normalise(pending.data);dirty=true;revision++;status('Restoring saved device changes');}
   else{blocked=true;state=normalise(pending.data);showRecovery('Your device has unsynced changes that differ from the account version. Neither copy has been overwritten.');}
  }
  ready=true;render();
  if(dirty&&!blocked)sync();
  else if(!blocked)status('Saved to your account');
 }catch(e){
  error('Could not load your Christmas List. Please reconnect and reload. Your saved data has not been replaced.');
  status('Connection needed');
 }
}
function showDialog(){if(!$('#editor').open)$('#editor').showModal();}
function openPerson(id,groupHint){
 if(blocked)return;
 const data=yearData(),p=id?data.people.find(x=>x.id===id):null;
 editMode='person';editId=p?.id||null;
 $('#editor-title').textContent=p?'Edit person':'Add a family member';
 $('#editor-form').innerHTML='<div class="form-fields">'+
 '<label class="field">Name<input name="name" maxlength="80" required value="'+esc(p?.name||'')+'" placeholder="Name"></label>'+
 '<label class="field">Family group<select name="group">'+GROUPS.map(g=>'<option value="'+g.id+'"'+((p?groupFor(p):groupHint||'other')===g.id?' selected':'')+'>'+esc(g.name)+'</option>').join('')+'</select></label></div>'+
 '<div class="modal-actions">'+(p?'<button type="button" class="danger" id="delete-person">Remove</button>':'')+
 '<button type="button" class="quiet" id="cancel-editor">Cancel</button><button class="primary" type="submit">'+(p?'Save':'Add person')+'</button></div>';
 $('#cancel-editor').onclick=()=>$('#editor').close();
 $('#delete-person')?.addEventListener('click',()=>deletePerson(p.id));
 $('#editor-form').onsubmit=savePerson;
 showDialog();$('#editor-form [name=name]').focus();
}
function savePerson(ev){
 ev.preventDefault();if(blocked)return;
 const fd=new FormData(ev.currentTarget),name=String(fd.get('name')||'').trim(),group=String(fd.get('group')||'other');
 if(!name||!GROUPS.some(g=>g.id===group)){toast('Please enter a name and family group.');return;}
 const d=yearData();
 if(editId){const p=d.people.find(x=>x.id===editId);if(!p)return;p.name=name;p.group=group;}
 else d.people.push({id:uid(),name,group,budget:0});
 $('#editor').close();changed();toast('Family member saved');
}
function deletePerson(id){
 if(blocked)return;
 const d=yearData(),p=d.people.find(x=>x.id===id);if(!p)return;
 if(d.gifts.some(g=>g.personId===id)){toast('Delete or move their presents first.');return;}
 if(!confirm('Remove '+p.name+' from this year?'))return;
 d.people=d.people.filter(x=>x.id!==id);
 $('#editor').close();changed();toast('Family member removed');
}
function openGift(id,personHint){
 if(blocked)return;
 const d=yearData();
 if(!d.people.length){openPerson(null,'other');return;}
 const g=id?d.gifts.find(x=>x.id===id):null;
 editMode='gift';editId=g?.id||null;
 $('#editor-title').textContent=g?'Edit present':'Add present';
 $('#editor-form').innerHTML='<div class="form-fields">'+
 '<label class="field">Present<input name="name" maxlength="140" required value="'+esc(g?.name||'')+'" placeholder="e.g. Scarf, concert tickets…"></label>'+
 '<label class="field">Who is it for?<select name="personId">'+d.people.map(p=>'<option value="'+esc(p.id)+'"'+((g?.personId||personHint||d.people[0].id)===p.id?' selected':'')+'>'+esc(p.name)+' · '+esc(GROUPS.find(gr=>gr.id===groupFor(p))?.name||'Other')+'</option>').join('')+'</select></label>'+
 '<label class="check-label"><input type="checkbox" name="bought" '+(g&&bought(g.status)?'checked':'')+'> Already bought</label></div>'+
 '<div class="modal-actions">'+(g?'<button class="danger" id="delete-gift" type="button">Delete</button>':'')+
 '<button type="button" class="quiet" id="cancel-editor">Cancel</button><button type="submit" class="primary">'+(g?'Save changes':'Add present')+'</button></div>';
 $('#cancel-editor').onclick=()=>$('#editor').close();
 $('#delete-gift')?.addEventListener('click',()=>deleteGift(g.id));
 $('#editor-form').onsubmit=saveGift;
 showDialog();$('#editor-form [name=name]').focus();
}
function saveGift(ev){
 ev.preventDefault();if(blocked)return;
 const form=ev.currentTarget,fd=new FormData(form);
 const name=String(fd.get('name')||'').trim(),personId=String(fd.get('personId')||'');
 const isDone=!!fd.get('bought');
 if(!name||!yearData().people.some(p=>p.id===personId)){toast('Enter a present and recipient.');return;}
 const d=yearData(),index=d.gifts.findIndex(g=>g.id===editId);
 const old=index>=0?d.gifts[index]:null;
 // Preserve prices, notes and retailer links saved in the previous detailed layout.
 const gift={...(old||{}),id:old?.id||uid(),name,personId,status:isDone?(old&&bought(old.status)?old.status:'received'):'to_buy',price:old?.price||0,quantity:old?.quantity||1};
 if(index>=0)d.gifts[index]=gift;else d.gifts.push(gift);
 $('#editor').close();changed();toast('Present saved');
}
function deleteGift(id){
 if(blocked)return;
 if(!confirm('Delete this present?'))return;
 yearData().gifts=yearData().gifts.filter(g=>g.id!==id);
 $('#editor').close();changed();toast('Present deleted');
}
function toggleGift(id){
 if(blocked)return;
 const gift=yearData().gifts.find(g=>g.id===id);if(!gift)return;
 gift.status=bought(gift.status)?'to_buy':'received';
 changed();toast(bought(gift.status)?'Marked as bought':'Back on your shopping list');
}
function newYear(){
 if(blocked)return;
 const next=Math.max(...Object.keys(state.years).map(Number))+1;
 if(!confirm('Start Christmas '+next+'? Names and groups will be copied, but presents stay in '+state.activeYear+'.'))return;
 const previous=yearData();
 state.years[String(next)]=blankYear(true,previous.people);
 state.activeYear=next;
 changed();toast('Christmas '+next+' is ready');
}
$('#app').addEventListener('click',event=>{
 const button=event.target.closest('[data-action]');
 if(!button||!ready)return;
 const action=button.dataset.action;
 if(action==='add-gift')openGift(null,button.dataset.personId);
 else if(action==='edit-gift')openGift(button.dataset.id);
 else if(action==='toggle-gift')toggleGift(button.dataset.id);
 else if(action==='add-person')openPerson(null,button.dataset.group);
 else if(action==='edit-person')openPerson(button.dataset.id);
 else if(action==='new-year')newYear();
});
$('#year-select').addEventListener('change',event=>{
 if(!ready||blocked)return;
 const year=Number(event.target.value);
 if(!state.years[String(year)])return;
 state.activeYear=year;changed();
});
$('#close-editor').onclick=()=>$('#editor').close();
window.addEventListener('online',()=>{if(ready&&!blocked)sync();});
document.addEventListener('visibilitychange',()=>{if(ready&&!blocked&&document.visibilityState==='hidden')sync();});
window.addEventListener('beforeunload',event=>{if(dirty&&saving){event.preventDefault();event.returnValue='';}});
document.addEventListener('mytrips:authed',init);
if(window._mytripsAuthed)init();
})();