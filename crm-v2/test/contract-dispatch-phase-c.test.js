'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const {makePdf}=require('../offer-pdf');
const {digest,prepareOfferPackage}=require('../offer-contract-package');
const {
  PURPOSE,COLLECTION,createContractReleaseGate,verifyReleaseManifest
}=require('../contract-dispatch-release-staging');
const {createContractDispatchLedger}=require('../contract-dispatch-ledger-staging');
const CLOCK=Date.parse('2026-10-25T08:30:00.000Z');
const SECRET=Buffer.from('TEST_ONLY_separate_very_long_secret_key_for_unit_tests_20261025');
const TO='test-approved@example.com';
const ACTOR='operator-approved@example.com';
function sample(avv='no',offerId='test_quote_50',revision=1){
  const kinds=avv==='yes'?['offer','terms','avv']:['offer','terms'];
  const content={};
  const docs=kinds.map(kind=>{
    const data=makePdf({
      number:'1050',title:'TEST_ONLY '+kind+' – KEIN VERTRAG',
      validUntil:'2026-12-31',items:[{
        title:'TEST_ONLY '+kind,qty:1,unitPriceCHF:20,mode:'einmalig'
      }]
    },{
      name:'Test Muster',company:'TEST_ONLY Beispiel',
      email:'preview@example.invalid',street:'Musterweg 12',
      postalCode:'5610',city:'Wohlen',country:'Schweiz'
    });
    content['test_archive_'+kind+'_20261025']=data;
    return {kind,version:'RC1_TEST_ONLY',archiveFileId:'test_archive_'+kind+'_20261025',
      filename:'TEST_ONLY_'+kind+'.pdf',sha256:digest(data),bytes:data.length};
  });
  const pkg=prepareOfferPackage({
    offerId,offerNumber:'1050',revision,
    offerSnapshotSha256:digest(Buffer.from('TEST_ONLY saved quote snapshot')),
    avvRequired:avv,avvAnnexesConfirmed:avv==='yes',documents:docs
  });
  const calls=[];
  const readArchivedPdf=async key=>{calls.push(key);return content[key];};
  return {pkg,content,calls,readArchivedPdf};
}
function approval(pkg,overrides={}){
  return {
    purpose:PURPOSE,recipient:TO,operatorEmail:ACTOR,
    approvalId:'approval_test_1000',approvedAt:new Date(CLOCK).toISOString(),
    ...overrides
  };
}
function gate(f,opts={}){
  return createContractReleaseGate({
    signingSecret:SECRET,allowedOperators:[ACTOR],allowedRecipients:[TO],
    authorizeOperator:async()=>true,readArchivedPdf:f.readArchivedPdf,
    now:()=>CLOCK,...opts
  });
}
class FakeDb{
  constructor(){this.docs=new Map();this.queue=Promise.resolve();}
  collection(collectionName){
    assert.equal(collectionName,COLLECTION);
    return {doc:key=>this.ref(key)};
  }
  ref(key){
    return {id:key,get:async()=>this.snapshot(key)};
  }
  snapshot(key){
    const data=this.docs.get(key);
    return {exists:data!==undefined,data:()=>structuredClone(data)};
  }
  async runTransaction(work){
    // A serial fake mimics Firestore's "one winner" transaction semantics;
    // this is NOT an emulator and not an actual Firestore integration test.
    let release;
    const turn=new Promise(done=>{release=done});
    const previous=this.queue;this.queue=turn;
    await previous;
    const writes=[];
    const tx={
      get:async ref=>this.snapshot(ref.id),
      create:(ref,value)=>writes.push(['create',ref.id,structuredClone(value)]),
      update:(ref,value)=>writes.push(['update',ref.id,structuredClone(value)])
    };
    try{
      const result=await work(tx);
      for(const [kind,id] of writes)if(kind==='create'&&this.docs.has(id))
        throw Error('transaction create conflict');
      for(const [kind,id,value] of writes){
        if(kind==='create')this.docs.set(id,value);
        else if(kind==='update'){
          if(!this.docs.has(id))throw Error('update missing');
          this.docs.set(id,{...this.docs.get(id),...value});
        }
      }
      return result;
    }finally{release()}
  }
}
function ledger(db,opts={}){
  return createContractDispatchLedger(db,{
    signingSecret:SECRET,now:()=>CLOCK,
    verifyGatewayReceipt:async()=>true,verifyManualReview:async()=>true,...opts
  });
}
function receipt(m,opts={}){
  return {ok:true,eventId:m.eventId,packageSha256:m.packageSha256,
    to:m.recipient,attachmentCount:m.documents.length,
    provider:'gmail',messageId:'gmail_test_message_1000',...opts};
}
test('C stage 2-PDF release requires fresh backend approval and exact allowlisted mailbox',async()=>{
  const f=sample(),g=gate(f);
  const m=await g.approve(f.pkg,approval(f.pkg));
  assert.equal(m.purpose,PURPOSE);
  assert.equal(m.documents.length,2);
  assert.equal(m.recipient,TO);
  assert.equal(m.operatorEmail,ACTOR);
  assert.equal(m.signature.length,64);
  assert.deepEqual(f.calls,f.pkg.documents.map(d=>d.archiveFileId));
  assert.equal(verifyReleaseManifest(m,SECRET).eventId,f.pkg.sendEventId);
  assert.equal(Object.hasOwn(m,'contentBase64'),false);
  assert.equal(Object.hasOwn(m,'html'),false);
  assert.equal(Object.hasOwn(m,'hookUrl'),false);
});
test('C stage 3-PDF release includes AVV in order and checks all three archived bytes',async()=>{
  const f=sample('yes'),g=gate(f);
  const m=await g.approve(f.pkg,approval(f.pkg));
  assert.deepEqual(m.documents.map(d=>d.kind),['offer','terms','avv']);
  assert.equal(f.calls.length,3);
  assert.equal(m.avvRequired,'yes');
  assert.equal(verifyReleaseManifest(m,SECRET).signature,m.signature);
});
test('C authorisation rejects unknown actor, recipient, wrong purpose and untrusted approval',async()=>{
  const f=sample(),g=gate(f);
  const cases=[
    {recipient:'real-customer@example.ch'},
    {recipient:'test-approved@example.com\r\nBcc:bad@example.com'},
    {operatorEmail:'visitor@example.com'},
    {purpose:'production'},
    {approvalId:'short'},
    {approvedAt:'2026-10-25T08:00:00.000Z'},
    {approvedAt:'2026-10-25T08:45:00.000Z'},
    {newField:'not_allowed'}
  ];
  for(const values of cases)
    await assert.rejects(g.approve(f.pkg,approval(f.pkg,values)),/blocked/);
  await assert.rejects(gate(f,{authorizeOperator:async()=>false}).approve(
    f.pkg,approval(f.pkg)),/authorisation refused/);
});
test('C release refuses untrusted signature configuration or wildcard/non-deliverable recipients',()=>{
  const f=sample();
  assert.throws(()=>gate(f,{signingSecret:Buffer.alloc(8)}),/secret/);
  assert.throws(()=>gate(f,{allowedRecipients:[]}),/incomplete/);
  assert.throws(()=>gate(f,{allowedRecipients:['preview@example.invalid']}),/invalid domain/);
  assert.throws(()=>gate(f,{allowedRecipients:['*@example.com']}),/invalid email/);
});
test('C corrupted, missing or mismatched archived PDF bytes fail closed before signing',async()=>{
  const f=sample('yes');
  const wrong=async key=>{
    if(key.includes('terms')){
      const b=Buffer.from(f.content[key]);b[b.length-1]^=1;return b;
    }
    return f.content[key];
  };
  await assert.rejects(gate(f,{readArchivedPdf:wrong}).approve(
    f.pkg,approval(f.pkg)),/SHA-256/);
  await assert.rejects(gate(f,{readArchivedPdf:async()=>null}).approve(
    f.pkg,approval(f.pkg)),/PDF-Inhalt/);
});
test('C release refuses unsigned modifications, stale package and expired approvals',async()=>{
  const f=sample();
  await assert.rejects(gate(f).approve({...f.pkg,status:'sent'},approval(f.pkg)),/prepared/);
  const signed=await gate(f).approve(f.pkg,approval(f.pkg));
  for(const edit of [
    {...signed,recipient:'client@example.com'},
    {...signed,packageSha256:'f'.repeat(64)},
    {...signed,documents:signed.documents.map((d,i)=>i?d:{...d,sha256:'f'.repeat(64)})},
    {...signed,signature:'0'.repeat(64)}
  ])assert.throws(()=>verifyReleaseManifest(edit,SECRET),/blocked/);
  const old=gate(f,{now:()=>CLOCK+16*60*1000});
  await assert.rejects(old.approve(f.pkg,approval(f.pkg)),/recent/);
});
test('C Firestore-style ledger serially reserves package and writes no PDF payload',async()=>{
  const f=sample(),db=new FakeDb(),m=await gate(f).approve(f.pkg,approval(f.pkg));
  const result=await ledger(db).reserve(m);
  assert.equal(result.state,'reserved');
  assert.equal(result.documentCount,2);
  assert.equal(db.docs.size,2); // attempt + permanent per-offer lock
  for(const item of db.docs.values()){
    const serialized=JSON.stringify(item);
    assert.doesNotMatch(serialized,/contentBase64|JVBERi0|html|webhook|secret/);
  }
  assert.equal((await ledger(db).inspect(m.eventId)).status,'reserved');
});
test('C concurrent reservations across workers cannot double-reserve or retry',async()=>{
  const f=sample(),db=new FakeDb(),m=await gate(f).approve(f.pkg,approval(f.pkg));
  const [a,b]=await Promise.allSettled([ledger(db).reserve(m),ledger(db).reserve(m)]);
  assert.deepEqual([a.status,b.status].sort(),['fulfilled','rejected']);
  assert.equal(db.docs.size,2);
  await assert.rejects(ledger(db).reserve(m),/already reserved/);
  const f2=sample('no','test_quote_50',2); // same offer, new revision
  const m2=await gate(f2).approve(f2.pkg,approval(f2.pkg));
  await assert.rejects(ledger(db).reserve(m2),/offer locked/);
});
test('C permanent per-offer lock remains after ambiguous provider result and process restart',async()=>{
  const f=sample(),db=new FakeDb(),m=await gate(f).approve(f.pkg,approval(f.pkg));
  await ledger(db).reserve(m);
  assert.equal((await ledger(db).markDeliveryUncertain(m.eventId)).state,'delivery_review');
  await assert.rejects(ledger(db).markDeliveryUncertain(m.eventId),/already reviewed/);
  assert.equal((await ledger(db).inspect(m.eventId)).status,'delivery_review');
  await assert.rejects(ledger(db).reserve(m),/already reserved/);
});
test('C verified Gmail receipt bound to hash, event, recipient and attachment count',async()=>{
  const f=sample('yes'),db=new FakeDb(),m=await gate(f).approve(f.pkg,approval(f.pkg));
  await ledger(db).reserve(m);
  const spies=[];
  const l=ledger(db,{verifyGatewayReceipt:async proof=>{spies.push(proof);return true;}});
  const confirmed=await l.confirmVerifiedReceipt(m.eventId,receipt(m));
  assert.equal(confirmed.state,'confirmed_test_only');
  assert.equal(confirmed.transmitted,true);
  assert.equal(spies.length,1);
  assert.equal(spies[0].expected.documentHashes.length,3);
  assert.equal((await l.inspect(m.eventId)).status,'confirmed_test_only');
  await assert.rejects(l.confirmVerifiedReceipt(m.eventId,receipt(m)),/finalised/);
});
test('C receipt mismatch or absent trusted provider verification cannot mark sent',async()=>{
  const f=sample(),db=new FakeDb(),m=await gate(f).approve(f.pkg,approval(f.pkg));
  await ledger(db).reserve(m);
  const l=ledger(db,{verifyGatewayReceipt:async()=>false});
  for(const different of [
    {eventId:'contract_send_pkg_different_1_r1'},
    {to:'client@example.com'},
    {attachmentCount:3},
    {packageSha256:'f'.repeat(64)},
    {messageId:'bad\nmessage'},
    {provider:'NONE'}, {ok:false}, {unexpected:true}
  ])await assert.rejects(l.confirmVerifiedReceipt(m.eventId,receipt(m,different)),/blocked/);
  await assert.rejects(l.confirmVerifiedReceipt(m.eventId,receipt(m)),/not independently verified/);
  assert.equal((await l.inspect(m.eventId)).status,'reserved');
});
test('C verified not-sent manual review closes uncertainty but never lifts offer lock',async()=>{
  const f=sample(),db=new FakeDb(),m=await gate(f).approve(f.pkg,approval(f.pkg));
  const l=ledger(db,{verifyManualReview:async()=>true});
  await l.reserve(m);
  await l.markDeliveryUncertain(m.eventId);
  assert.equal((await l.closeVerifiedNotSent(m.eventId,{
    reviewId:'review_mailbox_1000',reviewedBy:ACTOR
  })).mayAutoRetry,false);
  assert.equal((await l.inspect(m.eventId)).status,'not_sent_closed');
  await assert.rejects(l.reserve(m),/already reserved/);
});
test('C negative manual review, missing evidence and illegal status transitions fail',async()=>{
  const f=sample(),db=new FakeDb(),m=await gate(f).approve(f.pkg,approval(f.pkg));
  const l=ledger(db,{verifyManualReview:async()=>false});
  await l.reserve(m);
  await assert.rejects(l.closeVerifiedNotSent(m.eventId,{
    reviewId:'review_mailbox_1000',reviewedBy:ACTOR
  }),/only uncertain/);
  await l.markDeliveryUncertain(m.eventId);
  await assert.rejects(l.closeVerifiedNotSent(m.eventId,{
    reviewId:'review_mailbox_1000',reviewedBy:ACTOR
  }),/unverified/);
  assert.equal((await l.inspect(m.eventId)).status,'delivery_review');
  await assert.rejects(l.closeVerifiedNotSent(m.eventId,{reviewId:'fake'}),/malformed/);
});
test('C release/ledger not imported from CRM routes or productive send and cannot dispatch',()=>{
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const offerSend=fs.readFileSync(path.join(__dirname,'../offer-send.js'),'utf8');
  const release=fs.readFileSync(path.join(__dirname,'../contract-dispatch-release-staging.js'),'utf8');
  const ledger=fs.readFileSync(path.join(__dirname,'../contract-dispatch-ledger-staging.js'),'utf8');
  for(const prod of [server,offerSend]){
    assert.doesNotMatch(prod,/require\s*\(\s*['"]\.\/contract-dispatch-(?:ledger|release)-staging['"]\s*\)/);
  }
  for(const src of [release,ledger]){
    assert.doesNotMatch(src,/\bfetch\(|https?\.request|gmail\.send|hook\.eu1\.make\.com/);
    assert.doesNotMatch(src,/require\s*\(\s*['"](?:node:http|node:https|googleapis)/);
  }
});
