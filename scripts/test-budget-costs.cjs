const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('budget-live-redesign.js','utf8');
const ctx={window:{renderBudgetView(){}},document:{createElement:()=>({}),head:{appendChild(){}},getElementById:()=>null},setTimeout(){}};vm.createContext(ctx);vm.runInContext(source,ctx);
const hotel={name:'Four night stay',nightly:'£640',nights:4,checkin:'01/04/2026',checkout:'05/04/2026'};
const flight={type:'move',_id:'flight',title:'Flight',kicker:'Flight',booking:{price:'100 pp'}};
const attraction={type:'attraction',visitGroupId:'visit',title:'Ticket',booking:{price:'125'}};
const car={type:'move',_id:'car',transport:{mode:'Car Hire / Road Trip',hire:{company:'Rental',costs:{total:200,hire:200}}},booking:{price:200}};
const state={meta:{hotels:[hotel,{...hotel}]},days:[{date:'2026-04-01',items:[flight,attraction,car,{type:'move',title:'Train',booking:{price:'12.50'}}]},{date:'2026-04-02',items:[{...attraction}]}]};
const before=JSON.stringify(state),m=ctx.window.BudgetCosts.model(state);assert.equal(m.travellers,2);assert.equal(m.total,131500);assert.equal(m.rows.length,5);assert.equal(m.rows.find(r=>r.category==='Hotels').party,64000);assert.equal(JSON.stringify(state),before);
state.meta.trav='3';assert.equal(ctx.window.BudgetCosts.model(state).total,155250);
state.meta.budget={carHireCost:150,fuelCost:40,displayMode:'person'};const n=ctx.window.BudgetCosts.model(state);assert.equal(n.total,154250);assert.equal(n.rows.filter(r=>r.category==='Car Hire').reduce((s,r)=>s+r.party,0),19000);
assert.equal(ctx.window.BudgetCosts.model(JSON.parse(JSON.stringify(state))).total,n.total);
for(const travellers of [1,2,3,7]){state.meta.trav=travellers;const r=ctx.window.BudgetCosts.model(state);let sum=0,prev=0;const rows=r.rows.map(x=>{sum+=x.party;const next=Math.round(sum/travellers),v=next-prev;prev=next;return v});assert.equal(rows.reduce((a,b)=>a+b,0),Math.round(r.total/travellers));}
console.log('Budget regression checks passed: stay totals, per-person costs, linked duplicates, car override, travellers, data immutability, reload and penny reconciliation.');
