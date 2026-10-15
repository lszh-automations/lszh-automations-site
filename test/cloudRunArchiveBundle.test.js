'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const hash=v=>createHash('sha256').update(v).digest('hex');
const folder='1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in';
const doc={
  quote:{id:'1ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef',bytes:Buffer.from('%PDF-1.7\nSYNTHETIC QUOTE\n%%EOF\n')},
  terms:{id:'1BCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef',bytes:Buffer.from('%PDF-1.7\nSYNTHETIC TERMS\n%%EOF\n')},
  avv:{id:'1CDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefg',bytes:Buffer.from('%PDF-1.7\nSYNTHETIC AVV\n%%EOF\n')}
};
const bundle={
  avv_required:'Ja',
  quote:{id:doc.quote.id,sha256:hash(doc.quote.bytes)},
  terms:{id:doc.terms.id,sha256:hash(doc.terms.bytes)},
  avv:{id:doc.avv.id,sha256:hash(doc.avv.bytes)}
};
function fakeDrive({wrongParent=false,noLock=false,badDigest=false,tamperBytes=false,deny=false,oversizedStream=false}={}){
  const calls=[];
  async function fetcher(u,o){
    const url=new URL(u);calls.push({url:u,method:o.method,auth:o.headers.Authorization});
    if(deny)return new Response('denied',{status:403});
    const id=url.pathname.split('/').pop();
    const found=Object.values(doc).find(d=>d.id===id);
    if(!found)return new Response('missing',{status:404});
    if(url.searchParams.get('alt')==='media'){
      if(oversizedStream)return new Response(new ReadableStream({
        start(controller){controller.enqueue(new Uint8Array(13*1024*1024));controller.close();}
      }));
      return new Response(tamperBytes?Buffer.from('%PDF-1.7\nTAMPERED\n'):found.bytes);
    }
    return Response.json({
      id,mimeType:'application/pdf',size:found.bytes.length,trashed:false,
      sha256Checksum:badDigest?'a'.repeat(64):hash(found.bytes),
      contentRestrictions:[{readOnly:!noLock}],
      parents:[wrongParent?'1NotOurArchiveZzzzzzzzzzzzzzzzzzzzz':folder]
    });
  }
  return {fetcher,calls};
}
const load=()=>import('../cloud-run/archive-reader-staging/archiveBundleVerifier.mjs');
test('2 PDF files verified without AVV and no document bytes returned',async()=>{
 const {verifyArchiveBundle}=await load();
 const m=fakeDrive();const b={avv_required:'Nein',quote:bundle.quote,terms:bundle.terms};
 assert.equal(await verifyArchiveBundle(b,{fetcher:m.fetcher,accessToken:'SYNTHETIC_TOKEN_123',archiveFolderId:folder}),true);
 assert.equal(m.calls.length,4);
 assert(m.calls.every(x=>x.method==='GET'&&x.auth==='Bearer SYNTHETIC_TOKEN_123'));
});
test('3 PDF AVV-required bundle verified with exact downloaded bytes',async()=>{
 const {verifyArchiveBundle}=await load();const m=fakeDrive();
 assert.equal(await verifyArchiveBundle(bundle,{fetcher:m.fetcher,accessToken:'SYNTHETIC_TOKEN_123',archiveFolderId:folder}),true);
 assert.equal(m.calls.length,6);
});
test('reject contradictory or malformed inputs before touching Drive',async()=>{
 const {verifyArchiveBundle}=await load();const m=fakeDrive();
 const bad=[
  {...bundle,avv_required:'Nein'}, {...bundle,extra:true},
  {...bundle,quote:{...bundle.quote,another:'x'}},
  {...bundle,quote:{...bundle.quote,sha256:'A'.repeat(64)}},
  {...bundle,avv:{...bundle.avv,id:bundle.quote.id}},
  {...bundle,quote:{...bundle.quote,id:'../evil'}},
  {avv_required:'Ja',quote:bundle.quote,terms:bundle.terms}
 ];
 for(const b of bad)await assert.rejects(()=>verifyArchiveBundle(b,{fetcher:m.fetcher,accessToken:'SYNTHETIC_TOKEN_123',archiveFolderId:folder}),/invalid_bundle/);
 assert.equal(m.calls.length,0);
});
test('fail closed on changed folder/lock/metadata digest and real PDF bytes',async()=>{
 const {verifyArchiveBundle}=await load();
 for(const variant of [
  {wrongParent:true},{noLock:true},{badDigest:true},{tamperBytes:true}
 ]){
  const m=fakeDrive(variant);
  assert.equal(await verifyArchiveBundle(bundle,{fetcher:m.fetcher,accessToken:'SYNTHETIC_TOKEN_123',archiveFolderId:folder}),false);
 }
});
test('Drive API denied and oversized streaming result never passes',async()=>{
 const {verifyArchiveBundle}=await load();
 for(const variant of [{deny:true},{oversizedStream:true}]){
  const m=fakeDrive(variant);
  await assert.rejects(()=>verifyArchiveBundle(bundle,{fetcher:m.fetcher,accessToken:'SYNTHETIC_TOKEN_123',archiveFolderId:folder}),/archive_unavailable/);
 }
});
test('no token or wrong folder is refused before any read',async()=>{
 const {verifyArchiveBundle}=await load();const m=fakeDrive();
 await assert.rejects(()=>verifyArchiveBundle(bundle,{fetcher:m.fetcher,accessToken:'',archiveFolderId:folder}),/archive_unavailable/);
 await assert.rejects(()=>verifyArchiveBundle(bundle,{fetcher:m.fetcher,accessToken:'SYNTHETIC_TOKEN_123',archiveFolderId:'wrong'}),/archive_unavailable/);
 assert.equal(m.calls.length,0);
});
