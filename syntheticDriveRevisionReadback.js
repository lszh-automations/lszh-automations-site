'use strict';
// STRICTLY SYNTHETIC. NO Google API client and NO actual Drive access.
// Requires injected independent metadata, revision list and binary reader.
// Production must separately implement trusted Drive API auth and immutable
// archive handling; this mock-only proof must never authorize legal issuance.
const crypto=require('node:crypto');
const {prepareSyntheticContractManifest}=require('./syntheticContractFreeze');
const ID=/^[A-Za-z0-9_-]{20,100}$/;
const REV=/^[A-Za-z0-9_-]{10,100}$/;
const HEX=/^[a-f0-9]{64}$/;
const MAX=12*1024*1024;
class SyntheticDriveReadRejected extends Error{
 constructor(reason='archive_read_failed'){
  super(reason);this.name='SyntheticDriveReadRejected';this.reason=reason;
 }
}
function deny(reason='archive_read_failed'){throw new SyntheticDriveReadRejected(reason);}
function guard(testMode){
 if(process.env.K_SERVICE||process.env.GOOGLE_CLOUD_PROJECT==='lszh-automations'||
    process.env.GCLOUD_PROJECT==='lszh-automations')deny('not_test_environment');
 if(testMode!=='offline-or-emulator-only')deny('invalid_test_mode');
}
function same(a,b){
 if(!HEX.test(String(a||''))||!HEX.test(String(b||'')))return false;
 return crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
async function prepareSyntheticContractFromDriveReadback({state,archiveFolderId,
  revisions,readMetadata,listRevisions,readRevisionBytes,testMode}={}){
 guard(testMode);
 if(state?.testOnly!==true||!/^LSZH-EMULATOR-/.test(state.fixtureId||'')||
   !ID.test(String(archiveFolderId||''))||
   typeof readMetadata!=='function'||typeof listRevisions!=='function'||
   typeof readRevisionBytes!=='function')
   deny('invalid_input');
 const kinds=['offer','terms',...(state.avvRequired===true?['avv']:[])];
 if(state.avvRequired!==true&&state.avvRequired!==false)deny('invalid_input');
 if(!revisions||Object.keys(revisions).sort().join(',')!==
    kinds.slice().sort().join(','))
   deny('invalid_input');
 const archiveBytes={};
 for(const kind of kinds){
   const expected=state.documents?.[kind],revisionId=revisions[kind];
   const fileId=expected?.driveFileId;
   if(!ID.test(String(fileId||''))||!REV.test(String(revisionId||''))||
      !HEX.test(String(expected?.sha256||'')))deny('invalid_input');
   let meta,revInfo,contents;
   try{
     [meta,revInfo]=await Promise.all([
       readMetadata(fileId),listRevisions(fileId)
     ]);
     // Read raw revision bytes, NOT a Google Docs text export.
     contents=await readRevisionBytes(fileId,revisionId);
   }catch{deny('archive_read_failed');}
   if(meta?.source!=='SYNTHETIC_MOCK'||meta.id!==fileId||
      meta.mimeType!=='application/pdf'||meta.trashed!==false||
      meta.shared!==false||
      !Array.isArray(meta.parents)||!meta.parents.includes(archiveFolderId)||
      meta.parents.length!==1||
      revInfo?.fileId!==fileId||revInfo.currentRevisionId!==revisionId||
      !Array.isArray(revInfo.revisions)||revInfo.revisions.length===0)
      deny('archive_not_private_or_revision_changed');
   const item=revInfo.revisions.find(r=>r.id===revisionId);
   if(!item||item.mimeType!=='application/pdf'||item.keepForever!==true)
      deny('revision_not_retained');
   // A snapshot can drift while bytes are being read. Re-read revision
   // identity and sharing/parent metadata after the download, then fail closed.
   let finalMeta,finalRevision;
   try{
     [finalMeta,finalRevision]=await Promise.all([
       readMetadata(fileId),listRevisions(fileId)
     ]);
   }catch{deny('archive_read_failed');}
   if(finalMeta?.id!==fileId||finalMeta?.mimeType!=='application/pdf'||
      finalMeta?.source!=='SYNTHETIC_MOCK'||finalMeta?.shared!==false||
      finalMeta?.trashed!==false||!Array.isArray(finalMeta.parents)||
      finalMeta.parents.length!==1||
      finalMeta.parents[0]!==archiveFolderId||
      finalRevision?.fileId!==fileId||
      finalRevision.currentRevisionId!==revisionId)
     deny('revision_changed_during_read');
   if(!Buffer.isBuffer(contents)||contents.length<12||contents.length>MAX||
      contents.subarray(0,5).toString('ascii')!=='%PDF-'||
      !contents.subarray(Math.max(0,contents.length-2048))
       .includes(Buffer.from('%%EOF')))
      deny('invalid_pdf_bytes');
   if(String(contents.length)!==String(item.size)||
      (meta.size!=null&&String(meta.size)!==String(contents.length))||
      !same(crypto.createHash('sha256').update(contents).digest('hex'),
       expected.sha256))
      deny('revision_content_mismatch');
   archiveBytes[kind]=contents;
 }
 // All fetched bytes have been independently matched to the frozen input,
 // but ALL reads were injected synthetic mocks. No Cloud data is trusted.
 let prepared;
 try{
   prepared=prepareSyntheticContractManifest({state,archiveBytes,revisions,testMode});
 }catch{deny('archive_content_or_state_mismatch');}
 return Object.freeze({prepared,archiveBytes:Object.freeze(archiveBytes),
    verifiedKinds:Object.freeze(kinds),syntheticOnly:true});
}
module.exports={prepareSyntheticContractFromDriveReadback,SyntheticDriveReadRejected};
