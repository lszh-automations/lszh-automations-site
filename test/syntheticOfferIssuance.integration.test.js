'use strict';
// Opt-in LOCAL FIRESTORE EMULATOR only; never real Google Cloud.
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {validateSettings,EMULATOR_PROJECT}=require('../stagingFirestoreConnection');
const {TARGET,documentPath}=require('../stagingOfferSchema');
const {issueSyntheticOfferOnce}=require('../syntheticOfferIssuance');
const {bindSyntheticAirtableRecordOnce,LOCK_COLLECTION}=require('../syntheticAirtableBinding');
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
 const recordId='rec'+crypto.randomBytes(7).toString('hex');
 const bindingRef=a.doc(LOCK_COLLECTION+'/'+recordId);
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
  // Mandatory order: a verified synthetic Airtable record must be locked
  // before the token issuer can see any bindable offer.
  const mockRecord={id:recordId,fields:{
    Status:'Entwurf',Offertennummer:state.offerNumber,
    'Projektbedingungen Version':state.termsVersion,
    'Gültig bis':state.validUntil,'AVV erforderlich':'Ja',
    'Lead E-Mail':[state.recipientEmail],
    'Vertragsunterlagen akzeptiert':false,
    'Vertragsunterlagen versendet':false,
    'Online-Annahme rechtlich freigegeben':false,
    'Online-Annahme Offerten-SHA256':docs.offer.sha256,
    'Online-Annahme Offerten Drive ID':docs.offer.driveFileId,
    'Online-Annahme Bedingungen-SHA256':docs.terms.sha256,
    'Online-Annahme Bedingungen Drive ID':docs.terms.driveFileId,
    'Online-Annahme AVV-SHA256':docs.avv.sha256,
    'Online-Annahme AVV Drive ID':docs.avv.driveFileId,
    'Online-Annahme AVV-Version':state.avvVersion
  }};
  const bound=await bindSyntheticAirtableRecordOnce({
    db:a,fixtureId,airtableRecordId:recordId,
    readRecord:async()=>mockRecord,testMode:'offline-or-emulator-only',now});
  assert.equal(bound.bound,true);
  assert.equal((await bindingRef.get()).data().fixtureId,fixtureId);
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
  await bindingRef.delete().catch(()=>{});
  await Promise.all([a.terminate(),b.terminate(),standard.terminate()]);
 }
});
