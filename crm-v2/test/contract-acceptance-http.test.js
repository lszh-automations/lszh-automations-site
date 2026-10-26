'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');
const {fixture}=require('./helpers/acceptance-fixture');
const {createAcceptanceHandler}=require('../contract-acceptance-http-staging');
async function setup(t,login){
  const f=fixture(),invite=await f.issue();let handler;
  const server=http.createServer((q,s)=>handler(q,s));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  handler=createAcceptanceHandler({service:f.service,origin,login});
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const headers={Authorization:'Bearer '+invite.token};
  const page=async()=>await (await fetch(origin+'/api/acceptance',{headers})).json();
  return {...f,origin,headers,page,invite};
}
test('HTTP complete flow serves exact PDFs and records one response',async t=>{
  const f=await setup(t),p=await f.page();
  const doc=await fetch(f.origin+'/api/documents/offer',{headers:f.headers});
  assert.equal(doc.status,200);assert.equal(doc.headers.get('content-type'),'application/pdf');
  assert.equal(doc.headers.get('cache-control'),'no-store');
  assert.equal(Buffer.from(await doc.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
  const options={method:'POST',headers:{...f.headers,Origin:f.origin,'Content-Type':'application/json',
    'X-CSRF-Token':p.csrf},body:JSON.stringify(f.body(p))};
  const response=await fetch(f.origin+'/api/acceptance',options);
  assert.equal(response.status,200);assert.equal((await response.json()).state,'customer_response_recorded');
  assert.equal((await fetch(f.origin+'/api/acceptance',options)).status,409);
});
test('HTTP requires exact Origin, CSRF, JSON and bounded body',async t=>{
  const f=await setup(t),p=await f.page();
  const valid={...f.headers,Origin:f.origin,'Content-Type':'application/json','X-CSRF-Token':p.csrf};
  for(const [headers,body,status] of [
    [{...valid,Origin:'https://evil.example'},JSON.stringify(f.body(p)),403],
    [{...valid,Origin:''},JSON.stringify(f.body(p)),403],
    [{...valid,'X-CSRF-Token':''},JSON.stringify(f.body(p)),403],
    [{...valid,'Content-Type':'text/plain'},JSON.stringify(f.body(p)),415],
    [valid,'not JSON',400],[valid,'x'.repeat(4097),413]]){
    assert.equal((await fetch(f.origin+'/api/acceptance',{method:'POST',headers,body})).status,status);
  }
  assert.equal(f.snapshot().some(r=>r.kind==='TEST_ONLY_CUSTOMER_ACCEPTANCE'),false);
});
test('HTTP never accepts query-string tokens, unauthenticated docs or client identity fields',async t=>{
  const f=await setup(t);
  assert.equal((await fetch(f.origin+'/api/acceptance?token='+f.invite.token)).status,400);
  assert.equal((await fetch(f.origin+'/api/documents/offer')).status,404);
  assert.equal((await fetch(f.origin+'/api/demo-session')).status,404);
  const p=await f.page();
  const r=await fetch(f.origin+'/api/acceptance',{method:'POST',headers:{...f.headers,Origin:f.origin,
    'Content-Type':'application/json','X-CSRF-Token':p.csrf},body:JSON.stringify({...f.body(p),email:f.recipient})});
  assert.equal(r.status,400);
});
test('portal has separate unchecked consents, restrictive headers and no productive imports',async t=>{
  const f=await setup(t),res=await fetch(f.origin+'/');
  const html=await res.text();assert.equal(res.status,200);
  assert.match(html,/id="avv" type="checkbox"/);assert.doesNotMatch(html,/\schecked(?:\s|>)/);
  assert.match(html,/Testmodus/);assert.match(html,/schriftliche Auftragsbestätigung/);
  assert.equal(res.headers.get('referrer-policy'),'no-referrer');
  assert.match(res.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  for(const file of ['server.js','offer-send.js'])assert.doesNotMatch(
    fs.readFileSync(path.join(__dirname,'..',file),'utf8'),/contract-acceptance/);
});

test('login HTTP enforces Origin, rejects supplied recipients and keeps session HttpOnly',async t=>{
  let requests=0;
  const f=await setup(t,{request:async()=>{requests++;return {challengeId:'x'.repeat(32)};},verify:async()=>({session:'s'.repeat(43),expiresInSeconds:900})});
  const headers={...f.headers,Origin:f.origin,'Content-Type':'application/json'};
  assert.equal((await fetch(f.origin+'/api/login/request',{method:'POST',headers,body:'{}'})).status,200);
  assert.equal((await fetch(f.origin+'/api/login/request',{method:'POST',headers,body:JSON.stringify({recipient:'attacker@example.com'})})).status,400);
  assert.equal((await fetch(f.origin+'/api/login/request',{method:'POST',headers:{...headers,Origin:'https://other.example'},body:'{}'})).status,403);
  assert.equal(requests,1);
  const response=await fetch(f.origin+'/api/login/verify',{method:'POST',headers,body:JSON.stringify({challengeId:'x'.repeat(32),code:'12345678'})});
  assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=900/);
  assert.equal((await response.json()).session,undefined);
});
