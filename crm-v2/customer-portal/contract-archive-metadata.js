'use strict';
const {fault}=require('./contract-acceptance-staging');
// Owner-authorised metadata only. The remote gateway pins the two pilot PDFs
// and pilot-marked evidence files; media remains read with the service account.
function createArchiveMetadataReader({metadataHook,fetchImpl=fetch}={}){
 if(!/^https:\/\/hook\.eu1\.make\.com\/[A-Za-z0-9]+$/.test(metadataHook||''))throw fault('ARCHIVE_METADATA_NOT_CONFIGURED',503);
 return async id=>{
  if(!/^[A-Za-z0-9_-]{10,180}$/.test(id||''))throw fault('ARCHIVE_ID_INVALID');
  const r=await fetchImpl(metadataHook,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({kind:'acceptance_archive_metadata',fileId:id}),redirect:'error',signal:AbortSignal.timeout(30000)});
  const value=await r.json().catch(()=>null),m=value?.metadata;
  if(!r.ok||value?.ok!==true||m?.id!==id||m.trashed!==false||
     !['application/pdf','application/json'].includes(m.mimeType)||
     !Array.isArray(m.parents)||m.parents.length!==1||!/^[A-Za-z0-9_-]{10,180}$/.test(m.parents[0])||
     !/^\d{1,8}$/.test(String(m.size))||!Number.isSafeInteger(Number(m.size)))throw fault('ARCHIVE_METADATA_UNCONFIRMED',503);
  return {id:m.id,parents:[...m.parents],mimeType:m.mimeType,size:String(m.size),trashed:false};
 };
}
module.exports={createArchiveMetadataReader};
