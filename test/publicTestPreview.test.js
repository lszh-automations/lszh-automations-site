const test=require('node:test'),assert=require('node:assert/strict'),{createServer}=require('node:http'),{readFileSync}=require('node:fs'),{createHash}=require('node:crypto');
const code='P'.repeat(48),hash=createHash('sha256').update(code).digest('hex');
async function setup(){const m=await import('../cloud-run/public-test-preview/preview.mjs');let now=new Date('2026-10-21T12:10:00Z');
 const env={LSZH_PUBLIC_TEST_PREVIEW_ENABLED:'true',K_SERVICE:m.PREVIEW.service,K_REVISION:m.PREVIEW.service+'-00001-abc',GOOGLE_CLOUD_PROJECT:m.PREVIEW.project,LSZH_PUBLIC_TEST_ORIGIN:m.PREVIEW.origin,LSZH_PUBLIC_TEST_TOKEN_HASH:hash,LSZH_PUBLIC_TEST_EXPIRES_AT:'2026-10-21T12:40:00Z'};
 const handler=m.createPublicPreview({config:m.previewConfig(env,now),pageHtml:readFileSync('offerte-annehmen/index.html','utf8'),clock:()=>now});
 const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 return {m,env,post:(path,b,origin=m.PREVIEW.origin)=>fetch(base+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(b)}),get:()=>fetch(base+'/offerte-annehmen/'),expire:()=>now=new Date('2026-10-21T12:40:00Z'),close:()=>new Promise(r=>server.close(r))};}
test('public TEST_ONLY preview serves exact PDFs and never accepts',async()=>{const t=await setup();try{
 assert.equal((await t.get()).status,200);const r=await t.post('/api/offer/preview',{code});assert.equal(r.status,200);const p=await r.json();assert.equal(p.offer.test_only,true);assert.equal(p.offer.test_accept_enabled,false);
 for(const which of ['quote','terms']){const d=await t.post('/api/offer/document',{code,which});assert.equal(d.status,200);const bytes=Buffer.from(await d.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),p.offer[which+'_sha256']);}
 assert.equal((await t.post('/api/offer/document',{code,which:'avv'})).status,404);
 assert.equal((await t.post('/api/offer/accept',{code})).status,503);
}finally{await t.close();}});
test('preview rejects wrong token, origin and expires exactly at deadline',async()=>{const t=await setup();try{
 assert.equal((await t.post('/api/offer/preview',{code:'X'.repeat(48)})).status,404);
 assert.equal((await t.post('/api/offer/preview',{code},'https://evil.invalid')).status,403);
 t.expire();assert.equal((await t.get()).status,503);assert.equal((await t.post('/api/offer/preview',{code})).status,503);
}finally{await t.close();}});
test('public preview configuration cannot enable production or unbounded access',async()=>{const t=await setup();try{
 assert.deepEqual(t.m.previewConfig({}),{enabled:false});
 for(const patch of [{K_SERVICE:'lszh-offer-portal'},{LSZH_PORTAL_PRODUCTION_ENABLED:'true'},{LSZH_PUBLIC_TEST_TOKEN_HASH:''},{LSZH_PUBLIC_TEST_ORIGIN:'https://evil.invalid'},{LSZH_PUBLIC_TEST_EXPIRES_AT:'2026-10-22T12:00:00Z'}])assert.throws(()=>t.m.previewConfig({...t.env,...patch},new Date('2026-10-21T12:10:00Z')));
}finally{await t.close();}});
