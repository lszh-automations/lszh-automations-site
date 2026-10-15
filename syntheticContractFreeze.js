'use strict';
// Isolated, offline/emulator-only contract freeze prototype. No Google Drive IO,
// Airtable PATCH, customer token issuance, Cloud Run or production approval.
const crypto=require('node:crypto');
const {bindingFingerprint,LOCK_COLLECTION}=require('./syntheticAirtableBinding');
const {documentPath,SCHEMA_VERSION}=require('./stagingOfferSchema');
const HEX=/^[a-f0-9]{64}$/;
const ID=/^LSZH-EMULATOR-[A-Za-z0-9_-]{12,60}$/;
const REC=/^rec[A-Za-z0-9]{14}$/;
const REV=/^[A-Za-z0-9_-]{10,100}$/;
const MAX_BYTES=12*1024*1024;
const COLLECTION='stagingContractFreezes';
class SyntheticContractFreezeRejected extends Error {
 constructor(reason='contract_not_eligible'){
  super(reason);this.name='SyntheticContractFreezeRejected';this.reason=reason;
 }
}
function deny(reason){throw new SyntheticContractFreezeRejected(reason);}
function gate(testMode){
 if(process.env.K_SERVICE||process.env.GOOGLE_CLOUD_PROJECT==='lszh-automations'||
   process.env.GCLOUD_PROJECT==='lszh-automations')
  deny('not_test_environment');
 if(testMode!=='offline-or-emulator-only')deny('invalid_test_mode');
}
function hash(value){return crypto.createHash('sha256').update(value).digest('hex');}
function sameHash(a,b){return HEX.test(String(a||''))&&HEX.test(String(b||''))&&
 crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));}
function deepFreeze(data){
 if(data&&typeof data==='object'){
  for(const x of Object.values(data))deepFreeze(x);
  Object.freeze(data);
 }
 return data;
}
function pinned(state){
 if(!state||state.schemaVersion!==SCHEMA_VERSION||state.testOnly!==true||
  !ID.test(String(state.fixtureId||''))||!REC.test(String(state.airtableRecordId||''))||
  state.status!=='TEST_DRAFT_NOT_SENT'||state.tokenHash!=null||
  state.acceptedAt!=null||state.issuedAt!=null||state.expiresAt!=null||
  state.legallyApproved!==false||state.acceptanceEnabled!==false||
  state.deliveryEnabled!==false||state.deliveryConfirmed!==false||
  state.airtableBinding?.source!=='SYNTHETIC_READ_ONLY'||
  state.airtableBinding.schemaVersion!==1||
  !sameHash(state.airtableBinding.fingerprint,
   bindingFingerprint(state,state.airtableRecordId))||
  !/^TEST_ONLY_/.test(state.termsVersion||'')||
  (state.avvRequired!==true&&state.avvRequired!==false)||
  !/^DEMO-OFF-/.test(state.offerNumber||'')||
  !/^fake-[a-z0-9-]+@example\.invalid$/.test(state.recipientEmail||''))
  deny('contract_not_eligible');
 if(state.contractManifestHash!=null||state.contractFrozenAt!=null)
  deny('already_frozen');
}
// This is a *draft* hash manifest. It is neither a signature nor proof that
// Google Drive files or RC1 legal texts are authentic.
function prepareSyntheticContractManifest({state,archiveBytes,revisions,testMode}={}){
 gate(testMode);pinned(state);
 const kinds=['offer','terms',...(state.avvRequired?['avv']:[])];
 if(!archiveBytes||!revisions||
  Object.keys(archiveBytes).sort().join(',')!==kinds.slice().sort().join(',')||
  Object.keys(revisions).sort().join(',')!==kinds.slice().sort().join(','))
  deny('archive_incomplete');
 const documents={};
 for(const kind of kinds){
  const doc=state.documents?.[kind];
  const buffer=archiveBytes[kind];
  const rev=revisions[kind];
  if(!doc||!Buffer.isBuffer(buffer)||buffer.length<12||
     buffer.length>MAX_BYTES||buffer.subarray(0,5).toString()!=='%PDF-'||
     !buffer.includes(Buffer.from('%%EOF'))||
     doc.mimeType!=='application/pdf'||doc.archiveVerified!==true||
     !HEX.test(String(doc.sha256||''))||!sameHash(hash(buffer),doc.sha256)||
     !REV.test(String(rev||''))||
     !/^[A-Za-z0-9_-]{20,100}$/.test(doc.driveFileId||''))
   deny('archive_changed');
  documents[kind]={driveFileId:doc.driveFileId,revisionId:rev,
   sha256:doc.sha256,sizeBytes:buffer.length,mimeType:'application/pdf'};
 }
 if(!state.avvRequired&&state.documents?.avv!=null)deny('archive_changed');
 if(state.avvRequired&&!/^TEST_ONLY_/.test(state.avvVersion||''))
  deny('archive_changed');
 const manifest={
  schema:'LSZH_SYNTHETIC_CONTRACT_MANIFEST_V1',testOnly:true,
  fixtureId:state.fixtureId,airtableRecordId:state.airtableRecordId,
  bindingFingerprint:state.airtableBinding.fingerprint,
  offerNumber:state.offerNumber,
  recipientSha256:hash(state.recipientEmail),
  validUntil:state.validUntil,
  termsVersion:state.termsVersion,
  avvRequired:state.avvRequired,
  avvVersion:state.avvRequired?state.avvVersion:null,
  documents
 };
 const manifestHash=hash(JSON.stringify(manifest));
 return deepFreeze({manifest,manifestHash});
}
async function freezeSyntheticContractOnce({db,fixtureId,prepared,testMode,
  now=new Date()}={}){
 gate(testMode);
 if(!db||typeof db.doc!=='function'||typeof db.runTransaction!=='function'||
   !ID.test(String(fixtureId||''))||!prepared||
   !(now instanceof Date)||!Number.isFinite(now.getTime())||
   !HEX.test(prepared.manifestHash||'')||
   prepared.manifest?.fixtureId!==fixtureId||
   prepared.manifest?.schema!=='LSZH_SYNTHETIC_CONTRACT_MANIFEST_V1'||
   !sameHash(prepared.manifestHash,hash(JSON.stringify(prepared.manifest))))
  deny('invalid_manifest');
 const offer=db.doc(documentPath(fixtureId));
 const freeze=db.doc(COLLECTION+'/'+fixtureId);
 return db.runTransaction(async tx=>{
  // Firestore demands all reads BEFORE any writes.
  const offerSnap=await tx.get(offer),freezeSnap=await tx.get(freeze);
  if(!offerSnap.exists)deny('contract_not_eligible');
  const s=offerSnap.data();
  if(freezeSnap.exists||s?.contractManifestHash!=null)deny('already_frozen');
  pinned(s);
  const m=prepared.manifest;
  if(m.airtableRecordId!==s.airtableRecordId||
     !sameHash(m.bindingFingerprint,s.airtableBinding.fingerprint)||
     m.offerNumber!==s.offerNumber||m.validUntil!==s.validUntil||
     m.termsVersion!==s.termsVersion||
     m.recipientSha256!==hash(s.recipientEmail)||
     m.avvRequired!==s.avvRequired||
     m.avvVersion!==(s.avvRequired?s.avvVersion:null))
   deny('manifest_mismatch');
  const kinds=['offer','terms',...(s.avvRequired?['avv']:[])];
  if(Object.keys(m.documents||{}).sort().join(',')!==
     kinds.slice().sort().join(','))deny('manifest_mismatch');
  for(const kind of kinds){
   if(m.documents[kind]?.sha256!==s.documents?.[kind]?.sha256||
      m.documents[kind]?.driveFileId!==s.documents?.[kind]?.driveFileId||
      m.documents[kind]?.mimeType!=='application/pdf'||
      !REV.test(String(m.documents[kind].revisionId||'')))
    deny('manifest_mismatch');
  }
  const bind=await tx.get(db.doc(LOCK_COLLECTION+'/'+s.airtableRecordId));
  if(!bind.exists||bind.data()?.fixtureId!==fixtureId||
    bind.data()?.recordId!==s.airtableRecordId||
    bind.data()?.syntheticOnly!==true||
    bind.data()?.fingerprint!==s.airtableBinding.fingerprint)
    deny('binding_mismatch');
  const at=now.toISOString();
  tx.create(freeze,{testOnly:true,fixtureId,manifest:m,
    manifestHash:prepared.manifestHash,frozenAt:at});
  tx.update(offer,{contractManifestHash:prepared.manifestHash,
    contractFrozenAt:at,contractManifestVersion:1});
  return {frozen:true,fixtureId,manifestHash:prepared.manifestHash,
   acceptanceEnabled:false,delivered:false};
 });
}
module.exports={SyntheticContractFreezeRejected,prepareSyntheticContractManifest,
 freezeSyntheticContractOnce,COLLECTION};
