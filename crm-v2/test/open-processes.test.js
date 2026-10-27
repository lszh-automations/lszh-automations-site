'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {openProcesses,cockpitSummary}=require('../cockpit-summary');
const day='2026-10-27';
const base=()=>({leads:[],kunden:[{id:'k',company:'Kunde'}],offerten:[],rechnungen:[],projekte:[]});
test('complete worklist retains every nonterminal stage, absent dates and future dates without a preview cap',async()=>{
 const d=base();
 d.leads=Array.from({length:235},(_,i)=>({id:'l'+i,status:['Neu','Kontaktiert','Qualifiziert'][i%3],followUpDate:i%2?'2027-01-01':'',company:'Firma '+i}));
 d.offerten=['Entwurf','Bereit','Versendet'].map(status=>({id:status,status}));
 d.rechnungen=['Entwurf','Offen','Teilbezahlt'].map(status=>({id:status,status,amountCHF:100,dueDate:'2027-02-01',invoiceDispatchState:'confirmed'}));
 d.projekte=['Geplant','In Arbeit','Wartet auf Kunde'].map(status=>({id:status,status}));
 const s=await cockpitSummary({async *scan(t){yield* d[t];}},{today:day});
 assert.equal(s.openProcessCount,244);assert.equal(s.openProcesses.length,244);
 assert.equal(s.openProcesses.filter(x=>x.table==='leads').length,235);
 assert.ok(s.openProcesses.every(x=>x.action));
 assert.ok(s.openProcesses.some(x=>x.date==='2027-01-01'));
});
test('completed records leave the worklist only after accepted offers have their handover links',()=>{
 const d=base();d.leads=[{id:'won',status:'Gewonnen'},{id:'lost',status:'Verloren'}];
 d.offerten=[{id:'accepted',status:'Angenommen',customerId:'k',oneTimeCHF:100},{id:'declined',status:'Abgelehnt'},{id:'monthly',status:'Angenommen',customerId:'k',monthlyCHF:100}];
 d.projekte=[{id:'p',offerId:'accepted',status:'Abgeschlossen'},{id:'pm',offerId:'monthly',status:'Abgeschlossen'}];
 d.rechnungen=[{id:'i',projectId:'p',customerId:'k',status:'Bezahlt'},{id:'cancelled',status:'Storniert'}];
 assert.deepEqual(openProcesses(d,day),[]);
 d.rechnungen=[];assert.match(openProcesses(d,day)[0].action,/Rechnungsentwurf/);
 d.projekte=[];assert.equal(openProcesses(d,day).length,2);assert.match(openProcesses(d,day)[0].action,/Auftragsübernahme/);
});
test('customer acceptance, internal confirmation and adoption are distinct single rows',()=>{
 const d=base();d.offerten=['customer_response_recorded','awaiting_lszh_confirmation','confirmed'].map(state=>({id:state,status:'Versendet',onlineAcceptance:{state},followUpDate:'2026-01-01'}));
 const rows=openProcesses(d,day);assert.equal(rows.length,3);
 assert.equal(rows.filter(x=>x.pending).length,2);
 assert.match(rows.find(x=>x.id==='confirmed').action,/übernehmen/);
 assert.equal(new Set(rows.map(x=>x.id)).size,3);
 assert.ok(rows.every(x=>!x.action.includes('nachfassen')));
});
test('unresolved deliveries stay visible even after payment or rejection, with priority over due work',()=>{
 const d=base();d.offerten=[{id:'rejected',status:'Abgelehnt',offerDispatchState:'manual_review'}];
 d.rechnungen=[{id:'paid',status:'Bezahlt',reminderDispatch:{state:'manual_review'}},{id:'sending',status:'Offen',invoiceDispatchState:'sending'},{id:'due',status:'Offen',invoiceDispatchState:'confirmed',amountCHF:5,dueDate:'2026-01-01'}];
 const rows=openProcesses(d,day);assert.equal(rows.length,4);assert.ok(rows.slice(0,3).every(x=>x.priority===0));assert.equal(rows[3].id,'due');
 d.rechnungen[0].reminderDispatch.state='confirmed';assert.ok(!openProcesses(d,day).some(x=>x.id==='paid'));
});
test('project work points to customer Make invitation, waiting, next existing task or completion',()=>{
 const d=base();d.projekte=[{id:'make',status:'Geplant',customerId:'k',onboarding:{makeRequired:true}},{id:'wait',status:'Wartet auf Kunde',startedAt:'2026-10-01'}, {id:'task',status:'In Arbeit',startedAt:'2026-10-01',tasks:[{title:'Erster',done:true},{title:'Zweiter',done:false}]},{id:'finish',status:'In Arbeit',startedAt:'2026-10-01',tasks:[{title:'Fertig',done:true}]}];
 const rows=openProcesses(d,day),action=id=>rows.find(x=>x.id===id).action;
 assert.match(action('make'),/kundeneigene Make/);assert.match(action('wait'),/Kundenrückmeldung/);assert.match(action('task'),/Zweiter/);assert.match(action('finish'),/abnehmen/);
});
test('missing and unknown states are visible, invalid dates never silently close or prioritize work',()=>{
 const d=base();for(const t of ['leads','offerten','rechnungen','projekte'])d[t]=[{id:t,status:'Unbekannt',dueDate:'2026-02-30'}];
 const rows=openProcesses(d,day);assert.equal(rows.length,4);assert.ok(rows.every(x=>x.priority===0&&x.date===''));
});
test('projection neither changes records nor returns personal email, payment history or contract documents',()=>{
 const d=base();d.leads=[{id:'l',status:'Kontaktiert',email:'private@example.invalid',contactHistory:[{note:'Privat'}]}];d.rechnungen=[{id:'i',status:'Teilbezahlt',amountCHF:10,invoiceDispatchState:'confirmed',dueDate:'2026-10-20',paymentHistory:[{amountCHF:4}],pdfBase64:'private'}];
 const before=JSON.stringify(d),rows=openProcesses(d,day);assert.equal(JSON.stringify(d),before);
 assert.doesNotMatch(JSON.stringify(rows),/private|contactHistory|paymentHistory|pdfBase64/);
 assert.match(rows.find(x=>x.id==='i').action,/bei Bedarf erinnern/);
});
