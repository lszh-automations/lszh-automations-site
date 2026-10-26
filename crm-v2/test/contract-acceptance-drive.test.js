'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createDriveAcceptanceArchive}=require('../contract-acceptance-drive');
const {digest}=require('../offer-contract-package');
test('Drive archive verifies parent, exact bytes and retries with the same reserved ID',async()=>{
  const bytes=Buffer.from('{"synthetic":true}'),sha256=digest(bytes),id='synthetic_file_123456',folderId='synthetic_folder_123456';
  let exists=false,uploads=0;
  const archive=createDriveAcceptanceArchive({folderId,auth:{getClient:async()=>({getRequestHeaders:async()=>({Authorization:'Bearer synthetic'})})},
    fetchImpl:async(url,options)=>{
      assert.equal(options.redirect,'error');assert.ok(url.startsWith('https://www.googleapis.com/'));
      if(url.includes('generateIds'))return Response.json({ids:[id]});
      if(url.includes('upload/')){uploads++;if(exists)return new Response('',{status:409});exists=true;return Response.json({id});}
      if(url.includes('alt=media'))return new Response(bytes);
      return Response.json({id,parents:[folderId],trashed:false,mimeType:'application/json',size:String(bytes.length)});
    }});
  assert.equal(await archive.reserveId(),id);
  for(let n=0;n<2;n++)assert.equal(await archive.putVerified(id,bytes,{sha256,responseId:'response_'+'a'.repeat(32)}),id);
  assert.equal(uploads,2);
});
test('Drive rejects files outside the private archive and corrupted uploaded evidence',async()=>{
  const folderId='synthetic_folder_123456';
  const archive=createDriveAcceptanceArchive({folderId,auth:{getClient:async()=>({getRequestHeaders:async()=>({})})},fetchImpl:async()=>Response.json({parents:['other_folder'],mimeType:'application/pdf',size:'20'})});
  await assert.rejects(archive.readArchivedPdf('synthetic_file_123456',{bytes:20}),{code:'DOCUMENT_INTEGRITY_FAILED'});
  await assert.rejects(archive.putVerified('synthetic_file_123456',Buffer.from('wrong'),{sha256:'a'.repeat(64),responseId:'response_'+'b'.repeat(32)}),{code:'EVIDENCE_INTEGRITY_FAILED'});
});
