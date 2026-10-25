'use strict';
// TRUE Firestore transaction tests. Run ONLY through Firebase/Firestore emulator.
// Not included in "npm test"; no fallback to production Firestore is permitted.
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Firestore}=require('@google-cloud/firestore');
const {digest,prepareOfferPackage}=require('../offer-contract-package');
const {COLLECTION,PURPOSE,createContractReleaseGate}=require('../contract-dispatch-release-staging');
const {createContractDispatchLedger}=require('../contract-dispatch-ledger-staging');

const HOST='127.0.0.1:8788';
const PROJECT='demo-lszh-contract-dispatch-20261025';
const SECRET=Buffer.from('TEST_ONLY_EMULATOR_signing_key_very_long_not_a_real_secret_20261025');
const TEST_RECIPIENT='firestore-test@example.com';
const OPERATOR='operator-test@example.com';
if(process.env.FIRESTORE_EMULATOR_HOST!==HOST) {
  throw Error('REFUSED: Firestore emulator must run at '+HOST+'; no production fallback.');
}
if(process.env.GCLOUD_PROJECT&&process.env.GCLOUD_PROJECT!==PROJECT) {
  throw Error('REFUSED: GCLOUD_PROJECT is not the isolated demo project.');
}
if(process.env.GOOGLE_CLOUD_PROJECT&&process.env.GOOGLE_CLOUD_PROJECT!==PROJECT) {
  throw Error('REFUSED: GOOGLE_CLOUD_PROJECT is not the isolated demo project.');
}
if(process.env.FIREBASE_PROJECT_ID&&process.env.FIREBASE_PROJECT_ID!==PROJECT) {
  throw Error('REFUSED: FIREBASE_PROJECT_ID is not the isolated demo project.');
}
const databases=[];
function database(){
  const db=new Firestore({projectId:PROJECT});
  databases.push(db);
  return db;
}
after(async()=>{await Promise.allSettled(databases.map(db=>db.terminate()));});
function fixture({offerId='TEST_ONLY_'+randomUUID().replace(/-/g,''),revision=1,avv='no'}={}){
  const binary={};
  const kinds=avv==='yes'?['offer','terms','avv']:['offer','terms'];
  const documents=kinds.map(kind=>{
    const bytes=Buffer.from('%PDF-1.4\nTEST_ONLY '+kind+'\n'+'#'.repeat(80));
    const archiveFileId='test_archived_'+kind+'_20261025';
    binary[archiveFileId]=bytes;
    return {
      kind,version:'RC1_TEST_ONLY',archiveFileId,
      sha256:digest(bytes),filename:'TEST_ONLY_'+kind+'.pdf',bytes:bytes.length
    };
  });
  const pkg=prepareOfferPackage({
    offerId,offerNumber:'9099901',revision,
    offerSnapshotSha256:digest(Buffer.from('TEST_ONLY snapshot '+offerId)),
    avvRequired:avv,avvAnnexesConfirmed:avv==='yes',documents
  });
  const now=Date.now();
  const gate=createContractReleaseGate({
    signingSecret:SECRET,now:()=>now,
    allowedOperators:[OPERATOR],allowedRecipients:[TEST_RECIPIENT],
    authorizeOperator:async()=>true,
    readArchivedPdf:async archiveFileId=>binary[archiveFileId]
  });
  return {
    pkg,now,manifest:gate.approve(pkg,{
      purpose:PURPOSE,recipient:TEST_RECIPIENT,operatorEmail:OPERATOR,
      approvalId:'approval_emulator_'+randomUUID().replace(/-/g,''),
      approvedAt:new Date(now).toISOString()
    })
  };
}
function ledger(db,opts={}){
  return createContractDispatchLedger(db,{
    signingSecret:SECRET,verifyGatewayReceipt:async()=>true,
    verifyManualReview:async()=>true,...opts
  });
}
function providerReceipt(manifest,changes={}){
  return {
    ok:true,eventId:manifest.eventId,packageSha256:manifest.packageSha256,
    to:manifest.recipient,attachmentCount:manifest.documents.length,
    provider:'gmail',messageId:'emulator_fake_gmail_message_01',
    ...changes
  };
}
async function recordsForOffer(db,offerId){
  const all=await db.collection(COLLECTION).get();
  return all.docs.map(x=>({id:x.id,...x.data()})).filter(x=>x.offerId===offerId);
}
test('emulator C2: signed 2-PDF reservation atomically creates exactly one attempt and one lock',async()=>{
  const f=fixture(),manifest=await f.manifest,db=database(),l=ledger(db);
  const r=await l.reserve(manifest);
  assert.equal(r.state,'reserved');
  assert.equal(r.documentCount,2);
  const rows=await recordsForOffer(db,manifest.offerId);
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(x=>x.kind).sort(),[
    'TEST_ONLY_CONTRACT_DISPATCH_LEDGER','TEST_ONLY_CONTRACT_OFFER_LOCK'
  ].sort());
  for(const row of rows){
    const dumped=JSON.stringify(row);
    assert.doesNotMatch(dumped,/contentBase64|JVBER|webhookUrl|secret|mailHtml/);
    assert.equal(row.eventId,manifest.eventId);
  }
});
test('emulator C2: two independent Firestore clients compete for same event; only one wins',async()=>{
  const f=fixture(),m=await f.manifest,db1=database(),db2=database();
  const [a,b]=await Promise.allSettled([
    ledger(db1).reserve(m),ledger(db2).reserve(m)
  ]);
  assert.deepEqual([a.status,b.status].sort(),['fulfilled','rejected']);
  assert.equal((await recordsForOffer(db1,m.offerId)).length,2);
  await assert.rejects(ledger(db2).reserve(m));
});
test('emulator C2: changing package revision cannot bypass durable per-offer lock',async()=>{
  const offerId='TEST_ONLY_'+randomUUID().replace(/-/g,'');
  const first=fixture({offerId,revision:1});
  const second=fixture({offerId,revision:2});
  const m1=await first.manifest,m2=await second.manifest;
  const db=database(),l=ledger(db);
  await l.reserve(m1);
  await assert.rejects(l.reserve(m2),/offer locked/);
  assert.equal((await recordsForOffer(db,offerId)).length,2);
});
test('emulator C2: crash and new Firestore client retain unresolved lock, never retry automatically',async()=>{
  const f=fixture({avv:'yes'}),m=await f.manifest;
  const before=database();await ledger(before).reserve(m);
  await before.terminate(); // represents a stopped worker with unfinished send
  const afterRestart=database(),l=ledger(afterRestart);
  assert.equal((await l.inspect(m.eventId)).status,'reserved');
  await assert.rejects(l.reserve(m),/already reserved/);
  assert.equal((await l.markDeliveryUncertain(m.eventId)).state,'delivery_review');
  await assert.rejects(l.markDeliveryUncertain(m.eventId),/already reviewed/);
  assert.equal((await l.inspect(m.eventId)).status,'delivery_review');
  assert.equal((await recordsForOffer(afterRestart,m.offerId)).length,2);
});
test('emulator C2: forged receipts and failed verifier cannot confirm, valid test proof is single-use',async()=>{
  const f=fixture({avv:'yes'}),m=await f.manifest,db=database();
  const l=ledger(db,{verifyGatewayReceipt:async()=>false});
  await l.reserve(m);
  for(const item of [
    providerReceipt(m,{packageSha256:'f'.repeat(64)}),
    providerReceipt(m,{to:'real-customer@example.ch'}),
    providerReceipt(m,{attachmentCount:2}),
    providerReceipt(m,{messageId:'bad\nmailid'})
  ])await assert.rejects(l.confirmVerifiedReceipt(m.eventId,item));
  await assert.rejects(l.confirmVerifiedReceipt(m.eventId,providerReceipt(m)),/not independently verified/);
  assert.equal((await l.inspect(m.eventId)).status,'reserved');
  const verifier=ledger(db,{verifyGatewayReceipt:async({receipt,expected})=>
    receipt.eventId===expected.eventId&&receipt.to===expected.recipient&&
    expected.documentHashes.length===3});
  await verifier.confirmVerifiedReceipt(m.eventId,providerReceipt(m));
  assert.equal((await verifier.inspect(m.eventId)).status,'confirmed_test_only');
  await assert.rejects(verifier.confirmVerifiedReceipt(m.eventId,providerReceipt(m)),/finalised/);
  await assert.rejects(verifier.reserve(m),/already reserved/);
});
test('emulator C2: mailbox review can close uncertain result but cannot clear permanent offer lock',async()=>{
  const f=fixture(),m=await f.manifest,db=database();
  const denied=ledger(db,{verifyManualReview:async()=>false});
  await denied.reserve(m);
  await denied.markDeliveryUncertain(m.eventId);
  await assert.rejects(denied.closeVerifiedNotSent(m.eventId,{
    reviewId:'review_emulator_12345678',reviewedBy:OPERATOR
  }),/unverified/);
  const allowed=ledger(db,{verifyManualReview:async()=>true});
  const closed=await allowed.closeVerifiedNotSent(m.eventId,{
    reviewId:'review_emulator_12345678',reviewedBy:OPERATOR
  });
  assert.equal(closed.mayAutoRetry,false);
  assert.equal((await allowed.inspect(m.eventId)).status,'not_sent_closed');
  await assert.rejects(allowed.reserve(m),/already reserved/);
  assert.equal((await recordsForOffer(db,m.offerId)).length,2);
});
