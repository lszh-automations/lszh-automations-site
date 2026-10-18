'use strict';
// Pure contract tests. No Make activation, HTTP endpoints, PDF creation or GCP.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const sha=x=>createHash('sha256').update(x).digest('hex');
const ATTEMPT_A='TEST_ATTEMPT_AAAA123456789012';
const ATTEMPT_B='TEST_ATTEMPT_BBBB123456789012';
const CHANNEL='LSZH_MAKE_RECEIPT_REVIEW_STAGING_V1';
const AT='2026-10-18T12:00:00.000Z';

async function fixture(mode='Ja'){
 const {buildSyntheticReceiptReview}=await import(
  '../cloud-run/offer-portal-staging/receiptRecoveryReview.mjs');
 const quote='a'.repeat(64),terms='b'.repeat(64),avv='c'.repeat(64);
 const offer={
  status:'accepted',approved:true,revision:2,acceptedAt:AT,
  tokenHash:sha('SYNTHETIC_TEST_ONLY_HASH_NOT_RAW_LINK'),
  recipientEmail:'synthetic@example.invalid',
  offerNumber:'TEST_MAKE_BRIDGE_20261018_NO_CONTRACT',
  termsVersion:'TEST_v1.0_RC1',
  source:{kind:'LSZH_SYNTHETIC_ONLY',baseId:'appzJiskpAdaR1HEv',
   tableId:'tbljeIUoD7wwKuSmS',recordId:'rec12345678901234'},
  bundle:{avv_required:mode,quote:{sha256:quote},terms:{sha256:terms},
   ...(mode==='Ja'?{avv:{sha256:avv}}:{})},
  downstream:{airtable:'disabled',proofPdf:'disabled',email:'disabled'}
 };
 offer.evidence={
  accepted_at_utc:AT,authorized_confirmed:true,terms_confirmed:true,
  quote_pdf_sha256:quote,terms_pdf_sha256:terms,
  avv_required:mode==='Ja',avv_confirmed:mode==='Ja',
  avv_pdf_sha256:mode==='Ja'?avv:null
 };
 offer.receiptReview=buildSyntheticReceiptReview(offer,offer.evidence,AT);
 return offer;
}
function request(offer,attemptId=ATTEMPT_A){
 return {schemaVersion:1,channel:CHANNEL,syntheticOnly:true,
  sourceRecordId:offer.source.recordId,
  receiptReviewKey:offer.receiptReview.idempotencyKey,attemptId};
}
const load=()=>import('../cloud-run/offer-portal-staging/receiptMakeReservationContract.mjs');
function blocked(result){
 assert.equal(result.stopBeforeModule,5);
 assert.equal(result.manualReviewRequired,true);
 for(const flag of ['canCreateGoogleDoc','canExportPdf','canUpload',
  'canWriteFirestore','canWriteAirtable','canSendEmail'])
  assert.equal(result[flag],false,flag+' not authorised');
 assert.ok(!JSON.stringify(result).includes('synthetic@example.invalid'));
}
test('Make request is exact and matches server-trusted synthetic AVV Ja/Nein',async()=>{
 const {prepareSyntheticMakeReceiptReservation:prepare}=await load();
 for(const mode of ['Ja','Nein']){
  const offer=await fixture(mode),payload=request(offer);
  const outcome=prepare(offer,payload);
  assert.equal(outcome.status,'VALIDATED_OFFLINE_ONLY');
  assert.equal(outcome.requiresAuthenticatedInternalService,true);
  assert.equal(outcome.requiresTrustedFirestoreLookup,true);
  assert.equal(outcome.requiresEmulatorOnlyReservation,true);
  assert.equal(outcome.sourceRecordId,offer.source.recordId);
  assert.equal(outcome.receiptReviewKey,offer.receiptReview.idempotencyKey);
  assert.ok(!('tokenHash' in outcome));
  assert.ok(!JSON.stringify(outcome).includes(offer.tokenHash));
  assert.deepEqual(outcome,prepare(structuredClone(offer),structuredClone(payload)));
  blocked(outcome);
 }
});
test('Make-facing result always stops before Docs even after a winning reservation',async()=>{
 const {describeSyntheticMakeReservationResult:describe}=await load();
 const offer=await fixture(),payload=request(offer);
 for(const code of [
  'RESERVED_REVIEW_ONLY','ALREADY_RESERVED_REVIEW_ONLY',
  'LOCKED_BY_OTHER_ATTEMPT','MANUAL_RECONCILIATION_REQUIRED',
  'NO_GO_INVALID_SYNTHETIC_REVIEW','NO_GO_LOCK_STATE_INVALID'
 ]){
  const result=describe(offer,payload,code);
  assert.equal(result.status,'STOP_REVIEW_ONLY');
  assert.equal(result.reservationResult,code);
  assert.equal(result.sourceRecordId,offer.source.recordId);
  assert.ok(!('attemptId' in result),'attempt must not be reflected to Make');
  blocked(result);
 }
 const b=request(offer,ATTEMPT_B);
 assert.equal(describe(offer,b,'LOCKED_BY_OTHER_ATTEMPT').status,'STOP_REVIEW_ONLY');
});
test('unknown and attacker-supplied status or extra properties fail closed',async()=>{
 const {prepareSyntheticMakeReceiptReservation:prepare,
  describeSyntheticMakeReservationResult:describe}=await load();
 const offer=await fixture(),valid=request(offer);
 for(const unknown of ['SUCCESS','READY_TO_CREATE_DOC',
  'RESERVED_REVIEW_ONLY;READY','',null,undefined,{},true])
  {const r=describe(offer,valid,unknown);
   assert.equal(r.status,'NO_GO');blocked(r);}
 const invalid=[
  null,{},[],
  {...valid,extra:'unexpected'},
  {...valid,channel:'PUBLIC_WEBHOOK'},
  {...valid,schemaVersion:2},
  {...valid,syntheticOnly:false},
  {...valid,sourceRecordId:'rec00000000000000'},
  {...valid,receiptReviewKey:'0'.repeat(64)},
  {...valid,attemptId:'MAKE_CURRENT_RUN_ID'},
  {...valid,attemptId:'TEST_ATTEMPT_tooshort'},
  {...valid,token:'SYNTHETIC_NOT_ALLOWED'},
  {...valid,canCreateGoogleDoc:true}
 ];
 for(const payload of invalid){
  const result=prepare(offer,payload);
  assert.equal(result.status,'NO_GO');blocked(result);
  const mapped=describe(offer,payload,'RESERVED_REVIEW_ONLY');
  assert.equal(mapped.status,'NO_GO');blocked(mapped);
 }
});
test('fake or already-modified Firestore offer never grants a Make result',async()=>{
 const {prepareSyntheticMakeReceiptReservation:prepare}=await load();
 const offer=await fixture(),req=request(offer);
 const changes=[
  x=>{x.status='sent';},
  x=>{x.source.kind='LSZH_CUSTOMER';},
  x=>{x.source.baseId='appForeign';},
  x=>{x.downstream.email='enabled';},
  x=>{x.receiptReview.idempotencyKey='f'.repeat(64);},
  x=>{x.receiptReview.receiptDriveId='1AlreadyExistingDriveReceipt00000001';},
  x=>{x.evidence.terms_pdf_sha256='e'.repeat(64);}
 ];
 for(const change of changes){
  const changed=structuredClone(offer);change(changed);
  const result=prepare(changed,req);
  assert.equal(result.status,'NO_GO');blocked(result);
 }
});
test('two synthetic requests yield same trusted key but never permission to run Make modules',async()=>{
 const {prepareSyntheticMakeReceiptReservation:prepare}=await load();
 const offer=await fixture();
 const a=prepare(offer,request(offer,ATTEMPT_A));
 const b=prepare(offer,request(offer,ATTEMPT_B));
 assert.equal(a.status,'VALIDATED_OFFLINE_ONLY');
 assert.equal(b.status,'VALIDATED_OFFLINE_ONLY');
 assert.equal(a.receiptReviewKey,b.receiptReviewKey);
 assert.notEqual(a.attemptId,b.attemptId);
 blocked(a);blocked(b);
});
