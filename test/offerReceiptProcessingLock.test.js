'use strict';
// Pure offline test: no Firestore writes, network access, credentials or mail.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const sha=x=>createHash('sha256').update(x).digest('hex');
const AT='2026-10-18T12:00:00.000Z';
const attemptA='TEST_ATTEMPT_AAAA123456789012';
const attemptB='TEST_ATTEMPT_BBBB123456789012';
const now=new Date('2026-10-18T12:00:01.000Z');
async function accepted(mode='Ja'){
 const {buildSyntheticReceiptReview}=await import(
  '../cloud-run/offer-portal-staging/receiptRecoveryReview.mjs');
 const pdfs={quote:'a'.repeat(64),terms:'b'.repeat(64),avv:'c'.repeat(64)};
 const offer={
  status:'accepted',approved:true,revision:2,acceptedAt:AT,
  tokenHash:sha('SYNTHETIC_TOKEN_NEVER_ISSUED'),
  recipientEmail:'synthetic@example.invalid',
  offerNumber:'TEST_REVIEW_LOCK_20261018_NO_CONTRACT',
  termsVersion:'TEST_v1.0_RC1',
  source:{kind:'LSZH_SYNTHETIC_ONLY',baseId:'appzJiskpAdaR1HEv',
   tableId:'tbljeIUoD7wwKuSmS',recordId:'rec12345678901234'},
  bundle:{avv_required:mode,quote:{sha256:pdfs.quote},
   terms:{sha256:pdfs.terms},
   ...(mode==='Ja'?{avv:{sha256:pdfs.avv}}:{})},
  downstream:{airtable:'disabled',proofPdf:'disabled',email:'disabled'}
 };
 offer.evidence={
  accepted_at_utc:AT,authorized_confirmed:true,terms_confirmed:true,
  quote_pdf_sha256:pdfs.quote,terms_pdf_sha256:pdfs.terms,
  avv_required:mode==='Ja',avv_confirmed:mode==='Ja',
  avv_pdf_sha256:mode==='Ja'?pdfs.avv:null
 };
 offer.receiptReview=buildSyntheticReceiptReview(offer,offer.evidence,AT);
 return offer;
}
async function decide(offer,attemptId=attemptA,time=now){
 const {decideSyntheticReceiptReviewLock}=await import(
  '../cloud-run/offer-portal-staging/receiptProcessingLock.mjs');
 return decideSyntheticReceiptReviewLock(offer,{
  expectedReviewKey:offer.receiptReview.idempotencyKey,attemptId,now:time
 });
}
function inert(result){
 assert.equal(result.canUpload,false);
 assert.equal(result.canGenerateProof,false);
 assert.equal(result.canWriteAirtable,false);
 assert.equal(result.canSendEmail,false);
 assert.equal(result.requiresManualReview,true);
}
test('AVV Ja/Nein first reservation is one inert deterministic transaction patch',async()=>{
 for(const mode of ['Ja','Nein']){
  const offer=await accepted(mode);
  const first=await decide(offer);
  assert.equal(first.code,'RESERVED_REVIEW_ONLY');
  assert.equal(first.patch.receiptReviewLock.state,'HELD_FOR_REVIEW');
  assert.equal(first.patch.receiptReviewLock.attemptId,attemptA);
  assert.equal(first.patch.receiptReviewLock.idempotencyKey,
    offer.receiptReview.idempotencyKey);
  assert.equal(first.patch.receiptReviewLock.createdAt,now.toISOString());
  assert.equal(first.patch.receiptReviewLock.reviewDeadlineAt,
    new Date(now.getTime()+15*60*1000).toISOString());
  assert.deepEqual(first.patch.receiptReviewLock.downstream,offer.downstream);
  const copy=structuredClone(offer);
  const again=await decide(copy);
  assert.deepEqual(first,again);
  assert.equal('receiptReviewLock' in offer,false);
  assert.ok(!JSON.stringify(first).includes(offer.recipientEmail));
  assert.ok(!JSON.stringify(first).includes(offer.tokenHash));
  inert(first);
 }
});
test('two different attempts: one reservation, second blocked, same-attempt replay does not write',async()=>{
 const offer=await accepted();
 const first=await decide(offer,attemptA);
 assert.equal(first.code,'RESERVED_REVIEW_ONLY');
 const committed={...offer,...first.patch};
 const competing=await decide(committed,attemptB);
 assert.equal(competing.code,'LOCKED_BY_OTHER_ATTEMPT');
 assert.equal('patch' in competing,false);
 inert(competing);
 const retry=await decide(committed,attemptA);
 assert.equal(retry.code,'ALREADY_RESERVED_REVIEW_ONLY');
 assert.equal('patch' in retry,false);
 inert(retry);
});
test('review deadline is NOT automatic unlock even for the original attempt',async()=>{
 const offer=await accepted();
 const first=await decide(offer);
 const committed={...offer,...first.patch};
 for(const id of [attemptA,attemptB]){
  const expired=await decide(committed,id,new Date(now.getTime()+16*60*1000));
  assert.equal(expired.code,'MANUAL_RECONCILIATION_REQUIRED');
  assert.equal('patch' in expired,false);
  inert(expired);
 }
});
test('wrong provenance, unknown lock, token key, owner and clock fail closed',async()=>{
 const offer=await accepted();
 const cases=[
  o=>{o.status='sent';},o=>{o.source.kind='LIVE_CUSTOMER';},
  o=>{o.downstream.email='enabled';},
  o=>{o.evidence.quote_pdf_sha256='f'.repeat(64);},
  o=>{o.receiptReview.idempotencyKey='a'.repeat(64);}
 ];
 for(const mutation of cases){
  const copy=structuredClone(offer);mutation(copy);
  const result=await decide(copy);
  assert.ok(result.code.startsWith('NO_GO_'));
  assert.equal('patch' in result,false);inert(result);
 }
 for(const args of [
  {expectedReviewKey:'0'.repeat(64),attemptId:attemptA,now},
  {expectedReviewKey:offer.receiptReview.idempotencyKey,
   attemptId:'UNTRUSTED_ATTEMPT',now},
  {expectedReviewKey:offer.receiptReview.idempotencyKey,
   attemptId:attemptA,now:new Date('2020-01-01T00:00:00.000Z')}
 ]){
  const {decideSyntheticReceiptReviewLock}=await import(
   '../cloud-run/offer-portal-staging/receiptProcessingLock.mjs');
  const result=decideSyntheticReceiptReviewLock(offer,args);
  assert.equal(result.code,'NO_GO_INVALID_SYNTHETIC_REVIEW');inert(result);
 }
 const patch=(await decide(offer)).patch;
 for(const invalid of [
  {...patch.receiptReviewLock,state:'READY_TO_UPLOAD'},
  {...patch.receiptReviewLock,idempotencyKey:'f'.repeat(64)},
  {...patch.receiptReviewLock,reviewDeadlineAt:'2099-01-01T00:00:00.000Z'},
  {...patch.receiptReviewLock,downstream:{...offer.downstream,email:'enabled'}},
  null
 ]){
  const damaged={...offer,receiptReviewLock:invalid};
  const outcome=await decide(damaged,attemptB);
  assert.equal(outcome.code,'NO_GO_LOCK_STATE_INVALID');inert(outcome);
 }
});
test('Firestore write adapter refuses use without the exact local emulator',async()=>{
 const {createFirestoreOfferStore}=await import(
  '../cloud-run/offer-portal-staging/firestoreOfferStore.mjs');
 let calls=0;
 const db={projectId:'lszh-automations',databaseId:'lszh-offers-staging',
  collection:()=>({doc:()=>{calls++;throw Error('should not request DB');}}),
  runTransaction:()=>{calls++;throw Error('should not start transaction');}
 };
 const store=createFirestoreOfferStore(db),o=await accepted();
 await assert.rejects(()=>store.reserveSyntheticReceiptReview(
  o.tokenHash,o.receiptReview.idempotencyKey,attemptA,now),
  /local_emulator_required/);
 assert.equal(calls,0);
});
