'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {processGroups}=require('../cockpit-summary');
const today='2026-10-27',now=Date.parse(today+'T12:00:00Z');
const base=()=>({leads:[],kunden:[{id:'k',company:'Firma'}],offerten:[],projekte:[],rechnungen:[]});
const groups=d=>processGroups(d,today,undefined,now);
test('lead is superseded by its offer; project and invoices stay in one order with simultaneous work and waiting',()=>{
 const d=base();d.leads=[{id:'l',status:'Qualifiziert'}];d.offerten=[{id:'o',number:1007,leadId:'l',customerId:'k',status:'Angenommen',oneTimeCHF:10}];d.projekte=[{id:'p',offerId:'o',customerId:'k',status:'Geplant'}];d.rechnungen=[{id:'draft',projectId:'p',customerId:'k',status:'Entwurf'},{id:'sent',projectId:'p',customerId:'k',status:'Offen',amountCHF:10,invoiceDispatchState:'confirmed',dueDate:'2026-11-06'}];
 const result=groups(d);assert.equal(result.length,1);assert.equal(result[0].reference,'Auftrag 1007');assert.equal(result[0].mode,'action');assert.equal(result[0].steps.length,3);assert.ok(!result[0].steps.some(s=>s.table==='leads'));assert.equal(result[0].steps.find(s=>s.id==='sent').mode,'waiting');
});
test('future sent offer is waiting and becomes actionable only when its followup is due',()=>{
 const d=base();d.leads=[{id:'l',status:'Qualifiziert'}];d.offerten=[{id:'o',leadId:'l',status:'Versendet',followUpDate:'2026-10-30'}];assert.equal(groups(d)[0].mode,'waiting');d.offerten[0].followUpDate=today;assert.equal(groups(d)[0].mode,'action');assert.match(groups(d)[0].primary.action,/nachfassen/);
});
test('same customer or same lead never merges distinct orders; only exact consistent links bundle invoices',()=>{
 const d=base();d.offerten=[{id:'o1',status:'Angenommen',customerId:'k',number:1001},{id:'o2',status:'Angenommen',customerId:'k',number:1002}];d.projekte=[{id:'p1',offerId:'o1',customerId:'k',status:'Geplant'},{id:'p2',offerId:'o2',customerId:'k',status:'Geplant'}];d.rechnungen=[{id:'bad',offerId:'o1',projectId:'p2',customerId:'k',status:'Entwurf'}];const rows=groups(d);assert.equal(rows.length,3);assert.ok(rows.some(g=>g.id==='rechnungen:bad'));
 d.rechnungen[0]={id:'wrongCustomer',projectId:'p1',customerId:'other',status:'Entwurf'};assert.equal(groups(d).length,3);
});
test('completed upstream states do not close unpaid billing, and paid billing does not close project work',()=>{
 const d=base();d.offerten=[{id:'o',status:'Angenommen',customerId:'k'}];d.projekte=[{id:'p',offerId:'o',customerId:'k',status:'Abgeschlossen'}];d.rechnungen=[{id:'i',projectId:'p',customerId:'k',status:'Offen',invoiceDispatchState:'confirmed',amountCHF:10,dueDate:'2026-11-06'}];assert.equal(groups(d)[0].mode,'waiting');d.rechnungen[0].status='Bezahlt';assert.equal(groups(d).length,0);d.projekte[0].status='In Arbeit';assert.equal(groups(d)[0].mode,'action');
});
test('uncertain delivery remains a check even after payment; reminder cooldown is waiting until full seven days',()=>{
 const d=base();d.rechnungen=[{id:'i',status:'Bezahlt',reminderDispatch:{state:'manual_review'}}];assert.equal(groups(d)[0].mode,'check');d.rechnungen[0]={id:'i',status:'Offen',invoiceDispatchState:'confirmed',amountCHF:10,dueDate:'2026-10-01',reminderHistory:[{at:'2026-10-23T12:00:00Z'}]};assert.equal(groups(d)[0].mode,'waiting');d.rechnungen[0].reminderHistory[0].at='2026-10-20T12:00:00Z';assert.equal(groups(d)[0].mode,'action');
});
test('explicit lead actions are retained and multiple offers on one lead are separate flows',()=>{
 const d=base();d.leads=[{id:'l',status:'Qualifiziert',nextAction:'Rückruf',followUpDate:today}];d.offerten=[{id:'o1',leadId:'l',status:'Versendet'},{id:'o2',leadId:'l',status:'Entwurf'}];assert.equal(groups(d).length,3);d.leads[0].nextAction='';assert.equal(groups(d).length,2);
});
test('complete scan results have no group cap or mutation',()=>{
 const d=base();d.leads=Array.from({length:235},(_,i)=>({id:'l'+i,status:'Neu',company:'Firma'}));const before=JSON.stringify(d);assert.equal(groups(d).length,235);assert.equal(JSON.stringify(d),before);
});
