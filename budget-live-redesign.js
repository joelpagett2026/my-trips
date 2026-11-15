(function(){'use strict';
// All amounts are held in pence. Stored booking fields are never normalised or rewritten.
function pence(raw){const m=String(raw??'').replace(/,/g,'').match(/\d+(?:\.\d+)?/);return m?Math.round(Number(m[0])*100):null}
function model(state){
 const travellers=Math.max(1,Math.floor(Number(state.meta?.trav)||2)), rows=[], seen=new Set();
 function add(key,category,name,raw,shared,meta='',ref=''){if(seen.has(key))return;seen.add(key);const amount=pence(raw);rows.push({category,name,amount,shared,meta,ref,party:amount==null?0:amount*(shared?1:travellers)});}
 for(const h of state.meta?.hotels||[]){if(!h?.name)continue;add('hotel:'+JSON.stringify([h.name.trim().toLowerCase(),h.checkin,h.checkout,h.ref]),'Hotels',h.name,h.nightly,true,[h.checkin,h.checkout].filter(Boolean).join(' – '),h.ref);}
 for(const d of state.days||[])for(const it of d.items||[]){if(!it)continue;const b=it.booking||{},mode=it.transport?.mode||it.kicker||'Transport';
 const key=it.visitGroupId||it._id||JSON.stringify([it.type,it.title,d.date,it.time,b.ref]);
 if(it.type==='move'&&mode==='Car Hire / Road Trip'){if(it.transport?.hire){const h=it.transport.hire,c=h.costs||{};const raw=c.total!==undefined&&c.total!==''?c.total:['hire','insurance','driver','extras'].reduce((s,k)=>s+(pence(c[k])||0),0)/100;add('car:'+ (h.ref||key),'Car Hire',h.company||'Car hire',raw,true,d.date,h.ref);}continue;}
 const category=it.type==='move'?(mode==='Flight'?'Flights':'Transport'):['act','ticket','attraction'].includes(it.type)?'Attractions':null;
 if(category)add(category+':'+key,category,it.title,b.price,false,d.date,b.ref);
 }
 const budget=state.meta?.budget||{};
 if(budget.carHireCost!==undefined&&budget.carHireCost!==null&&String(budget.carHireCost)!==''){for(let i=rows.length-1;i>=0;i--)if(rows[i].category==='Car Hire')rows.splice(i,1);add('car-override','Car Hire','Car hire override',budget.carHireCost,true,'Replaces rental booking costs');}
 if(pence(budget.fuelCost))add('fuel','Car Hire','Fuel',budget.fuelCost,true);
 return {travellers,rows,total:rows.reduce((s,r)=>s+r.party,0)};
}
window.BudgetCosts={model,pence};
const categories=['Hotels','Flights','Transport','Attractions','Car Hire'];
const colors=['#3d7c8b','#526b82','#526b82','#648a69','#6e5090'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cash=p=>'£'+(p/100).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
function categoryIcon(category){
 const hotelIcon="<svg viewBox=\"0 0 50 50\" fill=\"currentColor\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"m4.9211 27.8364v-15.6425c0-1.0828-.8778-1.9606-1.9605-1.9606-1.0828 0-1.9606.8778-1.9606 1.9606v25.612c0 1.0828.8778 1.9606 1.9606 1.9606s1.9605-.8778 1.9605-1.9606v-3.673l40.1579-.0944v3.673c0 1.0828.8778 1.9606 1.9605 1.9606s1.9605-.8779 1.9605-1.9607v-3.673-5.1285-1.168z\"/><path d=\"m49 26.1569h-29.8042v-7.3876c0-2.1401 1.7349-3.875 3.875-3.875h18.1063c4.3205 0 7.8229 3.5024 7.8229 7.8229z\"/><circle cx=\"12.219\" cy=\"20.526\" r=\"4.787\"/></svg>";
 const icons=typeof ICO==='undefined'?{}:ICO;
 return ({Hotels:hotelIcon,Flights:icons.plane,Transport:icons.bus,Attractions:icons.ticket,'Car Hire':icons.car})[category]||'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="6" width="16" height="12" rx="3"/><path d="M8 10h8M8 14h5"/></svg>';
}
function chartData(sums){return [
 {name:'Hotels',value:sums[0],color:colors[0]},
 {name:'Flights & transport',value:sums[1]+sums[2],color:colors[1]},
 {name:'Attractions',value:sums[3],color:colors[3]},
 {name:'Car Hire',value:sums[4],color:colors[4]}
];}
function donut(groups){
 const total=groups.reduce((sum,g)=>sum+g.value,0);let offset=0;
 const segments=groups.filter(g=>g.value>0).map(g=>{const share=g.value/total*100;
 const circle=`<circle cx="100" cy="100" r="76" fill="none" stroke="${g.color}" stroke-width="22" pathLength="100" stroke-dasharray="${share} ${100-share}" stroke-dashoffset="${-offset}" transform="rotate(-90 100 100)"><title>${esc(g.name)}: ${cash(g.value)} (${Math.round(share)}%)</title></circle>`;offset+=share;return circle;
 }).join('');
 return `<div class="bd-donut"><svg viewBox="0 0 200 200" role="img" aria-label="${total?'Cost split by category; exact amounts are listed alongside.':'No costs entered yet'}"><circle cx="100" cy="100" r="76" fill="none" stroke="#edf0f1" stroke-width="22"/>${segments}</svg><div class="bd-donut-label"><strong>${total?'Cost split':'No costs'}</strong><span>${total?'by category':'entered yet'}</span></div></div>`;
}
window.BudgetCosts.chartData=chartData;
let filter='All costs';
function render(){const root=document.getElementById('budget-main');if(!root||typeof STATE==='undefined')return;const m=model(STATE),pp=STATE.meta?.budget?.displayMode==='person',div=pp?m.travellers:1,fmt=p=>cash(p/div),readOnly=typeof SHARE_VIEW_ACTIVE!=='undefined'&&SHARE_VIEW_ACTIVE;
 // Allocate fractional pennies in per-person display once, so item and category sums reconcile exactly.
 let cumulative=0,allocated=0;for(const r of m.rows){cumulative+=r.party;const next=Math.round(cumulative/div);r.display=next-allocated;allocated=next;}
 const sums=categories.map(c=>m.rows.filter(r=>r.category===c).reduce((s,r)=>s+r.display,0));
 const suffix=pp?'per person':'whole party';
 const groups=chartData(sums),dayCount=(STATE.days||[]).length;
 root.innerHTML=`<div class="bd-toolbar"><div><h2>Trip budget</h2><p>Your costs, at a glance</p></div><div class="bd-controls"><div class="bd-toggle" role="group" aria-label="Budget totals"><button data-mode="person" aria-pressed="${pp}">Per person</button><button data-mode="party" aria-pressed="${!pp}">Whole party</button></div><label>Travellers <input id="bd-travellers" type="number" min="1" max="100" step="1" value="${m.travellers}" ${readOnly?'disabled':''}></label></div></div>
 <section class="bd-overview" aria-label="Budget overview"><div class="bd-quick-totals"><div class="bd-kicker">${pp?'Per-person budget':'Whole-party budget'}</div><div class="bd-main-total">${fmt(m.total)}</div><div class="bd-caption">${m.travellers} traveller${m.travellers===1?'':'s'} · ${m.rows.filter(r=>r.amount!==null).length} priced entries</div><div class="bd-secondary-totals"><div><span>${pp?'Whole party':'Per person'}</span><strong>${pp?cash(m.total):cash(m.total/m.travellers)}</strong></div><div><span>Daily · ${suffix}</span><strong>${dayCount?fmt(m.total/dayCount):'—'}</strong></div></div></div><div class="bd-chart-area">${donut(groups)}<div class="bd-legend"><div class="bd-kicker">Where the money goes · ${suffix}</div>${groups.map(g=>`<div class="bd-legend-row"><span class="bd-dot" style="background:${g.color}"></span><span class="bd-legend-name">${g.name}</span><span class="bd-legend-pct">${allocated?Math.round(g.value/allocated*100):0}%</span><strong>${cash(g.value)}</strong></div>`).join('')}<div class="bd-legend-total"><span>Total</span><strong>${fmt(m.total)}</strong></div></div></div></section>
 <div class="bd-filters" role="group" aria-label="Cost categories">${['All costs',...categories].map(c=>`<button data-category="${c}" style="--pill-color:${c==='All costs'?'#555':colors[categories.indexOf(c)]}" aria-pressed="${filter===c}"><span class="bd-filter-icon">${categoryIcon(c)}</span>${c}</button>`).join('')}</div><div class="bv-breakdown"><div class="bv-breakdown-title">Itemised costs · ${suffix}</div><div class="bv-grid">${categories.map((c,i)=>{if(filter!=='All costs'&&filter!==c)return '';const rows=m.rows.filter(r=>r.category===c);return `<section class="bv-panel" style="--accent:${colors[i]}"><div class="bv-panel-head"><span class="bv-panel-title"><span class="bd-section-icon">${categoryIcon(c)}</span>${c}<span class="bv-panel-subcount">${rows.length} entries</span></span><span class="bv-panel-total">${cash(sums[i])}</span></div>${rows.map(r=>`<div class="bv-row"><div class="bv-row-info"><div class="bv-row-name">${esc(r.name)}</div><div class="bv-row-meta">${esc(r.meta)}${r.ref?' · Ref: '+esc(r.ref):''}</div><span class="bd-basis">${r.shared?(c==='Hotels'?'Shared · total stay':'Shared total'):'Per person'}</span><span class="bv-row-sub">Entered: ${r.amount===null?'No price yet':cash(r.amount)}${r.shared&&pp?' ÷ '+m.travellers:!r.shared&&!pp?' × '+m.travellers:''}</span></div><div class="bv-row-right"><div class="bv-row-cost">${r.amount===null?'—':cash(r.display)}</div><div class="bv-row-sub">${suffix}</div></div></div>`).join('')||'<div class="bd-car-static">No costs entered</div>'}</section>`}).join('')}</div></div><div class="bv-footer">Hotel amounts cover the entire stay and are shared, along with car hire and fuel. Flights, attractions and other transport are entered per person. Missing prices are excluded. </div>`;
 if(!readOnly){const panel=[...root.querySelectorAll('.bv-panel')].find(p=>p.querySelector('.bv-panel-title').textContent.startsWith('Car Hire'));if(panel){const fields=document.createElement('div');fields.className='bd-car-inputs';fields.innerHTML=['carHireCost','fuelCost'].map((key,i)=>'<label class="bd-car-field"><span class="bd-car-field-label">'+(i?'Fuel · shared total':'Rental override · shared total')+'</span><span class="bd-money-input"><span>£</span><input type="number" min="0" step="0.01" data-cost="'+key+'" value="'+esc(STATE.meta?.budget?.[key]??'')+'" placeholder="0.00"></span><span class="bd-car-help">'+(i?'Added once to the shared total.':'Leave blank to use car hire bookings.')+'</span></label>').join('');panel.appendChild(fields);fields.querySelectorAll('input').forEach(input=>input.onchange=()=>{if(input.value!==''&&(!Number.isFinite(Number(input.value))||Number(input.value)<0))return;STATE.meta.budget=STATE.meta.budget||{};if(input.value==='')delete STATE.meta.budget[input.dataset.cost];else STATE.meta.budget[input.dataset.cost]=Number(input.value);scheduleSave();render()});}}
 root.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{filter=b.dataset.category;render()});
 root.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{if(readOnly){renderWithMode(b.dataset.mode);return;}STATE.meta.budget=STATE.meta.budget||{};STATE.meta.budget.displayMode=b.dataset.mode;scheduleSave();render()});
 root.querySelector('#bd-travellers').onchange=e=>{const n=Number(e.target.value);if(!Number.isInteger(n)||n<1||n>100){e.target.value=m.travellers;return;}STATE.meta.trav=String(n);scheduleSave();render()};
}
function renderWithMode(mode){const old=STATE.meta;STATE.meta={...old,budget:{...old?.budget,displayMode:mode}};try{render()}finally{STATE.meta=old}}
function install(){if(typeof window.renderBudgetView!=='function'){setTimeout(install,50);return;}window.renderBudgetView=render;if(document.getElementById('budget-main')?.children.length)render();}
const style=document.createElement('style');style.textContent=`
#view-budget,#budget-main{background:#e9e9e9}
#budget-main{--ink:#17252b;--muted:#75858d;--line:#e8ecee;--teal:#3d7c8b;padding:22px 24px 28px;box-sizing:border-box}
#budget-main *,#budget-main *:before,#budget-main *:after{box-sizing:border-box}
#budget-main .bd-toolbar{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-bottom:16px}
#budget-main .bd-toolbar h2{font-size:18px;line-height:1.3;color:var(--ink);margin:0;font-weight:800}
#budget-main .bd-toolbar p{font-size:11px;color:#6b7c84;margin:4px 0 0}
#budget-main .bd-controls{display:flex;flex-wrap:wrap;gap:14px;align-items:center}
#budget-main .bd-toggle{display:flex;background:#dfe4e5;border:1px solid #d5dddf;border-radius:999px;padding:3px}
#budget-main .bd-toggle button{font-family:inherit;font-weight:700;font-size:11px;border:0;cursor:pointer;background:transparent;border-radius:999px;color:#5b6c74;min-height:34px;padding:7px 13px}
#budget-main .bd-toggle button[aria-pressed=true]{background:#fff;color:var(--teal);box-shadow:0 1px 4px #253f4614}
#budget-main .bd-controls label{display:flex;gap:8px;align-items:center;font-size:10.5px;font-weight:600;color:#63757e}
#budget-main .bd-controls input{width:54px;min-height:36px;padding:7px 8px;border:1px solid #d5dddf;border-radius:9px;background:#fff;color:var(--ink);font-family:inherit;font-size:12px;font-weight:700;line-height:1.2}
#budget-main .bd-overview{display:grid;grid-template-columns:minmax(230px,.8fr) minmax(390px,1.5fr);gap:22px;align-items:center;background:#fff;border:1px solid #e1e6e8;border-radius:14px;padding:18px 22px;box-shadow:none}
#budget-main .bd-kicker{font-size:9px;font-weight:800;letter-spacing:.065em;text-transform:uppercase;color:#71828b;line-height:1.5}
#budget-main .bd-main-total{font-size:32px;font-weight:800;line-height:1.15;letter-spacing:-.035em;color:var(--teal);margin:7px 0}
#budget-main .bd-caption{font-size:10.5px;color:#809099;line-height:1.4}
#budget-main .bd-secondary-totals{display:flex;gap:24px;margin-top:18px;padding-top:14px;border-top:1px solid var(--line)}
#budget-main .bd-secondary-totals>div{display:flex;flex-direction:column;gap:5px}
#budget-main .bd-secondary-totals span{font-size:9px;color:#7e8e96;line-height:1.3}
#budget-main .bd-secondary-totals strong{font-size:14px;color:#344b55}
#budget-main .bd-chart-area{display:grid;grid-template-columns:170px minmax(0,1fr);gap:20px;align-items:center;border-left:1px solid var(--line);padding-left:22px}
#budget-main .bd-donut{position:relative;width:170px;max-width:100%;aspect-ratio:1}
#budget-main .bd-donut svg{display:block;width:100%;height:100%}
#budget-main .bd-donut-label{position:absolute;inset:0;display:flex;flex-direction:column;gap:5px;align-items:center;justify-content:center;pointer-events:none}
#budget-main .bd-donut-label strong{font-size:13px;color:#344b55}
#budget-main .bd-donut-label span{font-size:9px;color:#8a98a0}
#budget-main .bd-legend{min-width:0}
#budget-main .bd-legend-row{display:grid;grid-template-columns:8px minmax(0,1fr) 30px auto;gap:8px;align-items:center;min-height:32px;border-bottom:1px solid #f0f2f3;font-size:11px}
#budget-main .bd-dot{display:inline-block;width:7px;height:7px;border-radius:50%}
#budget-main .bd-legend-name{color:#526772;font-weight:600}
#budget-main .bd-legend-pct{font-size:9px;color:#86959c;text-align:right;font-variant-numeric:tabular-nums}
#budget-main .bd-legend-row strong{color:#344b55;text-align:right;white-space:nowrap;font-size:11px;font-variant-numeric:tabular-nums}
#budget-main .bd-legend-total{display:flex;justify-content:space-between;gap:8px;margin-top:9px;font-size:11px;font-weight:800;color:#344b55}
#budget-main .bd-filters{display:flex;gap:8px;flex-wrap:wrap;padding:20px 0 17px}
#budget-main .bd-filters button{display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:7px 13px 7px 9px;border:1px solid var(--pill-color);border-radius:999px;background:#fff;color:var(--pill-color);font-family:inherit;font-size:11px;font-weight:700;line-height:1.2;cursor:pointer}
#budget-main .bd-filters button[aria-pressed=true]{background:var(--pill-color);color:#fff}
#budget-main .bd-filter-icon{display:flex;align-items:center;justify-content:center;width:25px;height:25px;border-radius:50%;background:#edf1f2}
#budget-main .bd-filters button[aria-pressed=true] .bd-filter-icon{background:#ffffff26}
#budget-main .bd-filter-icon svg{width:14px;height:14px}
#budget-main .bv-breakdown{padding:0}
#budget-main .bv-breakdown-title{font-size:9px;font-weight:800;letter-spacing:.065em;color:#7a8a92;text-transform:uppercase;margin:0 0 10px}
#budget-main .bv-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px;align-items:start}
#budget-main .bv-panel{min-width:0;overflow:hidden;background:#fff;border:1px solid #e1e6e8;border-radius:13px;box-shadow:none}
#budget-main .bv-panel:before{display:none}
#budget-main .bv-panel-head{display:flex;justify-content:space-between;gap:12px;align-items:center;border-bottom:1px solid var(--line);padding:12px 14px;min-height:53px;background:#fff}
#budget-main .bv-panel-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;font-size:12px;font-weight:800;color:#263f49;letter-spacing:0;text-transform:none}
#budget-main .bd-section-icon{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:#f0f4f5;color:var(--accent)}
#budget-main .bd-section-icon svg{width:16px;height:16px}
#budget-main .bv-panel-subcount{font-size:9px;font-weight:500;color:#91a0a7;margin:0}
#budget-main .bv-panel-total{color:var(--accent);font-size:13px;font-weight:800;white-space:nowrap;background:#f0f4f5;border-radius:999px;padding:5px 8px}
#budget-main .bv-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;min-height:66px;padding:11px 14px;border-bottom:1px solid var(--line)}
#budget-main .bv-row:last-child{border-bottom:0}
#budget-main .bv-row-info{min-width:0}
#budget-main .bv-row-name{font-size:12px;line-height:1.4;font-weight:700;color:#233a44;overflow-wrap:anywhere}
#budget-main .bv-row-meta{margin-top:3px;font-size:10px;line-height:1.4;color:#8c9ba2;overflow-wrap:anywhere}
#budget-main .bd-basis{display:inline-block;padding:3px 6px;background:#eef3f4;color:#55717e;font-size:8px;line-height:1.3;border-radius:5px;margin:5px 5px 0 0;font-weight:600}
#budget-main .bv-row-sub{font-size:9px;color:#8e9da5;line-height:1.4;margin-top:3px}
#budget-main .bv-row-right{text-align:right;min-width:70px}
#budget-main .bv-row-cost{font-size:12px;font-weight:800;color:#344b55;white-space:nowrap}
#budget-main .bd-car-static{padding:14px;color:#95a2a8;font-size:11px}
#budget-main .bd-car-inputs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:13px 14px;border-top:1px solid var(--line)}
#budget-main .bd-car-field{min-width:0}
#budget-main .bd-car-field-label{display:block;font-size:9px;color:#6d818c;margin-bottom:6px;font-weight:700}
#budget-main .bd-money-input{display:flex;align-items:center;gap:5px;border:1px solid #dce3e6;border-radius:8px;padding-left:10px;color:var(--accent);font-size:12px}
#budget-main .bd-money-input input{min-width:0;width:100%;padding:9px 5px 9px 0;background:transparent;border:0;color:#344b55;font:inherit}
#budget-main .bd-car-help{display:block;font-size:9px;line-height:1.5;color:#93a1a8;margin-top:5px}
#budget-main .bv-footer{margin:14px 0 0;background:transparent;padding:0;border:0;font-size:10px;color:#85959e;line-height:1.6}
#budget-main button:focus-visible,#budget-main input:focus-visible{outline:2px solid #3d7c8b;outline-offset:3px}
@media(max-width:1100px){#budget-main .bd-overview{gap:16px;grid-template-columns:minmax(195px,.75fr) minmax(320px,1.5fr);padding:16px}#budget-main .bd-chart-area{grid-template-columns:140px minmax(0,1fr);gap:12px;padding-left:16px}#budget-main .bd-donut{width:140px}}
@media(max-width:820px){#budget-main{padding:18px 14px 24px}#budget-main .bd-toolbar{align-items:flex-start;flex-wrap:wrap;gap:12px}#budget-main .bv-grid{grid-template-columns:1fr}#budget-main .bd-overview{grid-template-columns:1fr;gap:16px}#budget-main .bd-quick-totals{display:grid;grid-template-columns:1fr 1fr;column-gap:20px}#budget-main .bd-quick-totals>.bd-kicker,#budget-main .bd-main-total,#budget-main .bd-caption{grid-column:1}#budget-main .bd-secondary-totals{grid-column:2;grid-row:1/4;border:0;padding:0;margin:0;justify-content:flex-end;align-items:center;gap:16px}#budget-main .bd-chart-area{border-left:0;border-top:1px solid var(--line);padding:14px 0 0;grid-template-columns:145px minmax(0,1fr)}#budget-main .bd-donut{width:145px}}
@media(max-width:480px){#budget-main{padding:15px 10px 24px}#budget-main .bd-toolbar h2{font-size:16px}#budget-main .bd-toolbar p{display:none}#budget-main .bd-controls{gap:9px;justify-content:space-between;width:100%}#budget-main .bd-toggle button{font-size:10px;padding:7px 10px}#budget-main .bd-overview{padding:14px;gap:12px}#budget-main .bd-main-total{font-size:27px}#budget-main .bd-secondary-totals{flex-direction:column;align-items:flex-end;justify-content:center;gap:10px;text-align:right}#budget-main .bd-secondary-totals>div{gap:3px}#budget-main .bd-secondary-totals strong{font-size:12px}#budget-main .bd-chart-area{grid-template-columns:105px minmax(0,1fr);gap:12px}#budget-main .bd-donut{width:105px}#budget-main .bd-donut-label strong{font-size:10px}#budget-main .bd-donut-label span{font-size:8px}#budget-main .bd-legend-row{grid-template-columns:6px minmax(0,1fr) auto;gap:6px;font-size:10px;min-height:31px}#budget-main .bd-legend-pct{display:none}#budget-main .bd-legend-row strong{font-size:10px}#budget-main .bd-kicker{font-size:8px}#budget-main .bd-legend-name{font-size:9px}#budget-main .bd-filters{flex-wrap:nowrap;overflow-x:auto;padding:16px 0 12px;scrollbar-width:thin}#budget-main .bd-filters button{flex-shrink:0;white-space:nowrap}#budget-main .bv-panel-title{font-size:11px}#budget-main .bv-row{padding:10px 12px;gap:8px}#budget-main .bv-row-name{font-size:11px}#budget-main .bd-car-inputs{grid-template-columns:1fr}}
@media(max-width:360px){#budget-main .bd-chart-area{grid-template-columns:1fr}#budget-main .bd-donut{width:115px;justify-self:center}#budget-main .bd-legend-name{font-size:10px}}
@media print{#budget-main .bd-controls,#budget-main .bd-filters{display:none}#budget-main .bd-overview{break-inside:avoid}#budget-main .bv-panel{break-inside:avoid}}
`;
document.head.appendChild(style);install();})();
