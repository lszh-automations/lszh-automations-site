'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {reminderPreview,createReminderSender}=require('../invoice-reminder');
const invoice={number:'RE-1101',customerId:'c',description:'TEST_ONLY',status:'Teilbezahlt',invoiceDispatchState:'confirmed',amountCHF:199.95,dueDate:'2026-10-20',invoiceDate:'2026-10-01',items:[{title:'Setup',qty:1,unitPriceCHF:199.95}],paymentHistory:[{amountCHF:50}]},customer={company:'TEST_ONLY Example',email:'test@example.invalid',street:'Testweg 1',postalCode:'8000',city:'Zürich',country:'CH',contactName:'<script>test</script>'},at='2026-10-27T12:00:00Z';
test('reminder preview uses exact remaining CHF, escaped customer text, original-invoice notice and existing gateway subject',()=>{
 const p=reminderPreview(invoice,customer,at);assert.equal(p.amountCHF,149.95);assert.equal(p.kind,'Zahlungserinnerung');assert.match(p.subject,/Ihre Rechnung Nr\./);assert.match(p.text,/ursprüngliche Rechnung/);assert.match(p.html,/&lt;script&gt;/);assert.doesNotMatch(p.html,/<script>/);assert.match(p.sha256,/^[a-f0-9]{64}$/);
});
test('all three stages enforce overdue balance, exact seven-day boundary and no fourth stage',()=>{
 const first={kind:'Zahlungserinnerung',at:'2026-10-20T12:00:00Z'};
 assert.equal(reminderPreview({...invoice,reminderHistory:[first]},customer,at).kind,'1. Mahnung');
 assert.throws(()=>reminderPreview({...invoice,reminderHistory:[{...first,at:'2026-10-20T12:00:00.001Z'}]},customer,at),/sieben/);
 assert.equal(reminderPreview({...invoice,reminderHistory:[first,{kind:'1. Mahnung',at:first.at}]},customer,at).kind,'2. Mahnung');
 assert.throws(()=>reminderPreview({...invoice,reminderHistory:[first,first,first]},customer,at),/abgeschlossen/);
 for(const status of ['Bezahlt','Storniert','Entwurf'])assert.throws(()=>reminderPreview({...invoice,status},customer,at));
 assert.throws(()=>reminderPreview({...invoice,dueDate:'2026-10-27'},customer,at));assert.throws(()=>reminderPreview({...invoice,amountCHF:50},customer,at));assert.throws(()=>reminderPreview({...invoice,dueDate:'2026-02-30'},customer,at));
});
test('sender never calls gateway on replay, disabled configuration, PDF failure or stale claim',async()=>{
 let calls=0,finish;const cfg={enabled:true,mode:'production',webhookUrl:'https://hook.eu1.make.com/synthetic123',iban:'CH9300762011623852957',fetchImpl:async()=>{calls++;throw Error('must not send');}};
 await createReminderSender({claimInvoiceReminder:async()=>({replay:true,record:{id:'i'}})},cfg).send('i',{},{});assert.equal(calls,0);
 await assert.rejects(()=>createReminderSender({}, {...cfg,enabled:false}).send('i',{},{}),/freigegeben/);
 await assert.rejects(()=>createReminderSender({claimInvoiceReminder:async()=>{throw Error('stale');}},cfg).send('i',{},{}),/stale/);
 await assert.rejects(()=>createReminderSender({claimInvoiceReminder:async()=>({reminderId:'x',invoice:{},customer:{}}),finishInvoiceReminder:async(...x)=>finish=x},cfg).send('i',{},{}),/PDF/);assert.equal(finish[2],'not_sent');assert.equal(calls,0);
});
test('gateway timeout is uncertain, never automatically retried; matching receipt only confirms one original PDF payload',async()=>{
 const preview=reminderPreview(invoice,customer,at),claim={reminderId:'test-id',preview,invoice,customer};let calls=0,finished=[];
 const store={claimInvoiceReminder:async()=>claim,finishInvoiceReminder:async(...args)=>{finished.push(args);return {id:'i'};}};
 const cfg={enabled:true,mode:'production',webhookUrl:'https://hook.eu1.make.com/synthetic123',iban:'CH9300762011623852957',fetchImpl:async(url,o)=>{calls++;const b=JSON.parse(o.body);assert.equal(b.kind,'invoice_send');assert.match(b.eventId,/^invoice_send_reminder_/);assert.match(b.subject,/Ihre Rechnung Nr\./);assert.match(b.pdfFilename,/\.pdf$/);assert.ok(Buffer.from(b.pdfBase64,'base64').subarray(0,5).equals(Buffer.from('%PDF-')));return Response.json({ok:true,eventId:b.eventId,messageId:'synthetic_receipt'});}};
 await createReminderSender(store,cfg).send('i',{},{});assert.equal(calls,1);assert.equal(finished[0][2],'confirmed');
 calls=0;finished=[];await assert.rejects(()=>createReminderSender(store,{...cfg,fetchImpl:async()=>{calls++;throw Error('timeout');}}).send('i',{},{}),/unklar/);assert.equal(calls,1);assert.equal(finished[0][2],'manual_review');
});
