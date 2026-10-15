'use strict';
// Opt-in Firebase local emulator ONLY. No Drive/Airtable/Cloud services.
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {validateSettings,EMULATOR_PROJECT}=require('../stagingFirestoreConnection');
const {TARGET,documentPath}=require('../stagingOfferSchema');
const {LOCK_COLLECTION,bindingFingerprint}=require('../syntheticAirtableBinding');
const {COLLECTION,freezeSyntheticContractOnce}=require('../syntheticContractFreeze');
const {prepareSyntheticContractFromDriveReadback}=require('../syntheticDriveRevisionReadback');
let enabled=false;
try{
 validateSettings(process.env,'emulator');
 enabled=process.env.LSZH_RUN_EMULATOR_TRANSACTION_TEST==='I_UNDERSTAND_LOCAL_ONLY';
}catch{enabled=false;}
const pdf=x=>Buffer.from('%PDF-1.7\nSYNTHETIC '+x+'\n%%EOF');
const archiveBytes={offer:pdf('Q'),terms:pdf('T'),avv:pdf('A')};
const revisions={offer:'revQuoteSynthetic010',terms:'revTermsSynthetic010',avv:'revAVVSynthetic0010'};
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
test('emulator: two independent clients can freeze a 3-PDF manifest only once',
 {skip:!enabled},async()=>{
 const {Firestore}=require('@google-cloud/firestore');
 const a=new Firestore({projectId:EMULATOR_PROJECT,databaseId:TARGET.databaseId});
 const b=new Firestore({projectId:EMULATOR_PROJECT,databaseId:TARGET.databaseId});
 const fixtureId='LSZH-EMULATOR-'+crypto.randomBytes(12).toString('hex');
 const recordId='rec'+crypto.randomBytes(7).toString('hex');
 const fileIds={offer:'1'.repeat(24),terms:'2'.repeat(24),avv:'3'.repeat(24)};
 const folderId='F'.repeat(24);
 const docs=Object.fromEntries(Object.entries(archiveBytes).map(([k,v])=>[k,{
  mimeType:'application/pdf',sha256:hash(v),driveFileId:fileIds[k],
  archiveVerified:true}]));
 const state={schemaVersion:1,testOnly:true,fixtureId,airtableRecordId:recordId,
  status:'TEST_DRAFT_NOT_SENT',offerNumber:'DEMO-OFF-20991231-999',
  recipientEmail:'fake-tester@example.invalid',validUntil:'2099-12-31',
  termsVersion:'TEST_ONLY_TERMS',avvRequired:true,avvVersion:'TEST_ONLY_AVV',
  documents:docs,tokenHash:null,acceptedAt:null,issuedAt:null,
  expiresAt:null,legallyApproved:false,acceptanceEnabled:false,
  deliveryEnabled:false,deliveryConfirmed:false};
 state.airtableBinding={source:'SYNTHETIC_READ_ONLY',schemaVersion:1,
  boundAt:'2026-10-15T10:00:00.000Z',
  fingerprint:bindingFingerprint(state,recordId)};
 const offer=a.doc(documentPath(fixtureId));
 const lock=a.doc(LOCK_COLLECTION+'/'+recordId);
 const freeze=a.doc(COLLECTION+'/'+fixtureId);
 try{
  await Promise.all([offer.create(state),
   lock.create({fixtureId,recordId,syntheticOnly:true,
     fingerprint:state.airtableBinding.fingerprint,boundAt:state.airtableBinding.boundAt})]);
  // The source below is an injected fake, NEVER the actual Google Drive API.
  const kindByFileId=id=>Object.keys(fileIds).find(k=>fileIds[k]===id);
  const checked=await prepareSyntheticContractFromDriveReadback({
   state,archiveFolderId:folderId,revisions,
   testMode:'offline-or-emulator-only',
   readMetadata:async fileId=>({source:'SYNTHETIC_MOCK',id:fileId,
     mimeType:'application/pdf',trashed:false,shared:false,
     parents:[folderId],size:String(archiveBytes[kindByFileId(fileId)].length)}),
   listRevisions:async fileId=>{
     const kind=kindByFileId(fileId);
     return {fileId,currentRevisionId:revisions[kind],
      revisions:[{id:revisions[kind],mimeType:'application/pdf',
       keepForever:true,size:String(archiveBytes[kind].length)}]};
   },
   readRevisionBytes:async(fileId,revisionId)=>{
     const kind=kindByFileId(fileId);
     assert.equal(revisionId,revisions[kind]);
     return archiveBytes[kind];
   }
  });
  const prepared=checked.prepared;
  const args={fixtureId,prepared,testMode:'offline-or-emulator-only',
    now:new Date('2026-10-15T12:00:00Z')};
  const responses=await Promise.allSettled([a,b].map(db=>freezeSyntheticContractOnce({...args,db})));
  assert.equal(responses.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(responses.find(r=>r.status==='rejected').reason.reason,'already_frozen');
  const document=(await offer.get()).data(),frozen=(await freeze.get()).data();
  assert.equal(document.contractManifestHash,prepared.manifestHash);
  assert.equal(frozen.manifestHash,prepared.manifestHash);
  assert.equal(frozen.manifest.documents.avv.revisionId,revisions.avv);
  assert.equal(document.status,'TEST_DRAFT_NOT_SENT');
  assert.equal(document.legallyApproved,false);
  assert.equal(document.acceptanceEnabled,false);
  assert.equal(document.deliveryConfirmed,false);
 }finally{
  await Promise.all([offer.delete().catch(()=>{}),lock.delete().catch(()=>{}),
    freeze.delete().catch(()=>{})]);
  await Promise.all([a.terminate(),b.terminate()]);
 }
});
