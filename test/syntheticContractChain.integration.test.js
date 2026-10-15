'use strict';
// Complete, strictly non-deliverable synthetic chain in local demo Firestore.
// This does NOT model customer delivery/legal approval or a real Airtable PATCH.
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {validateSettings,EMULATOR_PROJECT}=require('../stagingFirestoreConnection');
const {TARGET,documentPath}=require('../stagingOfferSchema');
const {LOCK_COLLECTION,bindSyntheticAirtableRecordOnce}=require('../syntheticAirtableBinding');
const {COLLECTION:FREEZES,prepareSyntheticContractManifest,
 freezeSyntheticContractOnce}=require('../syntheticContractFreeze');
const {issueSyntheticOfferOnce}=require('../syntheticOfferIssuance');
const {claimOfferOnce,ClaimRejected}=require('../firestoreAcceptanceState');
const {previewAirtableAcceptance}=require('../firestoreReconciliation');
const {mockAirtableOffer}=require('./helpers/mockAirtableOffer');
let enabled=false;
try{
 validateSettings(process.env,'emulator');
 enabled=process.env.LSZH_RUN_EMULATOR_TRANSACTION_TEST==='I_UNDERSTAND_LOCAL_ONLY';
}catch{enabled=false;}
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const pdf=x=>Buffer.from('%PDF-1.7\nSynthetic '+x+'\n%%EOF');
const archiveBytes={offer:pdf('offer'),terms:pdf('terms'),avv:pdf('avv')};
const now=new Date('2026-10-15T12:00:00Z');
test('emulator: binding -> PDF freeze -> one issuance -> impossible acceptance/reconciliation',
 {skip:!enabled},async()=>{
 const {Firestore}=require('@google-cloud/firestore');
 const a=new Firestore({projectId:EMULATOR_PROJECT,databaseId:TARGET.databaseId});
 const b=new Firestore({projectId:EMULATOR_PROJECT,databaseId:TARGET.databaseId});
 const fixtureId='LSZH-EMULATOR-'+crypto.randomBytes(12).toString('hex');
 const recordId='rec'+crypto.randomBytes(7).toString('hex');
 const reference=a.doc(documentPath(fixtureId));
 const bindRef=a.doc(LOCK_COLLECTION+'/'+recordId);
 const freezeRef=a.doc(FREEZES+'/'+fixtureId);
 const documents=Object.fromEntries(Object.entries(archiveBytes).map(([kind,bytes])=>
  [kind,{mimeType:'application/pdf',archiveVerified:true,
   sha256:hash(bytes),driveFileId:'1'.repeat(24)}]));
 const draft={schemaVersion:1,testOnly:true,fixtureId,
  offerNumber:'DEMO-OFF-20991231-999',recipientEmail:'fake-tester@example.invalid',
  validUntil:'2099-12-31',termsVersion:'TEST_ONLY_TERMS',
  avvRequired:true,avvVersion:'TEST_ONLY_AVV',documents,
  status:'TEST_DRAFT_NOT_SENT',tokenHash:null,issuedAt:null,expiresAt:null,
  acceptedAt:null,acceptanceEvidence:null,reconciliationStatus:'NOT_STARTED',
  legallyApproved:false,acceptanceEnabled:false,deliveryEnabled:false,
  deliveryConfirmed:false,requiresManualReview:true,archiveVerified:true,
  airtableRecordId:null,airtableBinding:null};
 const mockRecord=mockAirtableOffer({...draft,airtableRecordId:recordId});
 try{
  await reference.create(draft);
  const bind=await bindSyntheticAirtableRecordOnce({
   db:a,fixtureId,airtableRecordId:recordId,testMode:'offline-or-emulator-only',
   now,readRecord:async()=>mockRecord});
  assert.equal(bind.bound,true);
  const state=(await reference.get()).data();
  const prepared=prepareSyntheticContractManifest({state,archiveBytes,
   revisions:{offer:'revSyntheticOffer0001',terms:'revSyntheticTerms0001',
    avv:'revSyntheticAVV000001'},testMode:'offline-or-emulator-only'});
  const frozen=await freezeSyntheticContractOnce({db:b,fixtureId,prepared,
    testMode:'offline-or-emulator-only',now});
  assert.equal(frozen.manifestHash,prepared.manifestHash);
  const issueInputs={fixtureId,airtableRecordId:recordId,archiveBytes,now,
   expiresAt:new Date('2026-10-16T12:00:00Z'),testMode:'offline-or-emulator-only',
   readRecord:async()=>mockRecord};
  const results=await Promise.allSettled([a,b].map(db=>
   issueSyntheticOfferOnce({...issueInputs,db})));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.filter(x=>x.status==='rejected').length,1);
  const plaintext=results.find(x=>x.status==='fulfilled').value.token;
  const issued=(await reference.get()).data();
  assert.equal(issued.status,'TEST_ISSUED_NOT_DELIVERED');
  assert.equal(issued.contractManifestHash,prepared.manifestHash);
  assert.equal(issued.tokenHash,hash(plaintext));
  assert.equal(issued.deliveryEnabled,false);
  assert.equal(issued.acceptanceEnabled,false);
  assert.equal(issued.legallyApproved,false);
  assert.equal((await freezeRef.get()).data().manifestHash,prepared.manifestHash);
  await assert.rejects(claimOfferOnce({db:a,documentPath:documentPath(fixtureId),
   airtableRecordId:recordId,readRecord:async()=>mockRecord,
   expected:{tokenHash:hash(plaintext),
    quoteSha256:hash(archiveBytes.offer),termsSha256:hash(archiveBytes.terms),
    avvSha256:hash(archiveBytes.avv),offerNumber:draft.offerNumber,
    termsVersion:draft.termsVersion,avvVersion:draft.avvVersion},
   actor:{name:'Test Muster',email:draft.recipientEmail,
    authorized:true,acceptTerms:true,acceptAvv:true},now}),ClaimRejected);
  assert.equal((await reference.get()).data().status,'TEST_ISSUED_NOT_DELIVERED');
  assert.throws(()=>previewAirtableAcceptance(issued,documentPath(fixtureId)));
 }finally{
  await Promise.all([reference.delete().catch(()=>{}),bindRef.delete().catch(()=>{}),
   freezeRef.delete().catch(()=>{})]);
  await Promise.all([a.terminate(),b.terminate()]);
 }
});
