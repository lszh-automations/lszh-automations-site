'use strict';
// Local demo-project Firestore emulator ONLY. Deliberately never calls Airtable.
// If K_SERVICE, real LSZH Google project or a remote emulator is configured,
// validateSettings prevents activation. All remote record fields are simulated.
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {validateSettings,EMULATOR_PROJECT}=require('../stagingFirestoreConnection');
const {TARGET,documentPath}=require('../stagingOfferSchema');
const {acquireLease,completeAfterVerifiedRemote,previewAirtableAcceptance,
 ReconciliationRejected,compareRemote,resolveUnknownOutcome}=require('../firestoreReconciliation');
let enabled=false;
try {
 validateSettings(process.env,'emulator');
 enabled=process.env.LSZH_RUN_EMULATOR_TRANSACTION_TEST==='I_UNDERSTAND_LOCAL_ONLY';
}catch{enabled=false;}
const H=c=>c.repeat(64);
const date=new Date('2026-10-15T12:00:00Z');
const doc=c=>({mimeType:'application/pdf',sha256:H(c),driveFileId:'1'.repeat(24),archiveVerified:true});
const mockAccepted=id=>{
 const proof={acceptedAt:'2026-10-15T11:00:00.000Z',actorName:'Test Muster',
  actorEmail:'fake-tester@example.invalid',authorized:true,acceptedTerms:true,
  acceptedAvv:true,offerNumber:'DEMO-OFF-20991231-999',termsVersion:'TEST_ONLY_TERMS',
  quoteSha256:H('2'),termsSha256:H('3'),avvSha256:H('4'),avvVersion:'TEST_ONLY_AVV'};
 return {schemaVersion:1,fixtureId:id,testOnly:true,status:'ACCEPTED',
  airtableRecordId:'recTEST0000000000',acceptedAt:proof.acceptedAt,
  acceptanceEvidence:proof,legallyApproved:true,acceptanceEnabled:true,
  deliveryConfirmed:true,archiveVerified:true,offerNumber:proof.offerNumber,
  termsVersion:proof.termsVersion,avvRequired:true,avvVersion:proof.avvVersion,
  documents:{offer:doc('2'),terms:doc('3'),avv:doc('4')},
  reconciliationStatus:'PENDING',reconciliationLease:null,reconciliationAttempts:0};
};
const remoteFrom=state=>({
 Offertennummer:state.offerNumber,'Projektbedingungen Version':state.termsVersion,
 'AVV erforderlich':'Ja','Online-Annahme Offerten-SHA256':state.documents.offer.sha256,
 'Online-Annahme Bedingungen-SHA256':state.documents.terms.sha256,
 'Online-Annahme AVV-SHA256':state.documents.avv.sha256,
 'Online-Annahme AVV-Version':state.avvVersion,
 Status:'Versendet','Vertragsunterlagen akzeptiert':false
});
test('emulator: lease only once, verified remote proof completes, stale worker blocked',
 {skip:!enabled},async()=>{
 const {Firestore}=require('@google-cloud/firestore');
 const a=new Firestore({projectId:EMULATOR_PROJECT,databaseId:TARGET.databaseId});
 const b=new Firestore({projectId:EMULATOR_PROJECT,databaseId:TARGET.databaseId});
 const id='LSZH-EMULATOR-'+crypto.randomBytes(12).toString('hex');
 const target=documentPath(id),ref=a.doc(target);
 try{
  await ref.create(mockAccepted(id));
  const args={documentPath:target,now:date,testMode:'offline-or-emulator-only'};
  const parallel=await Promise.allSettled([a,b].map(db=>acquireLease({...args,db})));
  assert.equal(parallel.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(parallel.filter(x=>x.status==='rejected').length,1);
  assert.equal(parallel.find(x=>x.status==='rejected').reason.reason,'busy');
  const lease=parallel.find(x=>x.status==='fulfilled').value;
  assert.equal(lease.acquired,true);
  const state=(await ref.get()).data();
  assert.equal(state.reconciliationStatus,'LEASED');
  assert.equal(state.reconciliationAttempts,1);
  const preview=previewAirtableAcceptance(state,target);
  const original=remoteFrom(state);
  assert.equal(compareRemote(original,preview),'PREVIEW_ONLY');
  await assert.rejects(completeAfterVerifiedRemote({...args,db:a,
    leaseId:lease.leaseId,remoteFields:original}),
    e=>e instanceof ReconciliationRejected&&e.reason==='remote_unverified');
  const response=await completeAfterVerifiedRemote({...args,db:b,
    leaseId:lease.leaseId,remoteFields:{...original,...preview.fields}});
  assert.equal(response.synced,true);assert.equal(response.sendConfirmation,false);
  assert.equal((await ref.get()).data().reconciliationStatus,'SYNCED');
  await assert.rejects(acquireLease({...args,db:b}),
    e=>e instanceof ReconciliationRejected&&e.reason==='already_synced');
 }finally{await ref.delete().catch(()=>{});await Promise.all([a.terminate(),b.terminate()]);}
});
test('emulator: crashed reconciliation lease requires review; never retry blindly',
 {skip:!enabled},async()=>{
 const {Firestore}=require('@google-cloud/firestore');
 const a=new Firestore({projectId:EMULATOR_PROJECT,databaseId:TARGET.databaseId});
 const b=new Firestore({projectId:EMULATOR_PROJECT,databaseId:TARGET.databaseId});
 const id='LSZH-EMULATOR-'+crypto.randomBytes(12).toString('hex');
 const target=documentPath(id),ref=a.doc(target);
 try {
  await ref.create(mockAccepted(id));
  const args={documentPath:target,testMode:'offline-or-emulator-only'};
  const lease=await acquireLease({...args,db:a,now:date});
  assert.equal(lease.acquired,true);
  const later=new Date(date.getTime()+130000);
  const outcome=await acquireLease({...args,db:b,now:later});
  assert.equal(outcome.acquired,false);
  assert.equal(outcome.manualReviewRequired,true);
  const state=(await ref.get()).data();
  assert.equal(state.reconciliationStatus,'NEEDS_REVIEW');
  assert.equal(state.reconciliationAttempts,1);
  assert.equal(state.reconciliationReviewReason,'LEASE_OUTCOME_UNKNOWN');
  await assert.rejects(acquireLease({...args,db:a,now:later}),
    e=>e instanceof ReconciliationRejected&&e.reason==='manual_review_required');
  // Simulate a previously succeeded remote update, subsequently re-read
  // from a trusted source. The recovery itself causes zero Airtable calls.
  const preview=previewAirtableAcceptance(state,target);
  await assert.rejects(resolveUnknownOutcome({...args,db:a,now:later,
    remoteFields:remoteFrom(state)}),
    e=>e instanceof ReconciliationRejected&&e.reason==='manual_review_required');
  assert.equal((await ref.get()).data().reconciliationStatus,'NEEDS_REVIEW');
  const recovered=await resolveUnknownOutcome({...args,db:b,now:later,
    remoteFields:{...remoteFrom(state),...preview.fields}});
  assert.equal(recovered.synced,true);
  assert.equal(recovered.sendConfirmation,false);
  assert.equal(recovered.recoveredFromUnknown,true);
  assert.equal((await ref.get()).data().reconciliationStatus,'SYNCED');
 }finally{await ref.delete().catch(()=>{});await Promise.all([a.terminate(),b.terminate()]);}
});
