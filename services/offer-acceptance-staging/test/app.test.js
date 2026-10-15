'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createGateway,csp}=require('../app');
const fixture='<html><style>body{color:#111}</style><script>const a=1;</script><p>STAGING PORTAL</p></html>';
async function serverForTest(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lszh-gateway-'));
 const file=path.join(dir,'index.html');fs.writeFileSync(file,fixture);
 const srv=createGateway({htmlPath:file});srv.listen(0,'127.0.0.1');await once(srv,'listening');
 const base='http://127.0.0.1:'+srv.address().port;
 return {base,close:async()=>{await new Promise((resolve,reject)=>srv.close(e=>e?reject(e):resolve()));fs.rmSync(dir,{recursive:true,force:true});}};
}
async function exercise(fn){const s=await serverForTest();try{await fn(s.base);}finally{await s.close();}}
test('health only reports disabled STAGING and never claims Firestore connectivity',()=>exercise(async base=>{
 const r=await fetch(base+'/healthz');assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{ok:true,mode:'staging',acceptanceEnabled:false});
 assert.equal(r.headers.get('cache-control'),'no-store, max-age=0');
 assert.equal(r.headers.get('access-control-allow-origin'),null);
}));
test('existing offer portal UI is served from same origin and noindexed',()=>exercise(async base=>{
 const r=await fetch(base+'/offerte-annehmen/');assert.equal(r.status,200);
 assert.match(await r.text(),/STAGING PORTAL/);
 assert.match(r.headers.get('content-security-policy'),/sha256-/);
 assert.match(r.headers.get('x-robots-tag'),/noindex/);
 assert.equal(r.headers.get('referrer-policy'),'no-referrer');
}));
test('all offer endpoints return 503 with no side effect, even if POST appears valid',()=>exercise(async base=>{
 for(const endpoint of ['preview','document','accept']){
  const r=await fetch(base+'/api/offer/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({code:'sensitive-secret',accept_terms:true,authorized:true})});
  assert.equal(r.status,503);const body=await r.text();
  assert.deepEqual(JSON.parse(body),{ok:false,error:'not_available'});
  assert.doesNotMatch(body,/sensitive-secret/);
 }
}));
test('query-string bearer token is rejected and never reflected',()=>exercise(async base=>{
 const token='SECRET_DO_NOT_LOG_IN_BROWSER_LOCATION';
 const r=await fetch(base+'/offerte-annehmen/?code='+token);
 assert.equal(r.status,400);assert.deepEqual(await r.json(),{ok:false,error:'fragment_link_required'});
}));
test('fragment bearer token is client-only (not transmitted via HTTP)',()=>exercise(async base=>{
 const r=await fetch(base+'/offerte-annehmen/#code=SECRET');assert.equal(r.status,200);
 assert.match(await r.text(),/STAGING PORTAL/);
}));
test('wrong HTTP verbs and CORS preflight never enable requests',()=>exercise(async base=>{
 let r=await fetch(base+'/api/offer/accept',{method:'GET'});
 assert.equal(r.status,405);assert.equal(r.headers.get('allow'),'POST');
 r=await fetch(base+'/api/offer/accept',{method:'OPTIONS',headers:{Origin:'https://evil.example'}});
 assert.equal(r.status,405);assert.equal(r.headers.get('access-control-allow-origin'),null);
 r=await fetch(base+'/offerte-annehmen/',{method:'POST'});assert.equal(r.status,405);
}));
test('unknown, root and internal paths do not serve files or diagnostics',()=>exercise(async base=>{
 for(const p of ['/','/stagingFirestoreConnection.js','/../server.js','/api/internal']){
  const r=await fetch(base+p);assert.equal(r.status,404);
 }
}));
test('strict CSP has hashes for inline script/style and forbids external scripts',()=>{
 const value=csp(fixture);
 assert.match(value,/script-src 'sha256-/);
 assert.match(value,/style-src 'sha256-/);
 assert.match(value,/frame-ancestors 'none'/);
 assert.doesNotMatch(value,/unsafe-inline/);
});
