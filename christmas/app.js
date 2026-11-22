(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = value => new Intl.NumberFormat('en-GB', {style:'currency', currency:'GBP', minimumFractionDigits:2}).format(Number(value) || 0);
const currency = n => Math.round((Number(n) || 0) * 100) / 100;
const uuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'gift-' + Date.now() + '-' + Math.random().toString(36).slice(2));
const isBought = status => ['ordered','received','wrapped'].includes(status);
const statuses = [['idea','Idea'],['to_buy','To buy'],['ordered','Ordered'],['received','Received'],['wrapped','Wrapped']];
const statusName = status => (statuses.find(x => x[0] === status) || statuses[0])[1];
const safeLink = link => {try {const u=new URL(String(link || '').trim());return ['https:','http:'].includes(u.protocol) ? u.href : '';} catch {return '';}};
const blankYear = () => ({people:[],gifts:[]});
const initialState = () => ({schema:1,activeYear:new Date().getFullYear(),years:{[String(new Date().getFullYear())]:blankYear()}});
const RECORD='christmas-list-v1', PENDING='christmas-list-pending-v1';
let state=initialState(),tab='overview',ready=false,blocked=false,dirty=false,saving=false,revision=0,base='null',timer=null,toastTimer=null;
let shoppingStatus='to_buy',shoppingPerson='all',shoppingSearch='',editMode='',editId=null;

function yearData() {return state.years[String(state.activeYear)];}
function paidAmount(g) {return currency((g.actualPrice === '' || g.actualPrice === null || g.actualPrice === undefined ? g.price : g.actualPrice) * (g.quantity || 1));}
function plannedAmount(g) {return currency(g.price * (g.quantity || 1));}
function totals() {
 const data=yearData(), selected=data.gifts.filter(g=>g.status!=='idea'), purchased=selected.filter(g=>isBought(g.status));
 const spent=currency(purchased.reduce((a,g)=>a+paidAmount(g),0));
 const planned=currency(data.gifts.filter(g=>g.status==='to_buy').reduce((a,g)=>a+plannedAmount(g),0));
 const budget=currency(data.people.reduce((a,p)=>a+p.budget,0));
 return {people:data.people.length, gifts:data.gifts.length, toBuy:data.gifts.filter(g=>g.status==='to_buy').length,
  ordered:data.gifts.filter(g=>g.status==='ordered').length, received:data.gifts.filter(g=>g.status==='received').length,
  wrapped:data.gifts.filter(g=>g.status==='wrapped').length, selected:selected.length,
  bought:purchased.length, spent, planned, budget, remaining:currency(budget-spent),
  projection:currency(budget-spent-planned),percent:selected.length?Math.round(purchased.length/selected.length*100):0};
}
function nameFor(id) {return yearData().people.find(p=>p.id===id)?.name || 'Unknown person';}
function noData(title,subtitle,buttonText,action) {
 return '<div class="empty"><div class="symbol">✧</div><h3>'+esc(title)+'</h3><p>'+esc(subtitle)+'</p>'+(buttonText?'<button class="button" data-action="'+action+'">'+esc(buttonText)+'</button>':'')+'</div>';
}
function giftRow(g, interactive=false) {
 const url=safeLink(g.url), person=esc(nameFor(g.personId));
 return '<div class="gift"><div style="min-width:0"><div class="gift-name">'+esc(g.name)+'</div><div class="gift-sub">For '+person+
 (g.quantity>1?' · Qty '+g.quantity:'') + (g.shop?' · '+esc(g.shop):'') +
 (url?' · <a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Shop link ↗</a>':'')+
 '</div></div><div class="gift-end"><span class="price">'+fmt(isBought(g.status)?paidAmount(g):plannedAmount(g))+'</span>'+
 (interactive?'<select class="inline-select" data-status-gift="'+esc(g.id)+'" aria-label="Status for '+esc(g.name)+'">'+
 statuses.map(s=>'<option value="'+s[0]+'"'+(s[0]===g.status?' selected':'')+'>'+s[1]+'</option>').join('')+'</select>'+
 '<button class="outline small" data-action="edit-gift" data-id="'+esc(g.id)+'">Edit</button>':
 '<span class="pill '+esc(g.status)+'">'+esc(statusName(g.status))+'</span>')+'</div></div>';
}
function yearOptions() {return Object.keys(state.years).sort((a,b)=>Number(b)-Number(a)).map(y=>'<option value="'+esc(y)+'"'+(Number(y)===state.activeYear?' selected':'')+'>'+esc(y)+'</option>').join('');}
function renderHeader() {
 const t=totals();$('#year-select').innerHTML=yearOptions();$('#hero-percent').textContent=t.percent+'% complete';
 $('#hero-count').textContent=t.bought+' of '+t.selected+' selected gifts purchased';
 $('#hero-bar').style.width=t.percent+'%';
 document.querySelectorAll('[data-tab]').forEach(b=>b.dataset.tab===tab?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current'));
}
function budgetCard() {
 const t=totals();
 return '<section class="panel"><div class="row"><span class="label">YOUR CHRISTMAS BUDGET</span><span style="color:var(--red);font-size:21px;font-weight:800">£</span></div>'+
 '<div class="figure">'+fmt(t.spent)+' <span class="muted">/ '+fmt(t.budget)+'</span></div>'+
 '<div class="thin-track"><span style="width:'+Math.min(100,t.budget?t.spent/t.budget*100:0)+'%"></span></div>'+
 '<div class="row"><span class="muted">Spent or ordered</span><strong class="'+(t.remaining<0?'over':'')+'" style="font-size:12px">'+fmt(t.remaining)+' remaining</strong></div>'+
 (t.budget===0?'<p class="tiny">Add a budget for each person to start tracking your spending.</p>':'')+'</section>';
}
function overview() {
 const t=totals(),todo=yearData().gifts.filter(g=>g.status==='to_buy').slice(0,5);
 return '<div class="stat-grid">'+[
 [t.people,'People to buy for'],[t.toBuy,'Still to buy'],[t.bought,'Gifts purchased'],[t.wrapped,'Wrapped']
 ].map(s=>'<div class="stat"><strong>'+s[0]+'</strong><span>'+s[1]+'</span></div>').join('')+'</div>'+
 '<div class="two-col"><div><section class="panel"><div class="section-heading"><div><h2>Still to buy</h2><p>All the presents left on your shopping list.</p></div><button class="text-link" data-action="show-shopping">View all →</button></div>'+
 (todo.length?todo.map(g=>giftRow(g)).join(''):noData('Nothing on your shopping list','Add a family member and their first present.','Add a present','add-gift'))+
 '</section></div><div>'+budgetCard()+
 '<section class="panel"><div class="section-heading"><div><h2>Arriving & wrapping</h2><p>Keep the final bits organised.</p></div></div>'+
 '<div class="budget-row row"><span class="muted">Orders awaiting delivery</span><strong>'+t.ordered+'</strong></div>'+
 '<div class="budget-row row"><span class="muted">Received, awaiting wrapping</span><strong>'+t.received+'</strong></div>'+
 '<div class="budget-row row"><span class="muted">Ready for Christmas</span><strong>'+t.wrapped+'</strong></div></section></div></div>';
}
function personCard(p) {
 const gifts=yearData().gifts.filter(g=>g.personId===p.id);
 const spent=currency(gifts.filter(g=>isBought(g.status)).reduce((a,g)=>a+paidAmount(g),0)),left=currency(p.budget-spent);
 return '<section class="panel"><div class="row"><div class="person-name"><span class="avatar">'+esc(p.name.trim().slice(0,1).toUpperCase())+'</span><div><h3>'+esc(p.name)+'</h3><span class="muted">'+gifts.length+' '+(gifts.length===1?'present':'presents')+'</span></div></div>'+
 '<button class="outline small" data-action="edit-person" data-id="'+esc(p.id)+'">Edit</button></div>'+
 '<div class="row" style="margin-top:15px"><span class="muted">Budget '+fmt(p.budget)+'</span><strong class="'+(left<0?'over':'')+'" style="font-size:12px">'+fmt(spent)+' spent</strong></div>'+
 '<div class="thin-track"><span style="width:'+Math.min(100,p.budget?spent/p.budget*100:0)+'%"></span></div>'+
 '<div class="tiny">'+fmt(left)+' remaining</div>'+
 '<div class="person-gifts">'+(gifts.length?gifts.slice(0,4).map(g=>giftRow(g)).join(''):'<p class="muted">No presents added yet.</p>')+'</div>'+
 '<div class="action-row" style="margin-top:8px"><button class="outline small" data-action="add-gift" data-person-id="'+esc(p.id)+'">＋ Add present</button></div></section>';
}
function peopleView() {
 const people=yearData().people;
 return '<div class="section-heading"><div><h2>Family & friends</h2><p>Set a budget for each person and organise their gifts.</p></div><button class="button" data-action="add-person">＋ Add person</button></div>'+
 (people.length?'<div class="person-grid">'+people.map(personCard).join('')+'</div>':
 '<section class="panel">'+noData('Who are you buying for?','Add your first family member or friend to get started.','Add someone','add-person')+'</section>');
}
function shoppingView() {
 const d=yearData(),results=d.gifts.filter(g=>(shoppingStatus==='all'||g.status===shoppingStatus)&&
 (shoppingPerson==='all'||g.personId===shoppingPerson)&&
 (g.name+' '+g.shop+' '+nameFor(g.personId)).toLowerCase().includes(shoppingSearch.toLowerCase()))
 .sort((a,b)=>nameFor(a.personId).localeCompare(nameFor(b.personId))||a.name.localeCompare(b.name));
 return '<div class="section-heading"><div><h2>Your shopping list</h2><p>Filter, edit and tick off presents while you shop.</p></div><button class="button" data-action="add-gift">＋ Add gift</button></div>'+
 '<div class="toolbar"><select id="status-filter" aria-label="Filter by status"><option value="all">All statuses</option>'+statuses.map(x=>'<option value="'+x[0]+'"'+(x[0]===shoppingStatus?' selected':'')+'>'+x[1]+'</option>').join('')+'</select>'+
 '<select id="person-filter" aria-label="Filter by person"><option value="all">All people</option>'+d.people.map(p=>'<option value="'+esc(p.id)+'"'+(shoppingPerson===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select>'+
 '<input id="gift-search" type="search" autocomplete="off" placeholder="Search presents or shops…" value="'+esc(shoppingSearch)+'" aria-label="Search presents"></div>'+
 '<section class="panel"><div class="row"><strong style="font-size:12px">'+results.length+' '+(results.length===1?'present':'presents')+'</strong><span class="muted">'+fmt(results.reduce((a,g)=>a+(isBought(g.status)?paidAmount(g):plannedAmount(g)),0))+' shown</span></div><hr class="divider">'+
 (results.length?results.map(g=>giftRow(g,true)).join(''):noData('Nothing to show','Try another filter or add a new present.','Add a present','add-gift'))+'</section>';
}
function budgetView(){
 const t=totals();
 return '<div class="section-heading"><div><h2>Christmas budget</h2><p>Only ordered, received and wrapped gifts count as spent.</p></div><button class="outline" data-action="export">Export backup</button></div>'+
 '<div class="stat-grid">'+[[fmt(t.budget),'Total allocated'],[fmt(t.spent),'Spent / ordered'],[fmt(t.planned),'Still to purchase'],[fmt(t.projection),'After planned purchases']].map(s=>'<div class="stat"><strong style="font-size:21px">'+s[0]+'</strong><span>'+s[1]+'</span></div>').join('')+'</div>'+
 '<section class="panel"><div class="section-heading"><div><h2>Budget by person</h2><p>Change each person’s budget using Edit on the People tab.</p></div></div>'+
 (yearData().people.length?yearData().people.map(p=>{
 const spent=currency(yearData().gifts.filter(g=>g.personId===p.id&&isBought(g.status)).reduce((a,g)=>a+paidAmount(g),0));
 return '<div class="budget-row"><div class="row"><strong style="font-size:13px">'+esc(p.name)+'</strong><span class="muted">'+fmt(spent)+' / '+fmt(p.budget)+'</span></div>'+
 '<div class="thin-track"><span style="width:'+Math.min(100,p.budget?spent/p.budget*100:0)+'%"></span></div>'+
 (spent>p.budget?'<span class="warning">'+fmt(spent-p.budget)+' over budget</span>':'')+'</div>';
 }).join(''):noData('No budgets yet','Add people to set individual spending limits.','Add a person','add-person'))+'</section>'+
 '<section class="panel"><div class="section-heading"><div><h2>Christmas archives</h2><p>Create a new year with the same family members and budgets, but an empty gift list.</p></div></div><div class="action-row"><button class="outline" data-action="new-year">＋ Start next Christmas</button><span class="muted">Previous Christmas years remain available in the selector at the top.</span></div></section>';
}
function render(){
 if(!ready)return;
 renderHeader();
 $('#content').innerHTML=tab==='people'?peopleView():tab==='shopping'?shoppingView():tab==='budget'?budgetView():overview();
}
function showTab(next) {tab=next;render();window.scrollTo({top:0,behavior:'instant'});}
function toast(message){const el=$('#toast');el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,3500);}
function setStatus(message){$('#save-status').textContent=message;}
function error(message){$('#error').textContent=message;$('#error').hidden=false;}
function hideError(){$('#error').hidden=true;}
function snapshot(){return JSON.parse(JSON.stringify(state));}
function writePending(){try{localStorage.setItem(PENDING,JSON.stringify({base,data:snapshot(),at:Date.now()}));return true;}catch{return false;}}
function changed(){
 if(!ready||blocked)return;
 revision++;dirty=true;
 if(!writePending()){error('Your device cannot keep a recovery copy. Export your data before leaving the page.');setStatus('Device backup unavailable');}
 else setStatus('Saved on this device · syncing');
 render();clearTimeout(timer);timer=setTimeout(sync,550);
}
async function sync(){
 if(!ready||blocked||!dirty||saving)return;
 saving=true;clearTimeout(timer);
 try {
  while(dirty&&!blocked){
   const data=snapshot(),version=revision;
   setStatus('Syncing…');
   try {
    await dbSave(RECORD,data);
    base=JSON.stringify(data);
    if(version===revision){dirty=false;try{localStorage.removeItem(PENDING);}catch{}setStatus('Synced to your account');}
    else{writePending();}
   } catch(e) {
    if(e.status===409){blocked=true;setStatus('Save conflict — action needed');showRecovery('Your account has newer changes from another device. This device copy is protected. Export it before reloading to compare.');}
    else{setStatus('Saved on this device · sync pending');timer=setTimeout(sync,14000);}
    break;
   }
  }
 }finally{saving=false;}
}
function download(data){
 const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='christmas-list-'+state.activeYear+'-backup.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function showRecovery(message){
 const box=$('#recovery');box.hidden=false;box.innerHTML='<strong>Saved data needs attention</strong><p>'+esc(message)+'</p><div class="action-row"><button class="outline" id="recovery-export">Export device copy</button><button class="outline" id="recovery-reload">Reload account copy</button></div>';
 $('#recovery-export').onclick=()=>{const p=readPending();download(p?.data||state);};
 $('#recovery-reload').onclick=()=>{if(confirm('Reload your account copy? Export any unsynced changes first.')){try{localStorage.removeItem(PENDING);}catch{}location.reload();}};
}
function readPending(){try{return JSON.parse(localStorage.getItem(PENDING)||'null');}catch{return null;}}
function normalise(raw) {
 if(!raw)return initialState();
 if(raw.schema!==1||!raw.years||typeof raw.years!=='object'||!Object.keys(raw.years).length)throw Error('Unsupported Christmas List data format');
 const data=JSON.parse(JSON.stringify(raw));
 Object.values(data.years).forEach(y=>{if(!Array.isArray(y.people)||!Array.isArray(y.gifts))throw Error('Invalid Christmas List data');});
 if(!data.years[String(data.activeYear)])data.activeYear=Number(Object.keys(data.years)[0]);
 return data;
}
async function init(){
 if(ready)return;
 try{
  const remote=await dbLoad(RECORD);
  base=JSON.stringify(remote);
  state=normalise(remote);
  const pending=readPending();
  if(pending&&pending.data){
   if(JSON.stringify(pending.data)===base){try{localStorage.removeItem(PENDING);}catch{}}
   else if(pending.base===base){state=normalise(pending.data);dirty=true;revision++;setStatus('Restoring your saved device changes');}
   else {blocked=true;state=normalise(pending.data);showRecovery('Your device has unsynced changes that differ from the current account version. No data has been overwritten.');}
  }
  ready=true;render();
  if(dirty&&!blocked)sync();
  else if(!blocked)setStatus('Connected to your account');
 }catch(e){error('Could not load your Christmas List. Please reconnect and reload. No existing data has been overwritten.');setStatus('Connection needed');}
}
function options(selected) {return statuses.map(s=>'<option value="'+s[0]+'"'+(selected===s[0]?' selected':'')+'>'+s[1]+'</option>').join('');}
function showDialog(){const dlg=$('#editor');if(!dlg.open)dlg.showModal();}
function openPerson(id) {
 if(blocked)return;
 const p=id?yearData().people.find(x=>x.id===id):null;editMode='person';editId=p?.id||null;
 $('#editor-title').textContent=p?'Edit person':'Add someone';
 $('#editor-form').innerHTML='<div class="dialog-fields">'+
 '<label class="field span-2">Name<input name="name" maxlength="80" required value="'+esc(p?.name||'')+'" placeholder="e.g. Mum"></label>'+
 '<label class="field span-2">Christmas budget (£)<input name="budget" type="number" step="0.01" min="0" inputmode="decimal" value="'+esc(p?.budget??'100')+'" required></label></div>'+
 '<div class="form-actions">'+(p?'<button type="button" class="danger-btn" id="delete-person">Delete</button>':'')+
 '<button type="button" class="outline" id="cancel-editor">Cancel</button><button class="button" type="submit">'+(p?'Save changes':'Add person')+'</button></div>';
 $('#cancel-editor').onclick=()=>$('#editor').close();
 $('#delete-person')?.addEventListener('click',()=>deletePerson(editId));
 $('#editor-form').onsubmit=savePerson;showDialog();$('#editor-form [name=name]').focus();
}
function savePerson(ev){
 ev.preventDefault();if(blocked)return;
 const fd=new FormData(ev.currentTarget),name=String(fd.get('name')||'').trim(),budget=currency(fd.get('budget'));
 if(!name||!Number.isFinite(budget)||budget<0)return;
 const d=yearData();
 if(editId){const p=d.people.find(x=>x.id===editId);if(!p)return;p.name=name;p.budget=budget;}
 else d.people.push({id:uuid(),name,budget});
 $('#editor').close();changed();toast('Person saved');
}
function deletePerson(id){
 if(blocked)return;
 const d=yearData(),p=d.people.find(x=>x.id===id);if(!p)return;
 if(d.gifts.some(g=>g.personId===id)){toast('Remove or reassign this person’s gifts before deleting them.');return;}
 if(!confirm('Remove '+p.name+' from this Christmas list?'))return;
 d.people=d.people.filter(x=>x.id!==id);$('#editor').close();changed();
}
function openGift(id,personHint){
 if(blocked)return;
 const d=yearData();
 if(!d.people.length){toast('Add someone first so each present has a recipient.');openPerson(null);return;}
 const g=id?d.gifts.find(x=>x.id===id):null;
 editMode='gift';editId=g?.id||null;
 $('#editor-title').textContent=g?'Edit present':'Add a present';
 const person=g?.personId||personHint||d.people[0].id;
 $('#editor-form').innerHTML='<div class="dialog-fields">'+
 '<label class="field span-2">Present<input name="name" maxlength="140" required value="'+esc(g?.name||'')+'" placeholder="e.g. Winter jumper"></label>'+
 '<label class="field">Who is it for?<select name="personId" required>'+d.people.map(p=>'<option value="'+esc(p.id)+'"'+(person===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label>'+
 '<label class="field">Status<select name="status">'+options(g?.status||'to_buy')+'</select></label>'+
 '<label class="field">Planned price each (£)<input name="price" type="number" inputmode="decimal" min="0" step="0.01" required value="'+esc(g?.price??'0')+'"></label>'+
 '<label class="field">Quantity<input name="quantity" type="number" inputmode="numeric" min="1" max="999" step="1" required value="'+esc(g?.quantity||1)+'"></label>'+
 '<label class="field">Actual paid each (£)<input name="actualPrice" type="number" inputmode="decimal" min="0" step="0.01" value="'+esc(g?.actualPrice??'')+'" placeholder="Optional"></label>'+
 '<label class="field">Retailer<input name="shop" maxlength="100" value="'+esc(g?.shop||'')+'" placeholder="Optional"></label>'+
 '<label class="field span-2">Product link<input name="url" type="url" value="'+esc(g?.url||'')+'" placeholder="https://…"></label>'+
 '<label class="field span-2">Notes<textarea name="notes" maxlength="1500" placeholder="Size, delivery details, wrapping ideas…">'+esc(g?.notes||'')+'</textarea></label></div>'+
 '<div class="form-actions">'+(g?'<button type="button" class="danger-btn" id="delete-gift">Delete</button>':'')+
 '<button type="button" class="outline" id="cancel-editor">Cancel</button><button class="button" type="submit">'+(g?'Save changes':'Add present')+'</button></div>';
 $('#cancel-editor').onclick=()=>$('#editor').close();
 $('#delete-gift')?.addEventListener('click',()=>deleteGift(editId));
 $('#editor-form').onsubmit=saveGift;showDialog();$('#editor-form [name=name]').focus();
}
function saveGift(ev){
 ev.preventDefault();if(blocked)return;
 const fd=new FormData(ev.currentTarget);
 const name=String(fd.get('name')||'').trim(),personId=String(fd.get('personId')||''),status=String(fd.get('status')||'to_buy');
 const price=Number(fd.get('price')),quantity=Number(fd.get('quantity')),rawPaid=String(fd.get('actualPrice')||'').trim();
 const actualPrice=rawPaid===''?'':Number(rawPaid),url=String(fd.get('url')||'').trim();
 if(!name||!yearData().people.some(p=>p.id===personId)||!statuses.some(x=>x[0]===status)||!Number.isFinite(price)||price<0||!Number.isInteger(quantity)||quantity<1||quantity>999||(actualPrice!==''&&(!Number.isFinite(actualPrice)||actualPrice<0))||(url&&!safeLink(url))){toast('Please check the present details.');return;}
 const gift={id:editId||uuid(),name,personId,status,price:currency(price),actualPrice:actualPrice===''?'':currency(actualPrice),quantity,shop:String(fd.get('shop')||'').trim(),url:safeLink(url),notes:String(fd.get('notes')||'').trim()};
 const d=yearData(),idx=d.gifts.findIndex(g=>g.id===editId);
 if(idx>=0)d.gifts[idx]=gift;else d.gifts.push(gift);
 $('#editor').close();changed();toast('Present saved');
}
function deleteGift(id){
 if(blocked)return;
 if(!confirm('Delete this present? This cannot be undone.'))return;
 yearData().gifts=yearData().gifts.filter(g=>g.id!==id);$('#editor').close();changed();toast('Present deleted');
}
function createNextYear(){
 if(blocked)return;
 const newYear=Math.max(...Object.keys(state.years).map(Number))+1;
 if(!confirm('Start Christmas '+newYear+'? Your existing years and presents will be preserved.'))return;
 const previous=yearData();
 state.years[String(newYear)]={people:previous.people.map(p=>({id:uuid(),name:p.name,budget:p.budget})),gifts:[]};
 state.activeYear=newYear;tab='overview';shoppingStatus='to_buy';shoppingPerson='all';changed();toast('Christmas '+newYear+' is ready');
}
document.querySelectorAll('[data-tab]').forEach(btn=>btn.onclick=()=>showTab(btn.dataset.tab));
$('#close-editor').onclick=()=>$('#editor').close();
$('#year-select').onchange=e=>{const year=Number(e.target.value);if(state.years[String(year)]){state.activeYear=year;shoppingPerson='all';changed();}};
$('#app').addEventListener('click',e=>{
 const btn=e.target.closest('[data-action]');if(!btn||!ready)return;
 const a=btn.dataset.action,id=btn.dataset.id;
 if(a==='add-gift')openGift(null,btn.dataset.personId);
 else if(a==='edit-gift')openGift(id);
 else if(a==='add-person')openPerson(null);
 else if(a==='edit-person')openPerson(id);
 else if(a==='show-shopping'){shoppingStatus='to_buy';showTab('shopping');}
 else if(a==='new-year')createNextYear();
 else if(a==='export')download(state);
});
$('#app').addEventListener('change',e=>{
 if(!ready||blocked)return;
 const el=e.target;
 if(el.matches('[data-status-gift]')){const gift=yearData().gifts.find(g=>g.id===el.dataset.statusGift);if(gift){gift.status=el.value;changed();toast('Gift status updated');}}
 else if(el.id==='status-filter'){shoppingStatus=el.value;render();}
 else if(el.id==='person-filter'){shoppingPerson=el.value;render();}
});
$('#app').addEventListener('input',e=>{
 if(e.target.id==='gift-search'){
  shoppingSearch=e.target.value;
  const start=e.target.selectionStart,end=e.target.selectionEnd;
  render();const newInput=$('#gift-search');newInput?.focus();try{newInput?.setSelectionRange(start,end);}catch{}
 }
});
window.addEventListener('online',()=>{if(ready&&!blocked)sync();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')sync();});
window.addEventListener('beforeunload',e=>{if(dirty&&saving){e.preventDefault();e.returnValue='';}});
document.addEventListener('mytrips:authed',init);if(window._mytripsAuthed)init();
})();