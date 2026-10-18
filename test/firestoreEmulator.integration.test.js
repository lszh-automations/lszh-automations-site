'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createRequire}=require('node:module');
const loadSDK=createRequire(require('node:path').resolve('cloud-run/offer-portal-staging/package.json'));
const EMULATOR='127.0.0.1:8088';
const PROJECT='demo-lszh-automations';
const DB_ID='lszh-offers-staging';
const token='Q'.repeat(48);
const hash=crypto.createHash('sha256').update(token).digest('hex');
const suffix=crypto.randomBytes(6).toString('hex');
const refs={
 quote:{id:'1ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef',sha256:'a'.repeat(64)},
 terms:{id:'1BCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef',sha256:'b'.repeat(64)},
 avv:{id:'1CDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefg',sha256:'c'.repeat(64)}
};
function doc(){
 return {tokenHash:hash,status:'sent',approved:true,revision:1,
  termsVersion:'TEST_v1.0_RC1',expiresAt:'2099-12-31T23:59:59.000Z',
  recipientEmail:'synthetic@example.invalid',offerNumber:'TEST_ONLY_'+suffix,
  details:{company:'Example Synthetic AG',avvVersion:'TEST_ONLY_AVV_v1.0'},
  bundle:{avv_required:'Ja',quote:refs.quote,terms:refs.terms,avv:refs.avv}};
}
function body(){
 return {name:'Synthetischer Empfaenger',email:'synthetic@example.invalid',
  authorized:true,accept_quote:true,accept_terms:true,accept_avv:true,
  quote_sha256:refs.quote.sha256,terms_sha256:refs.terms.sha256,avv_sha256:refs.avv.sha256,avv_version:'TEST_ONLY_AVV_v1.0'};
}
if(process.env.FIRESTORE_EMULATOR_HOST!==EMULATOR || process.env.GCLOUD_PROJECT!==PROJECT){
 test('emulator must be explicitly enabled; no real Firestore fallback', {skip:true},()=>{});
}else{
 const {Firestore}=loadSDK('@google-cloud/firestore');
 const awaitImport=k=>import('../cloud-run/offer-portal-staging/'+k+'.mjs');
 test('Firestore Emulator real transaction: only one of 12 parallel acceptances commits', {timeout:25000},async t=>{
  const {createOfferPortal}=await awaitImport('portalCore');
  const {createFirestoreOfferStore}=await awaitImport('firestoreOfferStore');
  const db=new Firestore({projectId:PROJECT,databaseId:DB_ID});
  t.after(()=>db.terminate());
  assert.equal(db.databaseId,DB_ID);
  const ref=db.collection('lszh_staging_offers_v1').doc(hash);
  await ref.set(doc());
  const portal=createOfferPortal({
    store:createFirestoreOfferStore(db),verifyBundle:async()=>true,
    clock:()=>new Date('2026-10-15T11:00:00Z'),
    approvedVersion:'TEST_v1.0_RC1',proofSalt:'LOCAL_SYNTHETIC_PROOF_SALT_FOR_EMULATOR_ONLY'
  });
  const results=await Promise.allSettled(Array.from({length:12},()=>portal.accept(token,body())));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.filter(x=>x.status==='rejected').length,11);
  const current=(await ref.get()).data();
  assert.equal(current.status,'accepted');
  assert.equal(current.revision,2);
  assert.equal(current.evidence.avv_required,true);
  assert.equal(current.evidence.avv_version,'TEST_ONLY_AVV_v1.0');
  assert.deepEqual(current.downstream,{airtable:'disabled',proofPdf:'disabled',email:'disabled'});
  await assert.rejects(()=>portal.accept(token,body()));
 });

 test('LIVE-code synthetic transaction smoke: 12 concurrent SDK commits and verified cleanup', {timeout:60000},async t=>{
  const {runSyntheticTransactionTest,SYNTHETIC_COLLECTION}=await import('../cloud-run/offer-portal-transaction-smoke/transactionTest.mjs');
  const db=new Firestore({projectId:PROJECT,databaseId:DB_ID});
  t.after(()=>db.terminate());
  const before=await db.collection(SYNTHETIC_COLLECTION).get();
  const result=await runSyntheticTransactionTest(db);
  assert.deepEqual(result,{attempts:12,accepted:1,declined:11});
  const after=await db.collection(SYNTHETIC_COLLECTION).get();
  assert.equal(after.size,before.size);
 });
}
