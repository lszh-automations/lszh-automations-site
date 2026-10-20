'use strict';
// Exact local emulator only; provider is an injected fake, never Gmail/Make.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash,randomUUID}=require('node:crypto');
const {createRequire}=require('node:module');
const path=require('node:path');
const EMULATOR='127.0.0.1:8088',PROJECT='demo-lszh-automations',DATABASE='lszh-offers-staging';
const COLLECTION='lszh_internal_mail_recovery_v1';
const enabled=process.env.FIRESTORE_EMULATOR_HOST===EMULATOR&&process.env.GCLOUD_PROJECT===PROJECT&&
 !process.env.GOOGLE_APPLICATION_CREDENTIALS&&!process.env.K_SERVICE;
const hash=x=>createHash('sha256').update(x).digest('hex');
function fixture(){
 const documents=['quote','terms','avv','receipt'].map((kind,i)=>{
  const bytes=Buffer.from('%PDF-1.4\nINTERNAL_EMULATOR_ONLY '+kind+'\n%%EOF');
  return{kind,id:String(i+1).repeat(25),bytes,sha256:hash(bytes),mimeType:'application/pdf',readOnly:true,
   parents:['10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko']};
 });
 return{recordId:'recktLXj5wUxLmHFQ',offerNumber:'TEST_CLOUD_AVV_JA_20261019_NO_CONTRACT',
  baseId:'appzJiskpAdaR1HEv',tableId:'tbljeIUoD7wwKuSmS',testOnly:true,status:'accepted',
  acceptedAt:'2026-10-20T15:00:00.000Z',productionApproved:false,legalApproved:false,dispatchApproved:false,
  inProgress:false,sentAt:null,avvRequired:true,avvConfirmed:true,quoteConfirmed:true,termsConfirmed:true,
  authorizedConfirmed:true,documents,expectedReceiptSha256:documents.at(-1).sha256,
  acceptedHashes:Object.fromEntries(documents.filter(d=>d.kind!=='receipt').map(d=>[d.kind,d.sha256]))};
}
if(!enabled){
 test('internal mail recovery requires the exact local demo emulator; no cloud fallback',{skip:true},()=>{});
}else{
 const load=createRequire(path.resolve('cloud-run/offer-portal-staging/package.json'));
 const {Firestore}=load('@google-cloud/firestore');
 test('real emulator recovery: atomic claim, ambiguous outcomes and no resend',{timeout:90000},async t=>{
  const {createInternalRecoveryStore,sendInternalTestConfirmationOnce,inspectInternalMailRecovery}=
   await import('../cloud-run/offer-portal-staging/internalReceiptMailRecovery.mjs');
  const db=new Firestore({projectId:PROJECT,databaseId:DATABASE});
  assert.equal(db.projectId,PROJECT);assert.equal(db.databaseId,DATABASE);
  const store=createInternalRecoveryStore(db,{enabled:true,emulatorOnly:true});
  const plan=inspectInternalMailRecovery(fixture());
  assert.equal(plan.status,'READY_FOR_ATOMIC_CLAIM');
  const ref=db.collection(COLLECTION).doc(plan.key);
  const extra=db.collection(COLLECTION).doc(hash(randomUUID()));
  t.after(async()=>{try{await ref.delete();await extra.delete();}finally{await db.terminate();}});
  // This namespace exists solely inside the exact demo emulator above.
  await ref.delete();

  await t.test('twelve parallel sends produce one durable provider attempt',async()=>{
   let sends=0;
   const results=await Promise.all(Array.from({length:12},()=>sendInternalTestConfirmationOnce({
    loadFresh:async()=>fixture(),store,sendMail:async mail=>{
     sends++;assert.deepEqual(mail.to,['lars.schulthess@outlook.com']);
     assert.equal(mail.attachments.length,4);return{id:'EMULATOR_FAKE_PROVIDER_ID'};
    }})));
   assert.equal(sends,1);
   assert.equal(results.filter(r=>r.status==='PROVIDER_ACCEPTED').length,1);
   const saved=(await ref.get()).data();
   assert.equal(saved.state,'PROVIDER_ACCEPTED');assert.equal(saved.providerMessageId,'EMULATOR_FAKE_PROVIDER_ID');
   await assert.rejects(store.markSent(plan.key,'wrong-attempt','must-not-change'));
   assert.equal((await ref.get()).data().providerMessageId,'EMULATOR_FAKE_PROVIDER_ID');
  });
  await t.test('lost provider response blocks every later attempt',async()=>{
   await ref.delete();let sends=0;
   const options={loadFresh:async()=>fixture(),store,sendMail:async()=>{sends++;throw Error('simulated response loss');}};
   assert.equal((await sendInternalTestConfirmationOnce(options)).reason,'provider_outcome_unknown_manual_reconciliation');
   assert.equal((await ref.get()).data().state,'MANUAL_RECONCILIATION_REQUIRED');
   assert.equal((await sendInternalTestConfirmationOnce(options)).status,'STOP');assert.equal(sends,1);
  });
  await t.test('provider success and failed readback leave a durable no-resend reservation',async()=>{
   await ref.delete();let sends=0;
   const failing={...store,markSent:async()=>{throw Error('simulated storage outage');}};
   const options={loadFresh:async()=>fixture(),store:failing,sendMail:async()=>{sends++;return{id:'EMULATOR_FAKE_ID'};}};
   assert.equal((await sendInternalTestConfirmationOnce(options)).reason,'provider_accepted_local_readback_pending_do_not_resend');
   assert.equal((await ref.get()).data().state,'SENDING');
   assert.equal((await sendInternalTestConfirmationOnce(options)).status,'STOP');assert.equal(sends,1);
  });
  await t.test('an existing sent timestamp never creates a reservation',async()=>{
   await ref.delete();
   const result=await sendInternalTestConfirmationOnce({
    loadFresh:async()=>({...fixture(),sentAt:'2026-10-20T15:25:28Z'}),store,
    sendMail:async()=>assert.fail('mail provider must not be called')});
   assert.equal(result.status,'ALREADY_SENT');assert.equal((await ref.get()).exists,false);
  });
  await t.test('an unknown durable state cannot be reset by a repeated claim',async()=>{
   await ref.delete();await ref.create({state:'UNKNOWN_EXTERNAL_RESULT'});
   assert.equal(await store.claim(plan.key,{recordId:fixture().recordId,attemptId:randomUUID()}),false);
   assert.equal((await ref.get()).data().state,'UNKNOWN_EXTERNAL_RESULT');
  });
 });
}
