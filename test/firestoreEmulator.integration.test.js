'use strict';
// Opt-in only. NEVER run against real Google Cloud, even with accidental credentials.
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {TARGET,documentPath}=require('../stagingOfferSchema');
const {claimOfferOnce}=require('../firestoreAcceptanceState');
const {LOCK_COLLECTION,bindingFingerprint}=require('../syntheticAirtableBinding');
const {mockAirtableOffer}=require('./helpers/mockAirtableOffer');
const {mockFrozenContract}=require('./helpers/mockContractFreeze');
const {COLLECTION:FREEZES}=require('../syntheticContractFreeze');
const {validateSettings,EMULATOR_PROJECT}=require('../stagingFirestoreConnection');
const config={...process.env};
let canTest=false;
try{validateSettings(config,'emulator');canTest=config.LSZH_RUN_EMULATOR_TRANSACTION_TEST==='I_UNDERSTAND_LOCAL_ONLY';}
catch {canTest=false;}
const H=c=>c.repeat(64);
const expected={tokenHash:H('1'),quoteSha256:H('2'),termsSha256:H('3'),avvSha256:H('4'),
  termsVersion:'TEST_ONLY_TERMS',avvVersion:'TEST_ONLY_AVV',offerNumber:'DEMO-OFF-20991231-999'};
const actor={name:'Test Muster',email:'fake-tester@example.invalid',authorized:true,acceptTerms:true,acceptAvv:true};
const doc=c=>({sha256:H(c),mimeType:'application/pdf',driveFileId:'1'.repeat(24),archiveVerified:true});
const initial=id=>({schemaVersion:1,fixtureId:id,testOnly:true,status:'ISSUED',
  acceptanceEnabled:true,legallyApproved:true,deliveryConfirmed:true,archiveVerified:true,
  acceptedAt:null,expiresAt:'2099-12-31T23:59:59Z',offerNumber:expected.offerNumber,
  termsVersion:expected.termsVersion,avvVersion:expected.avvVersion,avvRequired:true,
  tokenHash:expected.tokenHash,recipientEmail:actor.email,validUntil:'2099-12-31',
  documents:{offer:doc('2'),terms:doc('3'),avv:doc('4')}});
test('emulator: two independent SDK clients accept at most once', {skip:!canTest}, async()=>{
  // Lazy import: default npm test neither requires Firebase SDK nor contacts Google Cloud.
  const {Firestore}=require('@google-cloud/firestore');
  const a=new Firestore({projectId:EMULATOR_PROJECT,databaseId:TARGET.databaseId});
  const b=new Firestore({projectId:EMULATOR_PROJECT,databaseId:TARGET.databaseId});
  const defaultDb=new Firestore({projectId:EMULATOR_PROJECT,databaseId:'(default)'});
  const id='LSZH-EMULATOR-'+crypto.randomBytes(12).toString('hex');
  const document=documentPath(id);
  const ref=a.doc(document);
  const recordId='rec'+crypto.randomBytes(7).toString('hex');
  const bindingRef=a.doc(LOCK_COLLECTION+'/'+recordId);
  const dbFreeze=a.doc(FREEZES+'/'+id);
  // Emulator-only write; skip condition above excludes any non-loopback host.
  try{
    const state=initial(id);
    state.airtableRecordId=recordId;
    state.airtableBinding={source:'SYNTHETIC_READ_ONLY',schemaVersion:1,
      boundAt:'2026-10-15T10:00:00.000Z',
      fingerprint:bindingFingerprint(state,recordId)};
    const contract=mockFrozenContract(state);
    Object.assign(state,contract.state);
    await Promise.all([ref.create(state),dbFreeze.create(contract.freeze),bindingRef.create({fixtureId:id,recordId,
      fingerprint:state.airtableBinding.fingerprint,boundAt:state.airtableBinding.boundAt,
      syntheticOnly:true})]);
    const defaultRef=defaultDb.doc(document);
    assert.equal((await defaultRef.get()).exists,false,
      'Emulator did not isolate named Firestore database from (default)');
    const now=new Date('2026-10-15T12:00:00Z');
    // An originally bound Airtable offer has been changed just before claim.
    // A fresh readback must reject it before the Firestore status can change.
    const remote=mockAirtableOffer(state,'acceptance');
    await assert.rejects(claimOfferOnce({db:a,documentPath:document,expected,actor,now,
      airtableRecordId:recordId,
      readRecord:async()=>({...remote,fields:{...remote.fields,Status:'Entwurf'}})}),
      e=>e.reason==='readback_mismatch');
    assert.equal((await ref.get()).data().status,'ISSUED');
    const results=await Promise.allSettled([a,b].map(db=>claimOfferOnce({db,documentPath:document,expected,actor,now,
      airtableRecordId:recordId,readRecord:async()=>mockAirtableOffer(state,'acceptance')})));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.filter(r=>r.status==='rejected').length,1);
    const updated=(await ref.get()).data();
    assert.equal(updated.status,'ACCEPTED');
    assert.equal(updated.acceptanceEvidence.acceptedAvv,true);
    assert.equal(updated.reconciliationStatus,'PENDING');
    assert.equal(updated.acceptanceEvidence.avvSha256,H('4'));
    assert.equal((await defaultRef.get()).exists,false,
      'Named acceptance leaked into default database');
  }finally{
    await Promise.all([ref.delete().catch(()=>{}),bindingRef.delete().catch(()=>{}),dbFreeze.delete().catch(()=>{})]);
    await Promise.all([a.terminate(),b.terminate(),defaultDb.terminate()]);
  }
});
