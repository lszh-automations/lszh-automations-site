'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createArchiveMetadataReader}=require('../contract-archive-metadata');
const {createDriveAcceptanceArchive}=require('../contract-acceptance-drive');
const {digest}=require('../offer-contract-package');
const id='pilot_file_123456',folder='pilot_folder_123456',hook='https://hook.eu1.make.com/synthetic';
const metadata=()=>({id,parents:[folder],mimeType:'application/pdf',size:'20',trashed:false});
const response=m=>({ok:true,json:async()=>({ok:true,metadata:m})});
test('metadata bridge validates returned identity, folder shape, MIME and size without exposing credentials',async()=>{
 let calls=0;const read=createArchiveMetadataReader({metadataHook:hook,fetchImpl:async(url,options)=>{calls++;assert.equal(url,hook);assert.equal(options.redirect,'error');assert.deepEqual(JSON.parse(options.body),{kind:'acceptance_archive_metadata',fileId:id});return response(metadata());}});
 assert.equal((await read(id)).parents[0],folder);await assert.rejects(read('../not_allowed'),{code:'ARCHIVE_ID_INVALID'});assert.equal(calls,1);
 for(const change of [m=>m.id='other_file_123456',m=>m.parents=[],m=>m.parents=['../escape'],m=>m.trashed=true,m=>m.mimeType='text/html',m=>m.size='NaN']){
  const m=metadata();change(m);await assert.rejects(createArchiveMetadataReader({metadataHook:hook,fetchImpl:async()=>response(m)})(id),{code:'ARCHIVE_METADATA_UNCONFIRMED'});
 }
 await assert.rejects(createArchiveMetadataReader({metadataHook:hook,fetchImpl:async()=>({ok:true,json:async()=>{throw Error('Accepted');}})})(id),{code:'ARCHIVE_METADATA_UNCONFIRMED'});
});
test('owner metadata does not relax parent or PDF hash checks; media is independently read by attached identity',async()=>{
 const bytes=Buffer.from('%PDF-1.4\nsynthetic\n%%EOF');let mediaReads=0,currentFolder=folder;
 const doc={kind:'offer',version:'v1',filename:'Pilot.pdf',archiveFileId:id,bytes:bytes.length,sha256:digest(bytes)};
 const reader=createDriveAcceptanceArchive({folderId:folder,metadataReader:async()=>({...metadata(),parents:[currentFolder],size:String(bytes.length)}),auth:{getClient:async()=>({getRequestHeaders:async()=>({Authorization:'Bearer synthetic-service-identity'})})},fetchImpl:async(url,options)=>{mediaReads++;assert.match(url,/alt=media/);assert.equal(options.headers.Authorization,'Bearer synthetic-service-identity');return new Response(bytes);}});
 assert.deepEqual(await reader.readArchivedPdf(id,doc),bytes);
 currentFolder='other_folder_123456';await assert.rejects(reader.readArchivedPdf(id,doc),{code:'DOCUMENT_INTEGRITY_FAILED'});assert.equal(mediaReads,1);
 currentFolder=folder;await assert.rejects(reader.readArchivedPdf(id,{...doc,sha256:'a'.repeat(64)}));assert.equal(mediaReads,2);
});
