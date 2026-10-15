'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {bindingFingerprint}=require('../syntheticAirtableBinding');
const {prepareSyntheticContractFromDriveReadback,
 SyntheticDriveReadRejected}=require('../syntheticDriveRevisionReadback');
const pdf=k=>Buffer.from('%PDF-1.7\nSynthetic '+k+'\n%%EOF');
const archiveBytes={offer:pdf('OFF'),terms:pdf('TERMS'),avv:pdf('AVV')};
const rev={offer:'revOfferSynthetic001',terms:'revTermsSynthetic001',avv:'revAVVSynthetic0001'};
const ids={offer:'1'.repeat(24),terms:'2'.repeat(24),avv:'3'.repeat(24)};
const folderId='F'.repeat(24);
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const docs=Object.fromEntries(Object.keys(ids).map(k=>[k,{
 driveFileId:ids[k],sha256:hash(archiveBytes[k]),mimeType:'application/pdf',
 archiveVerified:true
}]));
function draft(){
 const s={schemaVersion:1,testOnly:true,fixtureId:'LSZH-EMULATOR-20261015READBACK',
  airtableRecordId:'recTEST0000000000',offerNumber:'DEMO-OFF-20991231-999',
  recipientEmail:'fake-tester@example.invalid',validUntil:'2099-12-31',
  termsVersion:'TEST_ONLY_TERMS',avvRequired:true,avvVersion:'TEST_ONLY_AVV',
  documents:docs,status:'TEST_DRAFT_NOT_SENT',
  tokenHash:null,issuedAt:null,expiresAt:null,acceptedAt:null,
  legallyApproved:false,acceptanceEnabled:false,deliveryEnabled:false,
  deliveryConfirmed:false};
 s.airtableBinding={source:'SYNTHETIC_READ_ONLY',schemaVersion:1,
  boundAt:'2026-10-15T10:00:00.000Z',fingerprint:bindingFingerprint(s,s.airtableRecordId)};
 return s;
}
function readers(change={}){
 const calls={meta:[],list:[],bytes:[]};
 const kindFor=id=>Object.keys(ids).find(k=>ids[k]===id);
 return {calls,
  readMetadata:async fileId=>{
   calls.meta.push(fileId);
   const k=kindFor(fileId);
   return {source:'SYNTHETIC_MOCK',id:fileId,mimeType:'application/pdf',
    trashed:false,shared:false,parents:[folderId],
    size:String(archiveBytes[k].length),...(change.metadata?.[k]||{})};
  },
  listRevisions:async fileId=>{
   calls.list.push(fileId);const k=kindFor(fileId);
   return {fileId,currentRevisionId:rev[k],revisions:[{
    id:rev[k],mimeType:'application/pdf',
    keepForever:true,size:String(archiveBytes[k].length)
   }],...(change.revisions?.[k]||{})};
  },
  readRevisionBytes:async(fileId,revisionId)=>{
   calls.bytes.push([fileId,revisionId]);const k=kindFor(fileId);
   return change.bytes?.[k]||archiveBytes[k];
  }};
}
function prepare(opt={}){
 return prepareSyntheticContractFromDriveReadback({
  state:draft(),archiveFolderId:folderId,revisions:rev,
  testMode:'offline-or-emulator-only',...readers(opt),...opt});
}
test('reads all three revision-specific PDF bytes and returns frozen manifest input',async()=>{
 const r=readers();
 const out=await prepareSyntheticContractFromDriveReadback({
  state:draft(),archiveFolderId:folderId,revisions:rev,
  testMode:'offline-or-emulator-only',...r});
 assert.equal(out.syntheticOnly,true);
 assert.deepEqual(out.verifiedKinds,['offer','terms','avv']);
 assert.equal(out.prepared.manifest.documents.offer.revisionId,rev.offer);
 assert.equal(out.prepared.manifest.documents.terms.sizeBytes,archiveBytes.terms.length);
 assert.deepEqual(r.calls.bytes,[
  [ids.offer,rev.offer],[ids.terms,rev.terms],[ids.avv,rev.avv]
 ]);
 assert.equal(Object.isFrozen(out.prepared.manifest),true);
 assert.match(out.prepared.manifestHash,/^[a-f0-9]{64}$/);
});
test('changed revision, missing retention or shared/trashed/wrong folder deny',async()=>{
 for(const patch of [
  {metadata:{offer:{shared:true}}},
  {metadata:{offer:{trashed:true}}},
  {metadata:{terms:{parents:['X'.repeat(24)]}}},
  {metadata:{terms:{parents:[folderId,'X'.repeat(24)]}}},
  {metadata:{avv:{mimeType:'application/vnd.google-apps.document'}}},
  {revisions:{offer:{currentRevisionId:'revReplaced0000001'}}},
  {revisions:{terms:{revisions:[{id:rev.terms,mimeType:'application/pdf',keepForever:false,size:archiveBytes.terms.length}]}}},
  {revisions:{avv:{revisions:[]}}}
 ]){
  const r=readers(patch);
  await assert.rejects(prepareSyntheticContractFromDriveReadback({
   state:draft(),archiveFolderId:folderId,revisions:rev,
   testMode:'offline-or-emulator-only',...r
  }),SyntheticDriveReadRejected);
 }
});
test('changed actual PDF bytes and wrong revision size are rejected',async()=>{
 for(const patch of [
  {bytes:{offer:pdf('CHANGED')}},
  {bytes:{terms:Buffer.from('%PDF-1.7\nCORRUPT')}} ,
  {bytes:{avv:Buffer.from('not a pdf file')}},
  {revisions:{terms:{revisions:[{id:rev.terms,mimeType:'application/pdf',keepForever:true,size:'1000000'}]}}}
 ]){
  const r=readers(patch);
  await assert.rejects(prepareSyntheticContractFromDriveReadback({
   state:draft(),archiveFolderId:folderId,revisions:rev,
   testMode:'offline-or-emulator-only',...r
  }),SyntheticDriveReadRejected);
 }
});
test('metadata or revision read failures never grant a freeze',async()=>{
 for(const field of ['readMetadata','listRevisions','readRevisionBytes']){
  const r=readers();
  r[field]=async()=>{throw Error('secret internal failure')};
  await assert.rejects(prepareSyntheticContractFromDriveReadback({
   state:draft(),archiveFolderId:folderId,revisions:rev,
   testMode:'offline-or-emulator-only',...r}),e=>{
    assert.ok(e instanceof SyntheticDriveReadRejected);
    assert.doesNotMatch(e.message,/secret/);
    return true;
   });
 }
});
test('revisions must match exactly, test mode and environment forbid cloud',async()=>{
 const r=readers();
 for(const changed of [
  {revisions:{offer:rev.offer,terms:rev.terms}},
  {archiveFolderId:'NOT-A-FOLDER'},
  {testMode:'production'},
  {state:{...draft(),testOnly:false}}
 ]){
  await assert.rejects(prepareSyntheticContractFromDriveReadback({
    state:draft(),archiveFolderId:folderId,revisions:rev,
    testMode:'offline-or-emulator-only',...r,...changed}),SyntheticDriveReadRejected);
 }
 for(const key of ['K_SERVICE','GOOGLE_CLOUD_PROJECT','GCLOUD_PROJECT']){
  const old=process.env[key];
  try{
   process.env[key]=key==='K_SERVICE'?'lszh-staging':'lszh-automations';
   await assert.rejects(prepareSyntheticContractFromDriveReadback({
    state:draft(),archiveFolderId:folderId,revisions:rev,
    testMode:'offline-or-emulator-only',...readers()}),SyntheticDriveReadRejected);
  }finally{
   if(old===undefined)delete process.env[key];else process.env[key]=old;
  }
 }
});
