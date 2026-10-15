'use strict';
// REAL Firestore transactions only against local, demo-project emulator.
// Airtable records are completely synthetic in-memory fixtures: no network.
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {validateSettings,EMULATOR_PROJECT}=require('../stagingFirestoreConnection');
const {TARGET,documentPath}=require('../stagingOfferSchema');
const {bindSyntheticAirtableRecordOnce,LOCK_COLLECTION}=require('../syntheticAirtableBinding');
let enabled=false;
try{
 validateSettings(process.env,'emulator');
 enabled=process.env.LSZH_RUN_EMULATOR_TRANSACTION_TEST==='I_UNDERSTAND_LOCAL_ONLY';
}catch{enabled=false;}
const sha=c=>c.repeat(64);
const docs={
 offer:{sha256:sha('2'),driveFileId:'1'.repeat(24),mimeType:'application/pdf',archiveVerified:true},
 terms:{sha256:sha('3'),driveFileId:'2'.repeat(24),mimeType:'application/pdf',archiveVerified:true},
 avv:{sha256:sha('4'),driveFileId:'3'.repeat(24),mimeType:'application/pdf',archiveVerified:true}
};
const state=id=>({fixtureId:id,schemaVersion:1,testOnly:true,status:'TEST_DRAFT_NOT_SENT',
 offerNumber:'DEMO-OFF-20991231-999',recipientEmail:'fake-tester@example.invalid',
 validUntil:'2099-12-31',termsVersion:'TEST_ONLY_TERMS',
 avvRequired:true,avvVersion:'TEST_ONLY_AVV',documents:docs,
 tokenHash:null,issuedAt:null,expiresAt:null,acceptedAt:null,acceptanceEvidence:null,
 reconciliationStatus:'NOT_STARTED',legallyApproved:false,acceptanceEnabled:false,
 deliveryEnabled:false,deliveryConfirmed:false,requiresManualReview:true});
const record=id=>({id,fields:{
 Status:'Entwurf',Offertennummer:'DEMO-OFF-20991231-999',
 'Projektbedingungen Version':'TEST_ONLY_TERMS','Gültig bis':'2099-12-31',
 'AVV erforderlich':'Ja','Lead E-Mail':['fake-tester@example.invalid'],
 'Vertragsunterlagen akzeptiert':false,'Vertragsunterlagen versendet':false,
 'Online-Annahme rechtlich freigegeben':false,
 'Online-Annahme Offerten-SHA256':sha('2'),'Online-Annahme Offerten Drive ID':'1'.repeat(24),
 'Online-Annahme Bedingungen-SHA256':sha('3'),'Online-Annahme Bedingungen Drive ID':'2'.repeat(24),
 'Online-Annahme AVV-SHA256':sha('4'),'Online-Annahme AVV Drive ID':'3'.repeat(24),
 'Online-Annahme AVV-Version':'TEST_ONLY_AVV'
}});
test('emulator: two Firestore fixtures cannot bind one synthetic Airtable ID',
 {skip:!enabled},async()=>{
 const {Firestore}=require('@google-cloud/firestore');
 const a=new Firestore({projectId:EMULATOR_PROJECT,databaseId:TARGET.databaseId});
 const b=new Firestore({projectId:EMULATOR_PROJECT,databaseId:TARGET.databaseId});
 const idA='LSZH-EMULATOR-'+crypto.randomBytes(12).toString('hex');
 const idB='LSZH-EMULATOR-'+crypto.randomBytes(12).toString('hex');
 const recordId='rec'+crypto.randomBytes(7).toString('hex');
 const refA=a.doc(documentPath(idA)),refB=a.doc(documentPath(idB));
 const lock=a.doc(LOCK_COLLECTION+'/'+recordId);
 try{
   await Promise.all([refA.create(state(idA)),refB.create(state(idB))]);
   const args={airtableRecordId:recordId,testMode:'offline-or-emulator-only',
     now:new Date('2026-10-15T12:00:00Z'),
     readRecord:async lookup=>{assert.equal(lookup,recordId);return record(recordId);}};
   const outcomes=await Promise.allSettled([
     bindSyntheticAirtableRecordOnce({...args,db:a,fixtureId:idA}),
     bindSyntheticAirtableRecordOnce({...args,db:b,fixtureId:idB})
   ]);
   assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
   assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
   assert.equal(outcomes.find(x=>x.status==='rejected').reason.reason,'record_already_bound');
   const saved=(await lock.get()).data();
   assert.ok([idA,idB].includes(saved.fixtureId));
   const docA=(await refA.get()).data(),docB=(await refB.get()).data();
   const matches=[docA,docB].filter(x=>x.airtableRecordId===recordId);
   assert.equal(matches.length,1);
   assert.equal(saved.fixtureId,matches[0].fixtureId);
   for(const one of [docA,docB]){
     assert.equal(one.status,'TEST_DRAFT_NOT_SENT');
     assert.equal(one.acceptanceEnabled,false);
     assert.equal(one.legallyApproved,false);
   }
   // Replays must never replace the committed binding.
   await assert.rejects(bindSyntheticAirtableRecordOnce({
     ...args,db:a,fixtureId:saved.fixtureId}),e=>e.reason==='already_bound');
 }finally{
   await Promise.all([refA.delete().catch(()=>{}),refB.delete().catch(()=>{}),
     lock.delete().catch(()=>{})]);
   await Promise.all([a.terminate(),b.terminate()]);
 }
});
