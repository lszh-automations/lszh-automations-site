'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {eventId,previewAirtableAcceptance,compareRemote,acquireLease,
 completeAfterVerifiedRemote,resolveUnknownOutcome,ReconciliationRejected}=require('../firestoreReconciliation');
const id='LSZH-EMULATOR-20261015AAAA';
const documentPath='stagingOfferFixtures/'+id;
const H=x=>x.repeat(64);
const now=new Date('2026-10-15T12:00:00Z');
const args={documentPath,now,testMode:'offline-or-emulator-only'};
function accepted(changes={}){
 const e={acceptedAt:'2026-10-15T11:00:00.000Z',actorName:'Test Muster',
   actorEmail:'fake-tester@example.invalid',authorized:true,acceptedTerms:true,
   acceptedAvv:true,offerNumber:'DEMO-OFF-20991231-999',
   termsVersion:'TEST_ONLY_TERMS',quoteSha256:H('2'),termsSha256:H('3'),
   avvSha256:H('4'),avvVersion:'TEST_ONLY_AVV'};
 const doc=x=>({mimeType:'application/pdf',sha256:H(x),
   driveFileId:'1'.repeat(24),archiveVerified:true});
 return {schemaVersion:1,fixtureId:id,testOnly:true,status:'ACCEPTED',
   legallyApproved:true,acceptanceEnabled:true,deliveryConfirmed:true,
   archiveVerified:true,airtableRecordId:'recTEST0000000000',
   acceptedAt:e.acceptedAt,acceptanceEvidence:e,termsVersion:e.termsVersion,
   offerNumber:e.offerNumber,avvRequired:true,avvVersion:'TEST_ONLY_AVV',
   reconciliationStatus:'PENDING',reconciliationLease:null,
   documents:{offer:doc('2'),terms:doc('3'),avv:doc('4')},...changes};
}
function originalRemote(s=accepted()){
 const e=s.acceptanceEvidence;
 return {'Offertennummer':e.offerNumber,'Projektbedingungen Version':e.termsVersion,
   'Online-Annahme Offerten-SHA256':e.quoteSha256,
   'Online-Annahme Bedingungen-SHA256':e.termsSha256,
   'Online-Annahme AVV-SHA256':e.avvSha256,
   'Online-Annahme AVV-Version':e.avvVersion,'AVV erforderlich':s.avvRequired?'Ja':'Nein',
   Status:'Versendet','Vertragsunterlagen akzeptiert':false};
}
function fake(initial=accepted()){
 let state=structuredClone(initial),writes=0,serial=Promise.resolve();
 const db={doc:path=>({path}),runTransaction:fn=>{
   const job=serial.then(async()=>{
     let patch=null;
     const tx={get:async()=>({exists:state!=null,data:()=>structuredClone(state)}),
       update:(ref,values)=>{assert.equal(ref.path,documentPath);patch=structuredClone(values);}};
     const value=await fn(tx);
     if(patch){state={...state,...patch};writes++;}
     return value;
   });serial=job.catch(()=>{});return job;
 }};
 return {db,read:()=>structuredClone(state),writes:()=>writes};
}
function assertRejected(e,reason){assert.ok(e instanceof ReconciliationRejected);assert.equal(e.reason,reason);return true;}
test('projection uses existing schema only and never enables email or Make',()=>{
 const s=accepted(), p=previewAirtableAcceptance(s,documentPath);
 assert.equal(p.mode,'OFFLINE_PREVIEW_ONLY');
 assert.equal(p.recordId,'recTEST0000000000');
 assert.equal(p.fields.Status,'Angenommen');
 assert.equal(p.fields['Vertragsunterlagen akzeptiert'],true);
 assert.equal(p.fields['Online-Annahme AVV ausdrücklich akzeptiert'],true);
 assert.equal(p.mailEnabled,false);assert.equal(p.makeEnabled,false);
 assert.equal(p.eventId,eventId(s,documentPath));
 assert.match(p.eventId,/^lszh-staging-accept-[a-f0-9]{64}$/);
 assert.equal(p.fields['Online-Annahme Nachweis'].includes('fake-tester@'),false);
 assert.equal(p.fields['Online-Annahme Nachweis'].includes('token'),false);
});
test('remote compare only permits exact source contract and explicit unchanged status',()=>{
 const s=accepted(),p=previewAirtableAcceptance(s,documentPath);
 const old=originalRemote(s);
 assert.equal(compareRemote(old,p),'PREVIEW_ONLY');
 const applied={...old,...p.fields};
 assert.equal(compareRemote(applied,p),'ALREADY_APPLIED');
 assert.equal(compareRemote({...applied,'Online-Annahme Person':'changed'},p),'MANUAL_REVIEW');
 assert.equal(compareRemote({...old,'Projektbedingungen Version':'OTHER'},p),'MANUAL_REVIEW');
 assert.equal(compareRemote({...old,'Online-Annahme Offerten-SHA256':H('f')},p),'MANUAL_REVIEW');
 assert.equal(compareRemote({...old,'AVV erforderlich':'Nein'},p),'MANUAL_REVIEW');
 assert.equal(compareRemote({...old,'Online-Annahme AVV-SHA256':H('f')},p),'MANUAL_REVIEW');
 assert.equal(compareRemote({...old,Status:'Angenommen'},p),'MANUAL_REVIEW');
 assert.equal(compareRemote({...old,'Vertragsunterlagen akzeptiert':true},p),'MANUAL_REVIEW');
 assert.equal(compareRemote({...old,'Online-Annahme Zeitstempel':'2026-10-15T01:00:00Z'},p),'MANUAL_REVIEW');
 assert.equal(compareRemote({},p),'MANUAL_REVIEW');
 assert.equal(compareRemote(null,p),'MANUAL_REVIEW');
});
test('two concurrent leases: exactly one winner, zero external effects',async()=>{
 const s=fake();
 const rs=await Promise.allSettled([acquireLease({...args,db:s.db}),
    acquireLease({...args,db:s.db})]);
 assert.equal(rs.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(rs.filter(r=>r.status==='rejected').length,1);
 assertRejected(rs.find(r=>r.status==='rejected').reason,'busy');
 assert.equal(s.writes(),1);
 assert.equal(s.read().reconciliationStatus,'LEASED');
 assert.equal(s.read().reconciliationAttempts,1);
 assert.equal(s.read().reconciliationLease.eventId,eventId(s.read(),documentPath));
});
test('ack requires matching lease AND observed exact remote marker',async()=>{
 const s=fake();
 const l=await acquireLease({...args,db:s.db});
 const p=previewAirtableAcceptance(s.read(),documentPath);
 const remote=originalRemote(s.read());
 const missing=completeAfterVerifiedRemote({...args,db:s.db,leaseId:l.leaseId,remoteFields:remote});
 await assert.rejects(missing,e=>assertRejected(e,'remote_unverified'));
 assert.equal(s.read().reconciliationStatus,'LEASED');
 await assert.rejects(completeAfterVerifiedRemote({...args,db:s.db,
   leaseId:'0'.repeat(32),remoteFields:{...remote,...p.fields}}),
   e=>assertRejected(e,'stale_lease'));
 const result=await completeAfterVerifiedRemote({...args,db:s.db,
   leaseId:l.leaseId,remoteFields:{...remote,...p.fields}});
 assert.equal(result.synced,true);assert.equal(result.sendConfirmation,false);
 assert.equal(s.read().reconciliationStatus,'SYNCED');
 assert.equal(s.read().reconciliationLease,null);
 assert.equal(s.read().reconciliationEventId,p.eventId);
 await assert.rejects(acquireLease({...args,db:s.db}),e=>assertRejected(e,'already_synced'));
});
test('expired lease goes to human review instead of automatic duplicate PATCH',async()=>{
 const s=fake(), lease=await acquireLease({...args,db:s.db});
 const later=new Date(now.getTime()+121000);
 const result=await acquireLease({...args,db:s.db,now:later});
 assert.deepEqual(result,{acquired:false,manualReviewRequired:true});
 assert.equal(s.read().reconciliationStatus,'NEEDS_REVIEW');
 assert.equal(s.read().reconciliationReviewReason,'LEASE_OUTCOME_UNKNOWN');
 await assert.rejects(acquireLease({...args,db:s.db,now:later}),e=>assertRejected(e,'manual_review_required'));
 await assert.rejects(completeAfterVerifiedRemote({...args,db:s.db,now:later,
   leaseId:lease.leaseId,remoteFields:{...originalRemote(),...previewAirtableAcceptance(accepted(),documentPath).fields}}),
   e=>assertRejected(e,'stale_lease'));
});
test('expired worker cannot acknowledge an unverified record',async()=>{
 const s=fake(),lease=await acquireLease({...args,db:s.db});
 const later=new Date(now.getTime()+121000);
 await assert.rejects(completeAfterVerifiedRemote({...args,db:s.db,now:later,
   leaseId:lease.leaseId,remoteFields:{...originalRemote(),...previewAirtableAcceptance(accepted(),documentPath).fields}}),
   e=>assertRejected(e,'lease_expired'));
 assert.equal(s.read().reconciliationStatus,'LEASED');
});
test('never reconcile draft, pending, mismatching evidence, real or missing source IDs',async()=>{
 for(const changed of [
  {status:'TEST_DRAFT_NOT_SENT'},
  {status:'ISSUED'},
  {schemaVersion:2},{testOnly:false},
  {legallyApproved:false},{acceptedAt:null},{acceptanceEvidence:null},
  {airtableRecordId:null},{airtableRecordId:'recNO'},
  {documents:{...accepted().documents,offer:{...accepted().documents.offer,sha256:H('f')}}},
  {reconciliationStatus:'NOT_STARTED'}
 ]){
  const s=fake(accepted(changed));
  await assert.rejects(acquireLease({...args,db:s.db}),e=>assertRejected(e,'not_eligible'));
  assert.equal(s.writes(),0);
 }
});
test('without AVV projection never falsely records explicit AVV acceptance',()=>{
 const s=accepted({avvRequired:false,avvVersion:null,
   documents:{offer:accepted().documents.offer,terms:accepted().documents.terms},
   acceptanceEvidence:{...accepted().acceptanceEvidence,acceptedAvv:false,
     avvSha256:undefined,avvVersion:undefined}});
 const p=previewAirtableAcceptance(s,documentPath);
 assert.equal(p.fields['Online-Annahme AVV ausdrücklich akzeptiert'],false);
 assert.equal(compareRemote(originalRemote(s),p),'PREVIEW_ONLY');
});
test('wrong environment or invalid test scope rejects before Firestore client call',async()=>{
 const s=fake();
 await assert.rejects(acquireLease({...args,db:s.db,testMode:'production'}),e=>assertRejected(e,'invalid_input'));
 await assert.rejects(acquireLease({...args,db:s.db,documentPath:'stagingOfferFixtures/REALCUSTOMER12345'}),e=>assertRejected(e,'invalid_input'));
 const prev={K_SERVICE:process.env.K_SERVICE,GOOGLE_CLOUD_PROJECT:process.env.GOOGLE_CLOUD_PROJECT};
 try{
  process.env.K_SERVICE='lszh-offer-acceptance-staging';
  await assert.rejects(acquireLease({...args,db:s.db}),e=>assertRejected(e,'not_test_environment'));
  delete process.env.K_SERVICE;
  process.env.GOOGLE_CLOUD_PROJECT='lszh-automations';
  await assert.rejects(acquireLease({...args,db:s.db}),e=>assertRejected(e,'not_test_environment'));
 }finally{
  for(const [k,v]of Object.entries(prev)){
   if(v===undefined)delete process.env[k];else process.env[k]=v;
  }
 }
 assert.equal(s.writes(),0);
});

test('unknown outcome recovers ONLY when independent remote proof matches exact event',async()=>{
 const s=fake(),lease=await acquireLease({...args,db:s.db});
 assert.equal(lease.acquired,true);
 await acquireLease({...args,db:s.db,now:new Date(now.getTime()+125000)});
 const state=s.read(),p=previewAirtableAcceptance(state,documentPath);
 const before=s.writes();
 await assert.rejects(resolveUnknownOutcome({...args,db:s.db,now:new Date(now.getTime()+125000),
   remoteFields:originalRemote(state)}),e=>assertRejected(e,'manual_review_required'));
 assert.equal(s.writes(),before);
 const recovery=await resolveUnknownOutcome({...args,db:s.db,now:new Date(now.getTime()+125000),
   remoteFields:{...originalRemote(state),...p.fields}});
 assert.equal(recovery.synced,true);
 assert.equal(recovery.recoveredFromUnknown,true);
 assert.equal(recovery.sendConfirmation,false);
 assert.equal(s.read().reconciliationStatus,'SYNCED');
 assert.equal(s.read().reconciliationReviewReason,null);
 await assert.rejects(resolveUnknownOutcome({...args,db:s.db,remoteFields:{...originalRemote(),...p.fields}}),
   e=>assertRejected(e,'not_eligible'));
});
test('a mismatching remote acceptance marker is never called verified',async()=>{
 const s=fake(),l=await acquireLease({...args,db:s.db});
 const p=previewAirtableAcceptance(s.read(),documentPath);
 const remote={...originalRemote(),...p.fields,
   'Online-Annahme Nachweis':JSON.stringify({eventId:'another-acceptance'})};
 await assert.rejects(completeAfterVerifiedRemote({...args,db:s.db,
   leaseId:l.leaseId,remoteFields:remote}),e=>assertRejected(e,'remote_unverified'));
 assert.equal(s.read().reconciliationStatus,'LEASED');
});
