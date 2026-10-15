'use strict';
// Opt-in LOCAL FIRESTORE EMULATOR only; never real Google Cloud.
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {validateSettings,EMULATOR_PROJECT}=require('../stagingFirestoreConnection');
const {TARGET,documentPath}=require('../stagingOfferSchema');
const {issueSyntheticOfferOnce}=require('../syntheticOfferIssuance');
const {claimOfferOnce,ClaimRejected}=require('../firestoreAcceptanceState');
let enabled=false;
try{
 validateSettings(process.env,'emulator');
 enabled=process.env.LSZH_RUN_EMULATOR_TRANSACTION_TEST==='I_UNDERSTAND_LOCAL_ONLY';
}catch{enabled=false;}
const pdf=s=>Buffer.from('%PDF-1.7\nSYNTHETIC TEST '+s+'\n%%EOF');
const bytes={offer:pdf('QUOTE'),terms:pdf('TERMS'),avv:pdf('AVV')};
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const now=new Date('2026-10-15T12:00:00Z');
const expiresAt=new Date('2026-10-16T12:00:00Z');
test('emulator: two independent issuers generate exactly one non-deliverable token', {skip:!enabled},async()=>{
 const {Firestore}=require('@google-cloud/firestore');
 const a=new Firestore({projectId:EMULATOR_PROJECT,databaseId:TARGET.databaseId});
 const b=new Firestore({projectId:EMULATOR_PROJECT,databaseId:TARGET.databaseId});
 const standard=new Firestore({projectId:EMULATOR_PROJECT,databaseId:'(default)'});
 const fixtureId='LSZH-EMULATOR-'+crypto.randomBytes(12).toString('hex');
 const document=documentPath(fixtureId);
 const ref=a.doc(document);
 const docs=Object.fromEntries(Object.entries(bytes).map(([kind,content])=>[kind,{
  mimeType:'application/pdf',sha256:hash(content),driveFileId:'1'.repeat(24),
  archiveVerified:true}]));
 const state={schemaVersion:1,fixtureId,offerNumber:'DEMO-OFF-20991231-999',
  testOnly:true,status:'TEST_DRAFT_NOT_SENT',recipientEmail:'fake-tester@example.invalid',
  validUntil:'2099-12-31',termsVersion:'TEST_ONLY_TERMS',avvRequired:true,
  avvVersion:'TEST_ONLY_AVV',documents:docs,tokenHash:null,issuedAt:null,
  expiresAt:null,acceptedAt:null,acceptanceEvidence:null,
  reconciliationStatus:'NOT_STARTED',legallyApproved:false,
  acceptanceEnabled:false,deliveryEnabled:false,deliveryConfirmed:false,
  archiveVerified:true,requiresManualReview:true};
 try{
  await ref.create(state);
  assert.equal((await standard.doc(document).get()).exists,false);
  const input={fixtureId,archiveBytes:bytes,now,expiresAt,testMode:'offline-or-emulator-only'};
  const results=await Promise.allSettled([a,b].map(db=>issueSyntheticOfferOnce({...input,db})));
  const success=results.filter(r=>r.status==='fulfilled');
  const failed=results.filter(r=>r.status==='rejected');
  assert.equal(success.length,1);assert.equal(failed.length,1);
  assert.equal(failed[0].reason.reason,'already_issued');
  const token=success[0].value.token;
  assert.match(token,/^[A-Za-z0-9_-]{43}$/);
  const stored=(await ref.get()).data();
  assert.equal(stored.tokenHash,hash(token));
  assert.equal(stored.status,'TEST_ISSUED_NOT_DELIVERED');
  assert.equal(stored.deliveryConfirmed,false);
  assert.equal(stored.acceptanceEnabled,false);
  assert.equal(stored.legallyApproved,false);
  assert.equal(stored.reconciliationStatus,'NOT_STARTED');
  assert.ok(!JSON.stringify(stored).includes(token));
  assert.equal((await standard.doc(document).get()).exists,false);
  // Issued synthetic fixture MUST NOT become an accepted legal contract.
  await assert.rejects(claimOfferOnce({db:b,documentPath:document,
   expected:{tokenHash:hash(token),quoteSha256:hash(bytes.offer),termsSha256:hash(bytes.terms),
     avvSha256:hash(bytes.avv),offerNumber:state.offerNumber,
     termsVersion:state.termsVersion,avvVersion:state.avvVersion},
   actor:{name:'Test Muster',email:state.recipientEmail,authorized:true,
     acceptTerms:true,acceptAvv:true},now}),ClaimRejected);
  assert.equal((await ref.get()).data().status,'TEST_ISSUED_NOT_DELIVERED');
 }finally{
  await ref.delete().catch(()=>{});
  await Promise.all([a.terminate(),b.terminate(),standard.terminate()]);
 }
});
