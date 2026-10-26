'use strict';
const {GoogleAuth}=require('google-auth-library');
const {createDriveAcceptanceArchive}=require('./contract-acceptance-drive');
const catalog=require('./contract-document-catalog.json');
const {fault}=require('./contract-acceptance-staging');
// Production document reads only. No archive upload or credential mutation exposed.
function createProductionDocumentReader({auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/drive.readonly']}),archiveForFolder,metadataReader}={}){
 const open=archiveForFolder||((folderId)=>createDriveAcceptanceArchive({folderId,auth,metadataReader}));
 const terms=open(catalog.sourceFolderId),originals=open(catalog.sentOriginalsFolderId);
 return Object.freeze({readArchivedPdf:async(id,doc)=>{
  if(!doc||doc.archiveFileId!==id)throw fault('DOCUMENT_INTEGRITY_FAILED',409);
  if(doc.kind==='terms'){
   if(['archiveFileId','version','bytes','sha256'].some(k=>doc[k]!==catalog.terms[k]))throw fault('TERMS_VERSION_NOT_APPROVED',409);
   return terms.readArchivedPdf(id,doc);
  }
  if(!['offer','avv'].includes(doc.kind))throw fault('DOCUMENT_NOT_FOUND',404);
  if(doc.kind==='avv'&&(id===catalog.avvTemplate.archiveFileId||doc.sha256===catalog.avvTemplate.sha256))throw fault('CUSTOMER_AVV_ANNEXES_REQUIRED',409);
  return originals.readArchivedPdf(id,doc);
 }});
}
module.exports={createProductionDocumentReader};
