'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const ORIGIN='https://portal-staging.lszh-automations.ch';
async function setup(enabled,portal,pageHtml,acceptEnabled=true,consumedBody=false){
  const {createOfferPortalHttp}=await import('../cloud-run/offer-portal-staging/portalHttp.mjs');
  const listener=createOfferPortalHttp({enabled,acceptEnabled,allowedOrigin:ORIGIN,portal,pageHtml});
  const server=http.createServer(async(req,res)=>{
    if(consumedBody){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      req.rawBody=Buffer.concat(chunks);
      try{req.body=JSON.parse(req.rawBody.toString('utf8'));}catch{}
    }
    return listener(req,res);
  });
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
test('Cloud Run synthetic preview can work while acceptance is hard-disabled',async t=>{
 let previews=0,accepts=0,documents=0;
 const p={
  preview:async()=>{previews++;return {number:'TEST_ONLY_PREVIEW_NO_CONTRACT'};},
  accept:async()=>{accepts++;return {accepted:true};},
  document:async()=>{documents++;return {bytes:Buffer.from('%PDF-1.4\\nONLY SYNTHETIC\\n%%EOF\\n'),which:'quote',
     number:'TEST_ONLY_PREVIEW_NO_CONTRACT',version:'TEST_RC1'};}
 };
 const s=await setup(true,p,'<!DOCTYPE html><html>Test-only staging</html>',false);
 t.after(()=>s.close());
 const offer=await call(s.base,'/api/offer/preview',{code:'Z'.repeat(48)});
 assert.equal(offer.status,200);
 assert.equal(previews,1);
 const blocked=await call(s.base,'/api/offer/accept',{code:'Z'.repeat(48)});
 assert.equal(blocked.status,503);
 assert.equal(blocked.body.error,'not_available');
 assert.equal(accepts,0,'accept() must never run');
 const download=await fetch(s.base+'/api/offer/document',{method:'POST',
  headers:{Origin:ORIGIN,'Content-Type':'application/json'},
  body:JSON.stringify({code:'Z'.repeat(48),which:'quote'})});
 assert.equal(download.status,200);
 assert.match(download.headers.get('content-type'),/application\/pdf/);
 assert.equal(documents,1);
});
test('single-origin browser page is static and disabled by default',async t=>{
 const portal={preview:async()=>{},accept:async()=>{}};
 const pageHtml='<!DOCTYPE html><html><body>SYNTHETIC ONLY NO CONTRACT</body></html>';
 const off=await setup(false,portal,pageHtml);t.after(()=>off.close());
 const closed=await fetch(off.base+'/offerte-annehmen/?demo=1');
 assert.equal(closed.status,503);
 assert.equal((await closed.json()).error,'not_available');
 const on=await setup(true,portal,pageHtml);t.after(()=>on.close());
 const shown=await fetch(on.base+'/offerte-annehmen/?demo=1');
 assert.equal(shown.status,200);
 assert.equal(await shown.text(),pageHtml);
 assert.equal(shown.headers.get('content-type'),'text/html; charset=utf-8');
 assert.equal(shown.headers.get('cache-control'),'no-store');
 assert.equal(shown.headers.get('referrer-policy'),'no-referrer');
 assert.match(shown.headers.get('x-robots-tag'),/noindex/);
 assert.equal(shown.headers.get('x-frame-options'),'DENY');
 assert.equal(shown.headers.get('access-control-allow-origin'),null);
 assert.equal((await fetch(on.base+'/offerte-annehmen/index.html')).status,404);
 assert.equal((await fetch(on.base+'/api/offer/document',{method:'GET'})).status,404);
 const missing=await setup(true,portal);t.after(()=>missing.close());
 assert.equal((await fetch(missing.base+'/offerte-annehmen/')).status,503);
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

test('already consumed Functions Framework request still reaches preview and accept',async t=>{
 const seen=[];
 const portal={preview:async code=>{seen.push(['preview',code]);return {number:'TEST_ONLY'};},
   accept:async(code,b)=>{seen.push(['accept',code,b.name]);return {accepted:true};}};
 const s=await setup(true,portal,undefined,true,true);t.after(()=>s.close());
 assert.equal((await call(s.base,'/api/offer/preview',{code:'Z'.repeat(48)})).status,200);
 assert.equal((await call(s.base,'/api/offer/accept',{code:'Z'.repeat(48),name:'Test Person'})).status,200);
 assert.deepEqual(seen,[['preview','Z'.repeat(48)],['accept','Z'.repeat(48),'Test Person']]);
});
test('framework raw body retains invalid JSON, object and byte-limit rejection',async t=>{
 let calls=0;const portal={preview:async()=>{calls++;return {};},accept:async()=>{calls++;return {};}};
 const s=await setup(true,portal,undefined,true,true);t.after(()=>s.close());
 for(const body of ['{bad','[]','null','',JSON.stringify({padding:'A'.repeat(16000)})]){
   assert.equal((await call(s.base,'/api/offer/preview',body)).status,400);
 }
 assert.equal(calls,0);
});
