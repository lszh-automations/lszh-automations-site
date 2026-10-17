'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const html=fs.readFileSync('offerte-annehmen/index.html','utf8');
const normal={
  LSZH_PORTAL_STAGING_ENABLED:'false',
  LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED:'true',
  K_SERVICE:'lszh-offer-browser-staging',
  K_REVISION:'lszh-offer-browser-staging-00002-test',
  GOOGLE_CLOUD_PROJECT:'lszh-automations'
};

test('temporary demo is disabled unless explicitly enabled',async()=>{
 const {tempBrowserDemoConfig}=await import('../cloud-run/offer-portal-staging/temporaryBrowserDemo.mjs');
 assert.deepEqual(tempBrowserDemoConfig({}),{enabled:false});
 assert.deepEqual(tempBrowserDemoConfig({...normal,LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED:'false'}),{enabled:false});
 assert.deepEqual(tempBrowserDemoConfig(normal),{enabled:true});
});
test('wrong service/revision/project, enabled full API and credentials all fail-closed',async()=>{
 const {tempBrowserDemoConfig}=await import('../cloud-run/offer-portal-staging/temporaryBrowserDemo.mjs');
 const mutations={
  K_SERVICE:'lszh-offer-portal-staging',
  K_REVISION:'lszh-offer-browser-staging-old',
  GOOGLE_CLOUD_PROJECT:'other-project',
  LSZH_PORTAL_STAGING_ENABLED:'true',
  FIRESTORE_EMULATOR_HOST:'127.0.0.1:8088',
  GOOGLE_APPLICATION_CREDENTIALS:'/tmp/key.json',
  OFFER_DRIVE_SA_B64:'UNSAFE'
 };
 for(const [name,value] of Object.entries(mutations)){
   assert.throws(()=>tempBrowserDemoConfig({...normal,[name]:value}),
    /temporary_demo_runtime_mismatch/,name);
 }
});
test('dedicated runtime identity must come from metadata server',async()=>{
 const {verifyTemporaryBrowserIdentity}=await import('../cloud-run/offer-portal-staging/temporaryBrowserDemo.mjs');
 await verifyTemporaryBrowserIdentity(async(url,options)=>{
  assert.match(url,/^http:\/\/metadata\.google\.internal\//);
  assert.equal(options.headers['Metadata-Flavor'],'Google');
  return new Response('lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com',{status:200});
 });
 await assert.rejects(()=>verifyTemporaryBrowserIdentity(async()=>{
  return new Response('lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com',{status:200});
 }),/temporary_demo_identity_mismatch/);
 await assert.rejects(()=>verifyTemporaryBrowserIdentity(async()=>{
  return new Response('denied',{status:403});
 }),/temporary_demo_identity_mismatch/);
});
test('static demo serves only GET /offerte-annehmen/?demo=1; all API/offer links stay HTTP 503',async t=>{
 const {createTemporaryBrowserDemoHttp}=await import('../cloud-run/offer-portal-staging/temporaryBrowserDemo.mjs');
 const handler=createTemporaryBrowserDemoHttp({enabled:true,pageHtml:html});
 const server=http.createServer(handler);
 await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const correct=await fetch(base+'/offerte-annehmen/?demo=1');
 assert.equal(correct.status,200);
 assert.equal(await correct.text(),html);
 assert.equal(correct.headers.get('cache-control'),'no-store');
 assert.equal(correct.headers.get('x-frame-options'),'DENY');
 assert.match(correct.headers.get('content-security-policy'),/connect-src 'none'/);
 assert.equal(correct.headers.get('content-length'),String(Buffer.byteLength(html)));
 assert.equal(correct.headers.get('access-control-allow-origin'),null);
 for(const path of ['/offerte-annehmen/',
    '/offerte-annehmen/?code=FAKE',
    '/offerte-annehmen/?demo=1&code=FAKE',
    '/offerte-annehmen/?demo=1&utm_source=x',
    '/api/offer/preview','/api/offer/accept','/api/offer/document','/']){
  const r=await fetch(base+path,{signal:AbortSignal.timeout(2000)});
  assert.equal(r.status,503,path);
  assert.deepEqual(await r.json(),{error:'not_available'},path);
 }
 for(const path of ['/api/offer/preview','/api/offer/accept','/api/offer/document']){
   const r=await fetch(base+path,{method:'POST',
    headers:{'Content-Type':'application/json',Origin:'https://attacker.invalid'},
    body:JSON.stringify({code:'FAKE'}),signal:AbortSignal.timeout(2000)});
   assert.equal(r.status,503);
   assert.deepEqual(await r.json(),{error:'not_available'});
 }
 const disabled=http.createServer(createTemporaryBrowserDemoHttp({enabled:false,pageHtml:html}));
 await new Promise(resolve=>disabled.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>disabled.close(resolve)));
 assert.equal((await fetch('http://127.0.0.1:'+disabled.address().port+
  '/offerte-annehmen/?demo=1')).status,503);
});
