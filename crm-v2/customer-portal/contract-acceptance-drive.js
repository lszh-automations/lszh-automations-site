'use strict';
// Private Drive archive via attached service account / ADC, never browser tokens.
const {GoogleAuth}=require('google-auth-library');
const {digest,verifyDocumentBytes}=require('./offer-contract-package');
const {fault}=require('./contract-acceptance-staging');
function createDriveAcceptanceArchive({folderId,auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/drive']}),fetchImpl=fetch,metadataReader}={}){
  if(!/^[A-Za-z0-9_-]{10,180}$/.test(folderId||''))throw fault('ARCHIVE_NOT_CONFIGURED',503);
  async function request(path,options={}){
    const client=await auth.getClient(),headers=await client.getRequestHeaders();
    const response=await fetchImpl('https://www.googleapis.com/'+path,{...options,redirect:'error',
      headers:{...headers,...options.headers},signal:AbortSignal.timeout(30000)});
    return response;
  }
  async function json(path,options){
    const r=await request(path,options);if(!r.ok)throw fault('ARCHIVE_UNAVAILABLE',503);return r.json();
  }
  const validId=id=>{if(!/^[A-Za-z0-9_-]{10,180}$/.test(id||''))throw fault('ARCHIVE_ID_INVALID');return id;};
  async function read(id,max=6*1024*1024){
    const r=await request('drive/v3/files/'+validId(id)+'?alt=media&supportsAllDrives=true');
    if(!r.ok)throw fault('ARCHIVE_UNAVAILABLE',503);
    let size=0;const chunks=[];
    try{for await(const chunk of r.body){size+=chunk.length;if(size>max)throw fault('ARCHIVE_TOO_LARGE',409);chunks.push(chunk);}}
    catch(error){await r.body?.cancel?.().catch(()=>{});throw error;}
    return Buffer.concat(chunks);
  }
  async function metadata(id){if(metadataReader){const m=await metadataReader(validId(id));if(m?.id!==id)throw fault('ARCHIVE_METADATA_UNCONFIRMED',503);return m;}return json('drive/v3/files/'+validId(id)+'?supportsAllDrives=true&fields=id,parents,trashed,mimeType,size');}
  async function readArchivedPdf(id,doc){
    const meta=await metadata(id);
    if(meta.trashed||!meta.parents?.includes(folderId)||meta.mimeType!=='application/pdf'||Number(meta.size)!==doc.bytes)
      throw fault('DOCUMENT_INTEGRITY_FAILED',409);
    const bytes=await read(id,doc.bytes);verifyDocumentBytes(doc,bytes);return bytes;
  }
  async function inspectEvidence(id){
    const meta=await metadata(id);
    if(meta.trashed||!meta.parents?.includes(folderId)||meta.mimeType!=='application/json'||Number(meta.size)>256*1024)
      throw fault('EVIDENCE_INTEGRITY_FAILED',409);
    return {bytes:await read(id,256*1024)};
  }
  async function checkTarget(){
    const folder=await json('drive/v3/files/'+folderId+'?supportsAllDrives=true&fields=id,mimeType,trashed,driveId,capabilities(canAddChildren)');
    if(folder.trashed||folder.mimeType!=='application/vnd.google-apps.folder'||folder.capabilities?.canAddChildren!==true)
      throw fault('ARCHIVE_WRITE_ACCESS_REQUIRED',503);
    return {folderId:folder.id,sharedDrive:Boolean(folder.driveId)};
  }
  async function reserveId(){const r=await json('drive/v3/files/generateIds?count=1&space=drive&type=files');return validId(r.ids?.[0]);}
  async function putVerified(id,bytes,{responseId,sha256}){
    validId(id);if(digest(bytes)!==sha256||bytes.length>256*1024||!/^response_[a-f0-9]{32}$/.test(responseId))throw fault('EVIDENCE_INTEGRITY_FAILED',409);
    const boundary='lszh_'+require('node:crypto').randomBytes(16).toString('hex');
    const meta={id,name:responseId+'.json',mimeType:'application/json',parents:[folderId],appProperties:{responseId,sha256}};
    const body=Buffer.concat([Buffer.from('--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'),bytes,Buffer.from('\r\n--'+boundary+'--\r\n')]);
    const r=await request('upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
    if(!r.ok&&r.status!==409)throw fault('ARCHIVE_UNAVAILABLE',503);
    const saved=await metadata(id);
    if(saved.trashed||!saved.parents?.includes(folderId)||saved.mimeType!=='application/json'||Number(saved.size)!==bytes.length||digest(await read(id,256*1024))!==sha256)
      throw fault('EVIDENCE_INTEGRITY_FAILED',409);
    return id;
  }
  return Object.freeze({readArchivedPdf,reserveId,putVerified,checkTarget,inspectEvidence});
}
module.exports={createDriveAcceptanceArchive};
