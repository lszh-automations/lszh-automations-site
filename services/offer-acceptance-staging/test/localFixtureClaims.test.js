'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const crypto=require('node:crypto');
const {createGateway}=require('../app');
const {createLocalFixtureClaim}=require('./localFixtureClaims');
const TOKEN='A'.repeat(43);
const fixture={fixtureId:'LSZH-EMULATOR-abcdef0123456789',offerNumber:'DEMO-OFF-20991231-999',
  termsVersion:'TEST_ONLY_TERMS',avvVersion:'TEST_ONLY_AVV',avvRequired:true};
const archiveBytes={
  offer:Buffer.from('%PDF-1.7\nSynthetic quote\n%%EOF'),
  terms:Buffer.from('%PDF-1.7\nSynthetic conditions\n%%EOF'),
  avv:Buffer.from('%PDF-1.7\nSynthetic AVV\n%%EOF')
};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const doc=b=>({mimeType:'application/pdf',sha256:hash(b),
  driveFileId:'1'.repeat(24),archiveVerified:true});
function state(){
 return {schemaVersion:1,fixtureId:fixture.fixtureId,testOnly:true,
  status:'ISSUED',acceptanceEnabled:true,legallyApproved:true,
  deliveryConfirmed:true,archiveVerified:true,acceptedAt:null,
  expiresAt:'2099-12-31T23:59:59Z',tokenHash:hash(TOKEN),
  offerNumber:fixture.offerNumber,termsVersion:fixture.termsVersion,
  avvVersion:fixture.avvVersion,avvRequired:true,recipientEmail:'fake-tester@example.invalid',
  documents:{offer:doc(archiveBytes.offer),terms:doc(archiveBytes.terms),avv:doc(archiveBytes.avv)}};
}
function fakeTransactionalStore(initial){
  let value=structuredClone(initial),writes=0;
  let serial=Promise.resolve();
  return {db:{doc:p=>({path:p}),runTransaction:fn=>{
    const job=serial.then(async()=>{
      const tx={get:async()=>({exists:!!value,data:()=>structuredClone(value)}),
        update:(ref,patch)=>{value={...value,...structuredClone(patch)};writes++;}};
      return fn(tx);
    });
    serial=job.catch(()=>{});
    return job;
  }},get:()=>value,writes:()=>writes};
}
function body(extra={}){
 return {code:TOKEN,name:'Test Muster',email:'fake-tester@example.invalid',
   authorized:true,accept_terms:true,accept_avv:true,
   quote_sha256:hash(archiveBytes.offer),terms_sha256:hash(archiveBytes.terms),
   avv_sha256:hash(archiveBytes.avv),...extra};
}
async function setup({initial=state(),archive=archiveBytes,withHandler=true}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lszh-fixture-http-'));
 const htmlPath=path.join(dir,'index.html');fs.writeFileSync(htmlPath,'<html>Staging UI</html>');
 const store=fakeTransactionalStore(initial);
 const oldNodeEnv=process.env.NODE_ENV;process.env.NODE_ENV='test';
 const srv=createGateway({htmlPath,localFixtureClaim:withHandler?
    createLocalFixtureClaim({db:store.db,fixture,archiveBytes:archive}):null});
 srv.listen(0,'127.0.0.1');await once(srv,'listening');
 return {url:'http://127.0.0.1:'+srv.address().port,store,close:async()=>{
   await new Promise((resolve,reject)=>srv.close(e=>e?reject(e):resolve()));
   fs.rmSync(dir,{recursive:true,force:true});
   if(oldNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldNodeEnv;
 }};
}
async function request(url,post=body(),p='/__local_fixture/claim'){
 return fetch(url+p,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify(post)});
}
test('local HTTP request -> transactional synthetic claim -> pending reconciliation',async()=>{
 const env=await setup();
 try{
  const r=await request(env.url);
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{ok:true,offer_number:fixture.offerNumber,reconciliation_pending:true});
  assert.equal(env.store.writes(),1);
  assert.equal(env.store.get().status,'ACCEPTED');
  assert.equal(env.store.get().acceptanceEvidence.acceptedAvv,true);
  assert.equal(env.store.get().reconciliationStatus,'PENDING');
 }finally{await env.close();}
});
test('two simultaneous HTTP clicks lead to exactly one claim',async()=>{
 const env=await setup();
 try{
  const rs=await Promise.all([request(env.url),request(env.url)]);
  assert.deepEqual(rs.map(x=>x.status).sort(),[200,409]);
  assert.equal(env.store.writes(),1);
  const failed=await rs.find(r=>r.status===409).json();
  assert.equal(failed.error,'already_processed');
 }finally{await env.close();}
});
test('no AVV consent or manipulated PDF digest can write',async()=>{
 const env=await setup();
 try{
  for(const invalid of [{accept_avv:false},{avv_sha256:'0'.repeat(64)},
      {terms_sha256:'f'.repeat(64)},{code:'B'.repeat(43)}]){
   const r=await request(env.url,body(invalid));
   assert.ok([400,409].includes(r.status));assert.equal(env.store.writes(),0);
  }
 }finally{await env.close();}
});
test('trusted synthetic PDF bytes changed after preparation: claim is blocked',async()=>{
 const badArchive={...archiveBytes,avv:Buffer.from('%PDF-1.7\nCHANGED\n%%EOF')};
 const env=await setup({archive:badArchive});
 try{
  const r=await request(env.url,body({avv_sha256:hash(badArchive.avv)}));
  assert.equal(r.status,409);assert.equal(env.store.writes(),0);
 }finally{await env.close();}
});
test('blocked fixture with missing legal release cannot be accepted',async()=>{
 const env=await setup({initial:{...state(),legallyApproved:false}});
 try{const r=await request(env.url);assert.equal(r.status,409);assert.equal(env.store.writes(),0);}
 finally{await env.close();}
});
test('test-only route is absent without injected handler; normal offer routes never unblocked',async()=>{
 const env=await setup({withHandler:false});
 try{
  const local=await request(env.url);assert.equal(local.status,404);
  const normal=await request(env.url,body(),'/api/offer/accept');assert.equal(normal.status,503);
  assert.equal(env.store.writes(),0);
 }finally{await env.close();}
});
test('Cloud Run production identity disables the local fixture injection even if supplied',async()=>{
 const env=await setup();
 try{
  const original=process.env.K_SERVICE;process.env.K_SERVICE='lszh-offer-acceptance-staging';
  try{const r=await request(env.url);assert.equal(r.status,404);assert.equal(env.store.writes(),0);}
  finally{if(original===undefined)delete process.env.K_SERVICE;else process.env.K_SERVICE=original;}
 }finally{await env.close();}
});
