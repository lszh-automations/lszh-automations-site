 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {personalTasks,cockpitSummary}=require('../cockpit-summary');
const today='2026-10-27',now=Date.parse(today+'T12:00:00Z');
const base=()=>({leads:[],offerten:[],kunden:[{id:'k',company:'Firma'}],projekte:[],rechnungen:[]});
const tasks=d=>personalTasks(d,today,undefined,now),ids=d=>tasks(d).map(x=>x.id);
test('only new inquiries, due explicit lead work and unconverted qualified leads require action',()=>{
 const d=base();d.leads=[{id:'new',status:'Neu'},{id:'wait',status:'Kontaktiert'},{id:'undated',status:'Kontaktiert',nextAction:'Unterlagen senden'},{id:'future',status:'Qualifiziert',nextAction:'Anrufen',followUpDate:'2026-10-28'},{id:'due',status:'Kontaktiert',nextAction:'Rückruf',followUpDate:today},{id:'converted',status:'Qualifiziert'},{id:'won',status:'Gewonnen'}];d.offerten=[{id:'sent',leadId:'converted',status:'Versendet'}];assert.deepEqual(ids(d),['due','new','undated']);assert.equal(tasks(d)[0].action,'Rückruf');
});
test('offer acceptance replaces followup and closed upstream records do not hide invoice work',()=>{
 const d=base();d.offerten=[{id:'o',status:'Versendet',followUpDate:'2026-10-20',onlineAcceptance:{state:'customer_response_recorded'}}];assert.equal(tasks(d).length,1);assert.match(tasks(d)[0].action,/Kundenannahme/);
 d.offerten[0]={id:'o',customerId:'k',status:'Angenommen',oneTimeCHF:100};d.projekte=[{id:'p',offerId:'o',customerId:'k',status:'Abgeschlossen'}];d.rechnungen=[{id:'i',offerId:'o',status:'Entwurf'}];assert.deepEqual(ids(d),['i']);d.rechnungen[0].status='Bezahlt';assert.deepEqual(ids(d),[]);
});
test('sent offers appear only when due, drafts and ready offers remain concrete actions',()=>{
 const d=base();d.offerten=[{id:'wait',status:'Versendet'},{id:'future',status:'Versendet',followUpDate:'2026-10-28'},{id:'due',status:'Versendet',followUpDate:today},{id:'draft',status:'Entwurf'},{id:'ready',status:'Bereit'},{id:'no',status:'Abgelehnt'}];assert.deepEqual(new Set(ids(d)),new Set(['due','draft','ready']));assert.match(tasks(d).find(t=>t.id==='due').action,/nachfassen/);
});
test('sent invoices wait until overdue; paid and cancelled invoices disappear; draft and missing dispatch remain',()=>{
 const d=base();d.rechnungen=[{id:'today',status:'Offen',invoiceDispatchState:'confirmed',amountCHF:10,dueDate:today},{id:'future',status:'Teilbezahlt',invoiceDispatchState:'confirmed',amountCHF:10,dueDate:'2026-10-28'},{id:'overdue',status:'Offen',invoiceDispatchState:'confirmed',amountCHF:10,dueDate:'2026-10-26'},{id:'draft',status:'Entwurf'},{id:'unsent',status:'Offen',amountCHF:10},{id:'paid',status:'Bezahlt'},{id:'cancel',status:'Storniert'}];assert.deepEqual(ids(d),['overdue','unsent','draft']);
});
test('seven full days cooldown hides reminder task, then personal followup after final reminder',()=>{
 const d=base();d.rechnungen=[{id:'i',status:'Offen',invoiceDispatchState:'confirmed',amountCHF:10,dueDate:'2026-10-01',reminderHistory:[{at:'2026-10-20T12:00:01Z'}]}];assert.deepEqual(ids(d),[]);d.rechnungen[0].reminderHistory[0].at='2026-10-20T12:00:00Z';assert.equal(tasks(d).length,1);d.rechnungen[0].reminderHistory=Array.from({length:3},()=>({at:'2026-10-20T12:00:00Z'}));assert.match(tasks(d)[0].action,/persönlich/);
});
test('fresh sending is hidden, stale or uncertain delivery demands review even on paid records',()=>{
 const d=base();d.rechnungen=[{id:'i',status:'Bezahlt',reminderDispatch:{state:'sending',claimedAt:'2026-10-27T11:55:01Z'}}];assert.deepEqual(ids(d),[]);d.rechnungen[0].reminderDispatch.claimedAt='2026-10-27T11:55:00Z';assert.match(tasks(d)[0].action,/Postfach/);d.rechnungen[0].reminderDispatch.state='manual_review';assert.equal(tasks(d).length,1);
 d.offerten=[{id:'o',status:'Bereit',offerDispatchState:'sending',offerDispatchRequestedAt:'2026-10-27T11:59:00Z'}];assert.ok(!ids(d).includes('o'));
});
test('project status alone creates no task; explicit work, completed checklists and due customer followup do',()=>{
 const d=base();d.projekte=[{id:'wait',status:'Wartet auf Kunde'},{id:'later',status:'Wartet auf Kunde',dueDate:'2026-10-28'},{id:'due',status:'Wartet auf Kunde',dueDate:'2026-10-26'},{id:'undefined',status:'In Arbeit'},{id:'work',status:'In Arbeit',tasks:[{title:'Erledigt',done:true},{title:'Webhook prüfen',done:false}]},{id:'finish',status:'In Arbeit',tasks:[{title:'Erledigt',done:true}]},{id:'done',status:'Abgeschlossen',tasks:[{title:'Alt',done:false}]}];assert.deepEqual(new Set(ids(d)),new Set(['due','work','finish']));assert.equal(tasks(d).find(t=>t.id==='work').action,'Webhook prüfen');
});
test('scheduled project start waits only after all preparation including actual implementation steps',()=>{
 const d=base();d.projekte=[{id:'p',status:'Geplant',customerId:'k',owner:'Lars',startDate:'2026-10-28',onboarding:{makeRequired:false,accessConfirmed:true},tasks:[{title:'Umsetzen',done:false}]}];assert.deepEqual(ids(d),[]);d.projekte[0].startDate=today;assert.equal(tasks(d)[0].action,'Projektstart bestätigen');d.projekte[0].tasks=[];assert.equal(tasks(d)[0].action,'Mindestens einen Umsetzungsschritt festlegen');
});
test('complete scan includes all tasks beyond first register page and never mutates inputs',async()=>{
 const d=base();d.leads=Array.from({length:235},(_,i)=>({id:'l'+i,status:'Neu',company:'Firma'}));const before=JSON.stringify(d);const summary=await cockpitSummary({async *scan(t){yield* d[t];}},{today,nowMs:now});assert.equal(summary.personalTasks.length,235);assert.equal(summary.tasksAsOf,new Date(now).toISOString());assert.equal(JSON.stringify(d),before);
});

test('project task uses the actual start prerequisites, including date and owner before confirming start',()=>{
 const d=base();const p={id:'p',status:'Geplant',customerId:'k',onboarding:{makeRequired:true,invitationConfirmed:true,accessConfirmed:true},tasks:[{title:'Einrichten',done:false}]};d.projekte=[p];
 assert.equal(tasks(d)[0].action,'Gültiges Startdatum festlegen');p.startDate='2026-10-28';assert.equal(tasks(d)[0].action,'Verantwortliche Person eintragen');p.owner='Lars';assert.deepEqual(ids(d),[]);p.startDate=today;assert.equal(tasks(d)[0].action,'Projektstart bestätigen');
});
