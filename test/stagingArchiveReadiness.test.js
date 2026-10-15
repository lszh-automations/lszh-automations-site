'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {assessSyntheticArchiveReadiness}=require('../stagingArchiveReadiness');
const folderId='1TbS-BpxQQmtTKQMiYsCR4bIQmftOoYfP';
const marker='LSZH_SYNTHETIC_STAGING_20261015_NO_MAIL';
const fileData={
 offer:{id:'1NZZlVv5KyDT2Dni3a2L4eZxrEmOnZ4Hs',
  sha256:'25668a6107955d7d91daed947a1718f2aa2e41ad44434ba02b093556577dedf0',
  bytes:2344,revision:'0B9_so3WW6ZwRaEdnWVF2RDg2dVNwMW8xRWNRQmV5aEdDWHdrPQ'},
 terms:{id:'1ZFcoeGTaU-s6PBeAME2JDY4LQzRjAAlN',
  sha256:'220311f34f1f5273c3d3b681cafdd447019ac71d818999dcb1118aaad8207415',
  bytes:2258,revision:'0B9_so3WW6ZwRR05QcWdjc290VGo5Rlg4ci8yT1YvdW5PQXUwPQ'},
 avv:{id:'1BdpSui0LOv9-LZHfWGpzMcruaAlNKCzG',
  sha256:'4ac54ac7ba284638eba39b000726cef3c0bbff3db8bd9f881290546f6a208604',
  bytes:2224,revision:'0B9_so3WW6ZwRQTcrSVZtTmZaNjJGWFBGMWU2Q2hvZ3N2dkJjPQ'}
};
function evidence(){
 const documents=Object.fromEntries(Object.entries(fileData).map(([k,v])=>
   [k,{id:v.id,sha256:v.sha256}]));
 const files=Object.fromEntries(Object.entries(fileData).map(([k,v])=>
   [k,{id:v.id,sha256:v.sha256,mimeType:'application/pdf',
     byteLength:v.bytes,metadataSize:String(v.bytes),revisionSize:String(v.bytes),
     revisionBefore:v.revision,revisionAfter:v.revision,
     pdfBytesVerified:true,parentId:folderId,shared:false,keepForever:false}]));
 return {
  now:new Date('2026-10-15T19:00:00.000Z'),
  observedAt:'2026-10-15T18:45:00.000Z',
  record:{id:'recaH2FUSgUUytImd',offerNumber:'DEMO-OFF-20991231-20261015A1',
   status:'Entwurf',testOnly:true,
   recipientEmail:'fake-lszh-e2e@example.invalid',sourceMarker:marker,
   termsVersion:'TEST_ONLY_TERMS_20261015_A1',
   avvRequired:true,avvVersion:'TEST_ONLY_AVV_20261015_A1',
   deliveryEnabled:false,acceptanceEnabled:false,legallyApproved:false,
   documents},
  folder:{id:folderId,shared:false,privateConfirmed:true},files,
  identity:{userManagedServiceAccountVerified:false}
 };
}
test('the real read-only STAGING evidence is correctly BLOCKED by all three unretained revisions and IAM',()=>{
 const result=assessSyntheticArchiveReadiness(evidence());
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.blockers.length,4);
 for(const k of ['OFFER','TERMS','AVV'])
   assert.ok(result.blockers.includes('PDF_REVISION_NOT_RETAINED_'+k));
 assert.ok(result.blockers.includes('SERVER_IDENTITY_NOT_VERIFIED'));
 assert.equal(result.integrityVerifiedForReference,true);
 assert.equal(result.permissionToWriteCloudFirestore,false);
 assert.equal(result.permissionToModifyDriveRetention,false);
 assert.equal(result.permissionToAcceptContract,false);
 assert.equal(result.permissionToDeliverEmail,false);
});
test('hypothetical complete evidence only permits HUMAN REVIEW and never execution',()=>{
 const e=evidence();
 for(const value of Object.values(e.files))value.keepForever=true;
 e.identity={userManagedServiceAccountVerified:true,
  serviceAccountEmail:'lszh-offer-reader@lszh-automations.iam.gserviceaccount.com',
  cloudRunService:'lszh-offer-acceptance-staging',
  secretlessWorkloadIdentity:true,
  googleDriveArchiveReaderVerified:true,
  firestoreNamedDbReadOnlyVerified:true,
  airtableReadOnlySecretVerified:true,exportedPrivateKeyPresent:false};
 const r=assessSyntheticArchiveReadiness(e);
 assert.equal(r.status,'READY_FOR_HUMAN_REVIEW');
 assert.deepEqual(r.blockers,[]);
 assert.equal(r.permissionToWriteCloudFirestore,false);
 assert.equal(r.permissionToModifyDriveRetention,false);
 assert.equal(r.permissionToAcceptContract,false);
});
test('wrong byte digest, document ID, access and file revision all independently block',()=>{
 const scenarios=[
  e=>{e.files.offer.sha256='f'.repeat(64);},
  e=>{e.files.terms.revisionAfter='revChangedOnRead123';},
  e=>{e.files.avv.parentId='privateOtherFolder12345';},
  e=>{e.files.offer.shared=true;},
  e=>{e.files.terms.byteLength=13;},
  e=>{e.record.documents.avv.id='1'.repeat(24);},
  e=>{e.files.offer.pdfBytesVerified=false;}
 ];
 for(const change of scenarios){
  const e=evidence();change(e);
  const r=assessSyntheticArchiveReadiness(e);
  assert.equal(r.status,'BLOCKED');
  assert.ok(r.blockers.some(x=>x.startsWith('PDF_BYTES_OR_METADATA_MISMATCH_')||
     x.startsWith('PDF_REVISION_UNSTABLE_')));
  assert.equal(r.permissionToAcceptContract,false);
 }
});
test('wrong legal state, invalid email, wrong source and stale evidence fail closed',()=>{
 const scenarios=[
  e=>{e.record.status='Versendet';},
  e=>{e.record.legallyApproved=true;},
  e=>{e.record.deliveryEnabled=true;},
  e=>{e.record.recipientEmail='real@lszh-automations.ch';},
  e=>{e.record.sourceMarker='sales';},
  e=>{e.observedAt='2026-10-12T18:45:00.000Z';},
  e=>{e.observedAt='bad';},
  e=>{e.observedAt='2026-10-15T23:00:00.000Z';}
 ];
 for(const change of scenarios){
  const e=evidence();change(e);
  assert.equal(assessSyntheticArchiveReadiness(e).status,'BLOCKED');
 }
});
test('missing document or forged identity flags do not grant cloud writes',()=>{
 const e=evidence();delete e.files.avv;
 assert.ok(assessSyntheticArchiveReadiness(e).blockers.includes('DOCUMENT_SET_MISMATCH'));
 const f=evidence();
 for(const value of Object.values(f.files))value.keepForever=true;
 f.identity={userManagedServiceAccountVerified:true,serviceAccountEmail:'user@gmail.com',
   cloudRunService:'lszh-offer-acceptance-staging',
   googleDriveArchiveReaderVerified:true,firestoreNamedDbReadOnlyVerified:true,
   airtableReadOnlySecretVerified:true,secretlessWorkloadIdentity:true,
   exportedPrivateKeyPresent:true};
 const r=assessSyntheticArchiveReadiness(f);
 assert.ok(r.blockers.includes('SERVER_IDENTITY_NOT_VERIFIED'));
 assert.equal(r.permissionToWriteCloudFirestore,false);
});
