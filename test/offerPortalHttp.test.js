'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const ORIGIN='https://portal-staging.lszh-automations.ch';
async function setup(enabled,portal){
  const {createOfferPortalHttp}=await import('../cloud-run/offer-portal-staging/portalHttp.mjs');
  const listener=createOfferPortalHttp({enabled,allowedOrigin:ORIGIN,portal});
  const server=http.createServer(listener);
  await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  return {base,close:()=>new Promise(resolve=>server.close(resolve))};
}
async function call(base,path,body,origin=ORIGIN,method='POST',type='application/json'){
  const r=await fetch(base+path,{
    method,headers:{Origin:origin,'Content-Type':type},
    ...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(2000)
  });
  return {status:r.status,body:await r.json(),headers:r.headers};
}
test('default disabled portal rejects even valid-shaped attempts without a datastore call',async t=>{
 let reads=0;const p={preview:async()=>{reads++;},accept:async()=>{reads++;}};
 const s=await setup(false,p);t.after(()=>s.close());
 const r=await call(s.base,'/api/offer/accept',{code:'Z'.repeat(48)});
 assert.equal(r.status,503);assert.equal(r.body.error,'not_available');
 assert.equal(reads,0);assert.equal(r.headers.get('cache-control'),'no-store');
});
test('strict same-origin and POST routes; token is never in URL',async t=>{
 let reads=0;
 const p={preview:async()=>{reads++;return {number:'SYNTHETIC-001'};},
   accept:async()=>{reads++;return {accepted:true}}};
 const s=await setup(true,p);t.after(()=>s.close());
 assert.equal((await call(s.base,'/api/offer/preview',{code:'Z'.repeat(48)},'https://evil.invalid')).status,403);
 assert.equal((await call(s.base,'/api/offer/unknown',{code:'Z'.repeat(48)})).status,404);
 assert.equal((await call(s.base,'/api/offer/preview?code=Z',{code:'Z'.repeat(48)},ORIGIN,'GET')).status,404);
 assert.equal(reads,0);
 const r=await call(s.base,'/api/offer/preview',{code:'Z'.repeat(48)});
 assert.equal(r.status,200);assert.equal(r.body.offer.number,'SYNTHETIC-001');
 assert.equal(r.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
 assert.equal(r.headers.get('access-control-allow-origin'),null);
});
test('HTTP adapter rejects invalid JSON, bad content type and excessive body before handlers',async t=>{
 let reads=0;const p={preview:async()=>{reads++;return {}},accept:async()=>{reads++;return {}}};
 const s=await setup(true,p);t.after(()=>s.close());
 assert.equal((await call(s.base,'/api/offer/preview','{bad-json')).status,400);
 assert.equal((await call(s.base,'/api/offer/preview',{code:'Z'.repeat(48)},ORIGIN,'POST','text/plain')).status,400);
 assert.equal((await call(s.base,'/api/offer/accept',{padding:'A'.repeat(16000)})).status,400);
 assert.equal(reads,0);
});
test('safe error mapping never exposes internal exception messages',async t=>{
 const p={preview:async()=>{throw Error('secret-google-token-diagnostic')},
   accept:async()=>{const e=Error('already_accepted');e.code='already_accepted';throw e}};
 const s=await setup(true,p);t.after(()=>s.close());
 const err=await call(s.base,'/api/offer/preview',{code:'Z'.repeat(48)});
 assert.equal(err.status,503);
 assert.equal(err.body.error,'temporarily_unavailable');
 assert.ok(!JSON.stringify(err.body).includes('google'));
 const again=await call(s.base,'/api/offer/accept',{code:'Z'.repeat(48)});
 assert.equal(again.status,409);
 assert.equal(again.body.error,'already_accepted');
});
