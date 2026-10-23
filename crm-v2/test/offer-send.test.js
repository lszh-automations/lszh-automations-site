'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {makePdf}=require('../offer-pdf');
const {renderOfferEmail}=require('../offer-mail');
const {createOfferSender}=require('../offer-send');
const saved={
  id:'offer-1',number:'1000',title:'Automatisierung für Beispiel AG',
  status:'Bereit',createdAt:'2026-10-23T12:00:00Z',
  validUntil:'2026-11-23',description:'',
  items:[
    {title:'Einrichtung und Konfiguration',qty:1,unitPriceCHF:450,mode:'einmalig'},
    {title:'Monatliche Betreuung',qty:1,unitPriceCHF:199,mode:'monatlich'}
  ]
};
const person={
  company:'Beispiel AG',name:'Max Muster',email:'muster@example.ch',
  street:'Beispielstrasse 12',postalCode:'5610',city:'Wohlen',country:'Schweiz'
};
const hook='https://hook.eu1.make.com/FAKEWebhookTokenForTests';
const user={email:'admin@example.ch'};
test('A4 PDF is a real byte-indexed PDF containing the exact saved quote',()=>{
  const pdf=makePdf(saved,person);
  assert.ok(Buffer.isBuffer(pdf));
  assert.ok(pdf.length>600);
  assert.equal(pdf.subarray(0,8).toString('latin1'),'%PDF-1.4');
  assert.match(pdf.toString('latin1'),/Offerte Nr\. 1000/);
  assert.match(pdf.toString('latin1'),/Einrichtung und Konfiguration/);
  assert.match(pdf.toString('latin1'),/Monatliche Betreuung/);
  assert.match(pdf.toString('latin1'),/Beispiel AG/);
  assert.match(pdf.toString('latin1'),/xref\n0 \d+/);
  const trailer=/startxref\n(\d+)\n%%EOF/.exec(pdf.toString('latin1'));
  assert.ok(trailer);
  assert.equal(pdf.subarray(Number(trailer[1]),Number(trailer[1])+4).toString(),'xref');
});
test('PDF supports multiple pages with many priced items',()=>{
  const long={...saved,items:Array.from({length:52},(_,i)=>({
    title:'Leistungsposition '+(i+1)+' Erstellung, Konfiguration und Wartung',
    qty:1,unitPriceCHF:49,mode:'einmalig'
  }))};
  const pdf=makePdf(long,person);
  const source=pdf.toString('latin1');
  assert.match(source,/\/Count [2-9]/);
  assert.match(source,/Leistungsposition 52/);
  assert.match(source,/CHF/);
});
test('email uses LSZH design and does not leak internal lead notes',()=>{
  const mail=renderOfferEmail(saved,person);
  assert.match(mail.subject,/Offerte Nr\. 1000/);
  assert.equal(mail.filename,'LSZH-Offerte-1000.pdf');
  assert.match(mail.html,/LSZH/);
  assert.match(mail.html,/Automations/);
  assert.match(mail.html,/199/);
  assert.doesNotMatch(mail.html,/qualificationNotes|budgetRange/);
});
function store(){
  const calls=[],claim={
    id:saved.id,attemptId:'attempt-123',offer:saved,
    recipient:person,to:person.email,followUpDate:'2026-11-02'
  };
  return {
    calls,
    async claimOfferSend(...args){calls.push(['claim',...args]);return claim;},
    async finishOfferSend(...args){
      calls.push(['finish',...args]);return {id:saved.id,status:args[2]==='confirmed'?'Versendet':'Bereit'};
    }
  };
}
test('disabled sender refuses before creating any send claim',async()=>{
  const db=store();
  const sender=createOfferSender(db,{enabled:false,webhookUrl:hook});
  assert.equal(sender.stats().enabled,false);
  await assert.rejects(sender.send(saved.id,{followUpDate:'2026-11-02'},user),{status:503});
  assert.equal(db.calls.length,0);
});
test('successful Make Gmail receipt changes offer to Versendet only after exact event confirmation',async()=>{
  const db=store();
  const outbound=[];
  const sender=createOfferSender(db,{
    enabled:true,webhookUrl:hook,
    async fetchImpl(uri,opts){
      assert.equal(uri,hook);
      outbound.push(JSON.parse(opts.body));
      return {ok:true,async json(){return{
        ok:true,eventId:'offer_send_attempt-123',messageId:'gmail-987'
      };}};
    }
  });
  const r=await sender.send(saved.id,{followUpDate:'2026-11-02'},user);
  assert.equal(r.status,'confirmed');
  assert.equal(r.record.status,'Versendet');
  assert.equal(outbound.length,1);
  assert.equal(outbound[0].kind,'offer_send');
  assert.equal(outbound[0].to,person.email);
  assert.equal(outbound[0].pdfFilename,'LSZH-Offerte-1000.pdf');
  assert.equal(Buffer.from(outbound[0].pdfBase64,'base64').subarray(0,4).toString(),'%PDF');
  assert.deepEqual(db.calls.map(c=>c[0]),['claim','finish']);
  assert.equal(db.calls[1][3],'confirmed');
  assert.equal(db.calls[1][4],'gmail-987');
});
test('timeout or missing provider receipt goes to manual_review without retry',async()=>{
  for(const fetchImpl of [
    async()=>{throw Error('timeout');},
    async()=>({ok:true,json:async()=>({ok:true,messageId:'gmail-but-no-event-match'})}),
    async()=>({ok:true,json:async()=>({ok:true,eventId:'wrong',messageId:'gmail'})})
  ]){
    const db=store();let calls=0;
    const sender=createOfferSender(db,{enabled:true,webhookUrl:hook,async fetchImpl(...args){
      calls++;return fetchImpl(...args);
    }});
    await assert.rejects(sender.send(saved.id,{followUpDate:'2026-11-02'},user),
      {status:409});
    assert.equal(calls,1);
    assert.equal(db.calls[1][3],'manual_review');
  }
});
test('PDF generation failure is known not sent and can be handled separately',async()=>{
  const db=store(),sender=createOfferSender(db,{enabled:true,webhookUrl:hook,
    async fetchImpl(){throw Error('Network call must never happen');}});
  const original=saved.number;
  saved.number='invalid-number';
  try{
    await assert.rejects(sender.send(saved.id,{followUpDate:'2026-11-02'},user),{status:500});
    assert.equal(db.calls[1][3],'preparation_failed');
  }finally{saved.number=original;}
});


test('TEST_ONLY mode rejects ordinary offers and customer addresses before claim',async()=>{
  const db=store();
  const realOffer={...saved,leadId:'lead-1',title:'Customer production offer'};
  db.get=async(table,id)=>table==='offerten'?realOffer:person;
  const sender=createOfferSender(db,{
    enabled:true,webhookUrl:hook,testTo:'lars.schulthess@outlook.com',
    async fetchImpl(){throw Error('must not send');}
  });
  assert.equal(sender.stats().mode,'test_only');
  await assert.rejects(sender.send(saved.id,{followUpDate:'2026-11-02'},user),{status:403});
  assert.equal(db.calls.length,0);
  realOffer.title='TEST_ONLY CRM offer';
  await assert.rejects(sender.send(saved.id,{followUpDate:'2026-11-02'},user),{status:403});
  assert.equal(db.calls.length,0);
});

test('TEST_ONLY mode sends only approved mailbox with TEST_ONLY subject',async()=>{
  const db=store();let sent=null;
  db.get=async(table,id)=>table==='offerten'?{...saved,leadId:'lead-1',title:'TEST_ONLY CRM offer'}:
    table==='leads'?{...person,email:'lars.schulthess@outlook.com'}:null;
  db.claimOfferSend=async()=>{
    db.calls.push(['claim']);
    return {offer:{...saved,title:'TEST_ONLY CRM offer'},recipient:person,
      to:'lars.schulthess@outlook.com',id:saved.id,
      attemptId:'attempt-123',followUpDate:'2026-11-02'};
  };
  const sender=createOfferSender(db,{
    enabled:true,webhookUrl:hook,testTo:'lars.schulthess@outlook.com',
    async fetchImpl(_url,options){
      sent=JSON.parse(options.body);
      return {ok:true,async json(){return {
        ok:true,eventId:sent.eventId,messageId:'gmail-test-333'
      };}};
    }
  });
  const done=await sender.send(saved.id,{followUpDate:'2026-11-02'},user);
  assert.equal(done.record.status,'Versendet');
  assert.equal(sent.to,'lars.schulthess@outlook.com');
  assert.match(sent.subject,/^\[TEST_ONLY\] Ihre Offerte/);
  assert.match(sent.pdfFilename,/^LSZH-Offerte-1000.pdf$/);
});

test('TEST_ONLY mode rechecks claimed snapshot and never sends switched recipient',async()=>{
  const db=store();let requested=0;
  db.get=async(table)=>table==='offerten'?{...saved,leadId:'lead-1',title:'TEST_ONLY CRM'}:
    {email:'lars.schulthess@outlook.com'};
  const sender=createOfferSender(db,{
    enabled:true,webhookUrl:hook,testTo:'lars.schulthess@outlook.com',
    async fetchImpl(){requested++;throw Error('unexpected call');}
  });
  await assert.rejects(sender.send(saved.id,{followUpDate:'2026-11-02'},user),{status:403});
  assert.equal(db.calls[1][3],'preparation_failed');
  assert.equal(requested,0);
});
