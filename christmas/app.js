(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'christmas-' + Date.now() + '-' + Math.random().toString(36).slice(2);
const copy = x => JSON.parse(JSON.stringify(x));
// Older records may use 'idea' or 'wrapped'; display them within the three simple statuses.
const delivered = status => status === 'received' || status === 'wrapped';
const ordered = status => status === 'ordered';
const giftStage = status => delivered(status) ? 'delivered' : ordered(status) ? 'ordered' : 'not-bought';
const money = value => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(value)||0);
const currency = value => Math.round((Number(value)||0)*100)/100;
const validCost = value => value !== '' && value !== null && Number.isFinite(Number(value)) && Number(value)>=0 && Number(value)<=1000000;
const count = gift => Number.isInteger(Number(gift.quantity)) && Number(gift.quantity)>0 ? Number(gift.quantity) : 1;
const paidUnitCost = gift => gift.actualPrice !== undefined && gift.actualPrice !== null && gift.actualPrice !== '' ? Number(gift.actualPrice) : Number(gift.price)||0;
const giftCost = gift => currency((ordered(gift.status)||delivered(gift.status)?paidUnitCost(gift):Number(gift.price)||0)*count(gift));
const spending = gifts => ({
 spent:currency(gifts.filter(g=>ordered(g.status)||delivered(g.status)).reduce((sum,g)=>sum+giftCost(g),0)),
 planned:currency(gifts.filter(g=>!ordered(g.status)&&!delivered(g.status)).reduce((sum,g)=>sum+giftCost(g),0))
});
const GROUPS = [
 {id:'personal',name:'Personal Presents',people:['Joel','Jon']},
 {id:'jon',name:"Jon's Family",people:['Kevin','Valerie','Mark']},
 {id:'mums',name:"Joel's Mums",people:['Joanna','Neil','Blossom','Cohman']},
 {id:'dads',name:"Joel's Dads",people:['Malcolm','Tina','Harry','Emma','Jess','Stanley','Emmy','Sandy','Dave']}
];
const lookupGroup = name => {
 const text=String(name||'').trim().toLowerCase();
 return GROUPS.find(g => g.people.some(n => n.toLowerCase()===text))?.id || (text === 'mum' ? 'mums' : 'personal');
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
 const done=gifts.filter(g=>delivered(g.status)).length;
 const waiting=gifts.filter(g=>ordered(g.status)).length;
 const remaining=gifts.length-done-waiting;
 return {total:gifts.length,done,waiting,remaining,...spending(gifts),percent:gifts.length?Math.round(100*done/gifts.length):0,orderedPercent:gifts.length?Math.round(100*waiting/gifts.length):0};
}
function yearOptions(){return Object.keys(state.years).sort((a,b)=>Number(b)-Number(a)).map(y=>'<option value="'+esc(y)+'"'+(Number(y)===state.activeYear?' selected':'')+'>'+esc(y)+'</option>').join('');}
function renderHeader(){
 const t=totals();
 $('#year-select').innerHTML=yearOptions();
 $('#total-progress').textContent=t.done+' of '+t.total+' completed';
 $('#total-left').textContent=t.total===0?'Add your first present':t.remaining===0&&t.waiting===0?'All presents delivered!':t.waiting+' ordered · '+t.remaining+' not bought';
 $('#total-spent').textContent=money(t.spent);
 $('#total-planned').textContent=money(t.planned);
 $('#total-bar').style.width=t.percent+'%';
 $('#total-ordered-bar').style.width=t.orderedPercent+'%';
 $('#total-track').setAttribute('aria-valuenow',String(t.percent));
}
function renderGift(g){
 const stage=giftStage(g.status),name=esc(g.name);
 const label=stage==='delivered'?'Bought / delivered':stage==='ordered'?'Ordered':'Not bought';
 const unit=(ordered(g.status)||delivered(g.status))?paidUnitCost(g):Number(g.price)||0;
 return '<span class="present '+stage+'">' +
 '<button class="present-toggle" type="button" data-action="toggle-gift" data-id="'+esc(g.id)+'" aria-label="'+name+': '+label+'. Single click to change order status, double click for delivered." title="'+name+' — '+label+' · click: ordered / not bought · double click: delivered"><span class="tick" aria-hidden="true">'+(stage==='delivered'?'✓':stage==='ordered'?'◉':'○')+'</span><span>'+name+'</span></button>'+
 '<label class="gift-price"><span>£</span><input type="number" inputmode="decimal" min="0" max="1000000" step="0.01" data-price-gift="'+esc(g.id)+'" aria-label="Cost per item for '+name+'" value="'+esc(currency(unit).toFixed(2))+'"></label>'+
 '<button class="present-edit" type="button" data-action="edit-gift" data-id="'+esc(g.id)+'" title="Edit '+name+'" aria-label="Edit '+name+'">···</button></span>';
}
function renderPerson(p){
 const gifts=yearData().gifts.filter(g=>g.personId===p.id);
 const allDelivered=gifts.length>0&&gifts.every(g=>delivered(g.status));
 const allOnOrder=gifts.length>0&&!allDelivered&&gifts.every(g=>delivered(g.status)||ordered(g.status));
 const costs=spending(gifts),budget=currency(p.budget||0);
 const budgetCopy=budget>0?' <span class="budget-difference">'+(budget>=costs.spent?'Budget remaining '+money(currency(budget-costs.spent)):'Over budget '+money(currency(costs.spent-budget)))+'</span>':'';
 return '<div class="family-row"><div class="person-name '+(allDelivered?'complete':allOnOrder?'on-order':'')+'"><button type="button" data-action="edit-person" data-id="'+esc(p.id)+'" title="Edit '+esc(p.name)+'">'+esc(p.name)+'</button></div>'+
 '<div class="presents"><div class="gift-list">'+(gifts.length?gifts.map(renderGift).join(''):'<span class="empty-person">No presents yet</span>')+
 '<button type="button" class="add-present" data-action="add-gift" data-person-id="'+esc(p.id)+'" aria-label="Add a present for '+esc(p.name)+'" title="Add a present for '+esc(p.name)+'">＋</button></div>'+
 '<div class="person-total"><strong>Spent '+money(costs.spent)+'</strong><span>To buy '+money(costs.planned)+'</span>'+budgetCopy+'</div></div></div>';
}
function renderGroup(g){
 const d=yearData(),members=d.people.filter(p=>groupFor(p)===g.id);
 const ids=new Set(members.map(p=>p.id));
 const gifts=d.gifts.filter(gift=>ids.has(gift.personId));
 const done=gifts.filter(gift=>delivered(gift.status)).length;
 const waiting=gifts.filter(gift=>ordered(gift.status)).length;
 const costs=spending(gifts);
 const color=gifts.length===0?'':done===gifts.length?'complete':(waiting||done)?'partial':'';
 return '<article class="group-card" data-group="'+esc(g.id)+'" aria-label="'+esc(g.name)+'">'+
 '<header class="group-head"><h2 class="group-heading">'+esc(g.name)+'</h2><div class="group-meta"><span class="count '+color+'">'+done+' / '+gifts.length+' delivered'+(waiting?' · '+waiting+' ordered':'')+'</span>'+
 '<button type="button" class="add-small" data-action="add-person" data-group="'+esc(g.id)+'" title="Add someone to '+esc(g.name)+'" aria-label="Add someone to '+esc(g.name)+'">＋</button></div></header>'+
 (members.length?members.map(renderPerson).join(''):'<div class="no-people">Nobody in this group yet. Use + to add someone.</div>')+
 '<footer class="group-total"><strong>Group spent '+money(costs.spent)+'</strong><span>Still to buy '+money(costs.planned)+'</span></footer></article>';
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
 '<label class="field">Family group<select name="group">'+GROUPS.map(g=>'<option value="'+g.id+'"'+((p?groupFor(p):groupHint||'personal')===g.id?' selected':'')+'>'+esc(g.name)+'</option>').join('')+'</select></label>'+
 '<label class="field">Optional budget (£)<input name="budget" type="number" inputmode="decimal" min="0" max="1000000" step="0.01" value="'+esc(currency(p?.budget||0).toFixed(2))+'"></label></div>'+
 '<div class="modal-actions">'+(p?'<button type="button" class="danger" id="delete-person">Remove</button>':'')+
 '<button type="button" class="quiet" id="cancel-editor">Cancel</button><button class="primary" type="submit">'+(p?'Save':'Add person')+'</button></div>';
 $('#cancel-editor').onclick=()=>$('#editor').close();
 $('#delete-person')?.addEventListener('click',()=>deletePerson(p.id));
 $('#editor-form').onsubmit=savePerson;
 showDialog();$('#editor-form [name=name]').focus();
}
function savePerson(ev){
 ev.preventDefault();if(blocked)return;
 const fd=new FormData(ev.currentTarget),name=String(fd.get('name')||'').trim(),group=String(fd.get('group')||'personal');
 const rawBudget=String(fd.get('budget')??'0').trim(),budget=currency(rawBudget);
 if(!name||!GROUPS.some(g=>g.id===group)||!validCost(rawBudget)){toast('Please enter a name, family group and valid budget.');return;}
 const d=yearData();
 if(editId){const p=d.people.find(x=>x.id===editId);if(!p)return;p.name=name;p.group=group;p.budget=budget;}
 else d.people.push({id:uid(),name,group,budget});
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
 if(!d.people.length){openPerson(null,'personal');return;}
 const g=id?d.gifts.find(x=>x.id===id):null;
 editMode='gift';editId=g?.id||null;
 $('#editor-title').textContent=g?'Edit present':'Add present';
 $('#editor-form').innerHTML='<div class="form-fields">'+
 '<label class="field">Present<input name="name" maxlength="140" required value="'+esc(g?.name||'')+'" placeholder="e.g. Scarf, concert tickets…"></label>'+
 '<label class="field">Who is it for?<select name="personId">'+d.people.map(p=>'<option value="'+esc(p.id)+'"'+((g?.personId||personHint||d.people[0].id)===p.id?' selected':'')+'>'+esc(p.name)+' · '+esc(GROUPS.find(gr=>gr.id===groupFor(p))?.name||'Personal Presents')+'</option>').join('')+'</select></label>'+
 '<label class="field">Status<select name="status">'+[['to_buy','Not bought'],['ordered','Ordered'],['received','Bought / delivered']].map(([value,label])=>'<option value="'+value+'"'+((g?giftStage(g.status):'not-bought')===(value==='received'?'delivered':value==='ordered'?'ordered':'not-bought')?' selected':'')+'>'+label+'</option>').join('')+'</select></label>'+
 '<label class="field">Cost per item (£)<input name="price" type="number" inputmode="decimal" min="0" max="1000000" step="0.01" required value="'+esc(currency(g?(ordered(g.status)||delivered(g.status)?paidUnitCost(g):g.price):0).toFixed(2))+'"></label></div>'+
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
 const selection=String(fd.get('status')||'to_buy'),rawPrice=String(fd.get('price')??'').trim();
 if(!name||!yearData().people.some(p=>p.id===personId)||!['to_buy','ordered','received'].includes(selection)||!validCost(rawPrice)){toast('Enter a present, recipient and valid cost.');return;}
 const price=currency(rawPrice),d=yearData(),index=d.gifts.findIndex(g=>g.id===editId);
 const old=index>=0?d.gifts[index]:null;
 // Preserve retailer links, notes, quantities, and historical delivered/wrapped status.
 const newStatus=selection==='received'&&old?.status==='wrapped'?'wrapped':selection;
 const gift={...(old||{}),id:old?.id||uid(),name,personId,status:newStatus,price,actualPrice:old?.actualPrice!==undefined&&old?.actualPrice!==null&&old.actualPrice!==''?price:old?.actualPrice??'',quantity:old?.quantity||1};
 if(index>=0)d.gifts[index]=gift;else d.gifts.push(gift);
 $('#editor').close();changed();toast('Present saved');
}
function deleteGift(id){
 if(blocked)return;
 if(!confirm('Delete this present?'))return;
 yearData().gifts=yearData().gifts.filter(g=>g.id!==id);
 $('#editor').close();changed();toast('Present deleted');
}
// Delay a single click briefly so a double click never saves an unintended Ordered state.
let pendingGiftTap=null;
const TAP_WINDOW_MS=360;
function setGiftStatus(id,nextStatus){
 if(blocked)return;
 const gift=yearData().gifts.find(g=>g.id===id);
 if(!gift||gift.status===nextStatus)return;
 gift.status=nextStatus;changed();
 toast(nextStatus==='received'?'Marked bought / delivered':nextStatus==='ordered'?'Marked ordered':'Marked not bought');
}
function singleGiftTap(id){
 const gift=yearData().gifts.find(g=>g.id===id);if(!gift)return;
 setGiftStatus(id,ordered(gift.status)?'to_buy':'ordered');
}
function flushGiftTap(){
 if(!pendingGiftTap)return;
 const tap=pendingGiftTap;pendingGiftTap=null;clearTimeout(tap.timer);singleGiftTap(tap.id);
}
function toggleGift(id){
 if(blocked)return;
 const now=Date.now();
 if(pendingGiftTap&&pendingGiftTap.id===id&&now-pendingGiftTap.at<=TAP_WINDOW_MS){
  clearTimeout(pendingGiftTap.timer);pendingGiftTap=null;
  setGiftStatus(id,'received');return;
 }
 flushGiftTap();
 const tap={id,at:now,timer:null};
 tap.timer=setTimeout(()=>{if(pendingGiftTap!==tap)return;pendingGiftTap=null;singleGiftTap(id);},TAP_WINDOW_MS);
 pendingGiftTap=tap;
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
 if(action!=='toggle-gift')flushGiftTap();
 if(action==='add-gift')openGift(null,button.dataset.personId);
 else if(action==='edit-gift')openGift(button.dataset.id);
 else if(action==='toggle-gift')toggleGift(button.dataset.id);
 else if(action==='add-person')openPerson(null,button.dataset.group);
 else if(action==='edit-person')openPerson(button.dataset.id);
 else if(action==='new-year')newYear();
});
$('#year-select').addEventListener('change',event=>{
 if(!ready||blocked)return;
 flushGiftTap();
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