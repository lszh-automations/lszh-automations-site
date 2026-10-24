'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {renderInvoiceEmail}=require('../invoice-mail');
const {createInvoiceSender}=require('../invoice-send');
const user={email:'operator@lszh-automations.ch'};
const iban='CH9300762011623852957';
const invoice={id:'inv-7',number:'RE-1007',status:'Offen',description:'Automationsberatung',
  customerId:'customer-7',invoiceDate:'2026-10-24',dueDate:'2026-11-02',amountCHF:250,
  items:[{title:'Automationsberatung',qty:1,unitPriceCHF:250}]};
const customer={company:'Beispiel AG',contactName:'Max Muster',email:'rechnung@beispiel.ch',
  street:'Musterstrasse',postalCode:'8000',city:'Zuerich',country:'CH'};
function fakeStore(original=invoice,person=customer){
  const record={...original},cust={...person},calls=[];
  return {record,cust,calls,
    async get(table,id){return table==='rechnungen'?{...record}:table==='kunden'?{...cust}:null;},
    async claimInvoiceSend(id,by){
      if(record.invoiceDispatchState==='confirmed'||record.invoiceDispatchState==='sending'||record.invoiceDispatchState==='manual_review')
        throw Object.assign(Error('sent'),{status:409});
      record.invoiceDispatchState='sending';record.invoiceDispatchAttemptId='abc-def';
      calls.push(['claim',id,by.email]);
      return {id,attemptId:'abc-def',invoice:{...record},customer:{...cust},project:null,to:cust.email,
        isSynthetic:String(cust.company).toLowerCase()==='lszh invest gmbh'||String(cust.company).startsWith('TEST_ONLY')};
    },
    async finishInvoiceSend(id,attemptId,status,receipt){
      if(record.invoiceDispatchState!=='sending'||attemptId!=='abc-def')throw Error('duplicate finish');
      record.invoiceDispatchState=status;record.invoiceDispatchProviderId=status==='confirmed'?receipt:null;
      calls.push(['finish',status,receipt]);return {...record};
    }
  };
}
const webhook='https://hook.eu1.make.com/ABCdef123';
test('LSZH Rechnung mail preserves customer brand, due date and no MWST',()=>{
  const mail=renderInvoiceEmail(invoice,customer);
  assert.equal(mail.subject,'Ihre Rechnung Nr. RE-1007 | LSZH Automations');
  assert.equal(mail.filename,'LSZH_Rechnung_RE-1007.pdf');
  assert.match(mail.html,/Guten Tag Max Muster/);
  assert.match(mail.html,/02\.11\.2026/);
  assert.match(mail.html,/CHF 250/);
  assert.match(mail.html,/nicht MWST-registriert/);
  assert.match(mail.html,/Rummelmatt 8/);
  assert.doesNotMatch(mail.html,/8[.,]1\s*%|TEST_ONLY/);
});
test('invoice email escapes customer controlled content',()=>{
  const mail=renderInvoiceEmail(invoice,{...customer,contactName:'<script>alert(1)</script>'});
  assert.doesNotMatch(mail.html,/<script>/);
  assert.match(mail.html,/&lt;script&gt;/);
});
test('disabled invoice sender cannot reserve or send a claim',async()=>{
  const store=fakeStore();let sent=0;
  const sender=createInvoiceSender(store,{enabled:false,mode:'production',webhookUrl:webhook,iban,
    fetchImpl:async()=>{sent++;return null;}});
  assert.equal(sender.stats().enabled,false);
  await assert.rejects(sender.send(invoice.id,{},user),{status:503});
  assert.equal(sent,0);assert.equal(store.calls.length,0);
});
test('confirmed Gmail receipt records dispatch once, retains invoice status Offen',async()=>{
  const store=fakeStore();const payloads=[];
  const sender=createInvoiceSender(store,{enabled:true,mode:'production',webhookUrl:webhook,iban,
    fetchImpl:async(_url,opt)=>{
      const body=JSON.parse(opt.body);payloads.push(body);
      return {ok:true,json:async()=>({ok:true,eventId:body.eventId,messageId:'gmail-id-7'})};
    }});
  assert.equal(sender.stats().mode,'production');
  const result=await sender.send(invoice.id,{},user);
  assert.equal(result.status,'confirmed');
  assert.equal(result.record.invoiceDispatchState,'confirmed');
  assert.equal(result.record.status,'Offen');
  assert.equal(payloads.length,1);
  assert.equal(payloads[0].kind,'invoice_send');
  assert.equal(payloads[0].to,customer.email);
  assert.equal(payloads[0].pdfFilename,'LSZH_Rechnung_RE-1007.pdf');
  assert.match(Buffer.from(payloads[0].pdfBase64,'base64').subarray(0,8).toString(),/^%PDF-/);
  assert.equal(store.calls.length,2);
  await assert.rejects(sender.send(invoice.id,{},user),{status:409});
  assert.equal(payloads.length,1);
});
test('unconfirmed or lost provider receipt requires manual review, never retries automatically',async()=>{
  const store=fakeStore();let attempts=0;
  const sender=createInvoiceSender(store,{enabled:true,mode:'production',webhookUrl:webhook,iban,
    fetchImpl:async()=>{attempts++;return {ok:true,json:async()=>({ok:true,eventId:'wrong',messageId:'gmail-foo'})};}});
  await assert.rejects(sender.send(invoice.id,{},user),{status:409});
  assert.equal(store.record.invoiceDispatchState,'manual_review');
  assert.equal(attempts,1);
  await assert.rejects(sender.send(invoice.id,{},user),{status:409});
  assert.equal(attempts,1);
});
test('self-billed RE-1001 and synthetic data cannot reach production Gmail',async()=>{
  const store=fakeStore({...invoice,number:'RE-1001'},{...customer,company:'LSZH Invest GmbH'});
  let called=false;
  const sender=createInvoiceSender(store,{enabled:true,mode:'production',webhookUrl:webhook,iban,
    fetchImpl:async()=>{called=true;throw Error('unsafe');}});
  await assert.rejects(sender.send(store.record.id,{},user),{status:403});
  assert.equal(store.calls.length,0);assert.equal(called,false);
});
test('test-only invoice send must target allowlisted test mailbox and synthetic customer',async()=>{
  const store=fakeStore({...invoice,description:'TEST_ONLY Test',number:'RE-1008'},
    {...customer,company:'TEST_ONLY Test AG',email:'my-test@example.ch'});
  const sender=createInvoiceSender(store,{enabled:true,mode:'test_only',testTo:'my-test@example.ch',webhookUrl:webhook,iban,
    fetchImpl:async(_url,opt)=>{const data=JSON.parse(opt.body);
      assert.match(data.subject,/^\[TEST_ONLY\]/);
      return {ok:true,json:async()=>({ok:true,eventId:data.eventId,messageId:'test-gmail'})};
    }});
  const result=await sender.send(invoice.id,{},user);
  assert.equal(result.status,'confirmed');
  const mismatch=fakeStore({...invoice,description:'TEST_ONLY Test'},
    {...customer,company:'TEST_ONLY Test AG',email:'external@example.com'});
  await assert.rejects(createInvoiceSender(mismatch,{enabled:true,mode:'test_only',
    testTo:'my-test@example.ch',webhookUrl:webhook,iban}).send(invoice.id,{},user),{status:403});
});
test('invoice sender requires exact empty post body and cannot send wrong amount',async()=>{
  const store=fakeStore();
  const sender=createInvoiceSender(store,{enabled:true,mode:'production',webhookUrl:webhook,iban,fetchImpl:async()=>null});
  await assert.rejects(sender.send(invoice.id,{to:'other@example.ch'},user),{status:400});
  assert.equal(store.calls.length,0);
  const broken=fakeStore({...invoice,amountCHF:999});
  const brokenSender=createInvoiceSender(broken,{enabled:true,mode:'production',webhookUrl:webhook,iban,
    fetchImpl:async()=>{throw Error('Should not send');}});
  await assert.rejects(brokenSender.send(invoice.id,{},user),{status:500});
  assert.equal(broken.record.invoiceDispatchState,'preparation_failed');
});
