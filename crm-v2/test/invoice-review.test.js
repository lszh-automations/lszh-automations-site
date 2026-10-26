 'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{invoiceReadiness}=require('../invoice-pricing');
const customer={id:'c',company:'TEST_ONLY GmbH',email:'test@example.invalid',street:'Testweg 1',postalCode:'5610',city:'Wohlen',country:'CH'},project={id:'p',customerId:'c'};
const invoice={id:'i',number:'RE-1101',customerId:'c',projectId:'p',description:'TEST_ONLY Setup',invoiceDate:'2026-10-26',dueDate:'2026-11-10',status:'Offen',amountCHF:100,items:[{title:'Setup',qty:1,unitPriceCHF:100}]};
test('invoice readiness distinguishes complete draft, incomplete invoice and deliberate send readiness',()=>{
 const complete=invoiceReadiness(invoice,customer,project);assert.equal(complete.canSend,true);assert.deepEqual(complete.missing,[]);assert.equal(complete.delivery,'Nicht versendet');
 const draft=invoiceReadiness({...invoice,status:'Entwurf'},customer,project);assert.equal(draft.dataReady,true);assert.equal(draft.canSend,false);assert.equal(draft.stage,'Entwurf prüfen');
 const missing=invoiceReadiness({...invoice,dueDate:'2026-02-30'}, {...customer,street:'Testweg'},project);assert.equal(missing.canSend,false);assert.ok(missing.missing.includes('Gültige Fälligkeit'));assert.ok(missing.missing.some(x=>x.includes('Hausnummer')));
 assert.ok(invoiceReadiness({...invoice,amountCHF:101},customer,project).missing.some(x=>x.includes('Gesamtbetrag')));
 assert.ok(invoiceReadiness(invoice,customer,{...project,customerId:'other'}).missing.some(x=>x.includes('demselben Kunden')));
});
test('delivery, payments and uncertain dispatch remain separate and cannot authorize another send',()=>{
 const uncertain=invoiceReadiness({...invoice,invoiceDispatchState:'manual_review'},customer,project);assert.equal(uncertain.stage,'Versand prüfen');assert.equal(uncertain.canSend,false);
 const sent=invoiceReadiness({...invoice,invoiceDispatchState:'confirmed',invoiceSentAt:'2026-10-26T10:00:00Z'},customer,project);assert.equal(sent.delivery,'Versendet');assert.equal(sent.paymentStatus,'Offen');assert.equal(sent.remainingCHF,100);assert.equal(sent.canSend,false);
 const partial=invoiceReadiness({...invoice,status:'Teilbezahlt',invoiceDispatchState:'confirmed',paymentHistory:[{amountCHF:40}]},customer,project);assert.equal(partial.stage,'Teilbezahlt');assert.equal(partial.remainingCHF,60);
 assert.equal(invoiceReadiness({...invoice,status:'Bezahlt'},customer,project).remainingCHF,0);
 assert.equal(invoiceReadiness({...invoice,status:'Storniert'},customer,project).canSend,false);
});
