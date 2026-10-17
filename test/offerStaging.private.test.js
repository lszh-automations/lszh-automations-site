'use strict';
// Local synthetic regression: exactly one public demo GET, all sensitive routes private.
// No cloud access, real credentials, contracts, Make execution, Airtable writes or email.
const test=require('node:test');
const assert=require('node:assert/strict');
const net=require('node:net');
const {spawn}=require('node:child_process');
const path=require('node:path');

async function unusedPort() {
 const listener=net.createServer();
 await new Promise((resolve,reject)=>{
  listener.once('error',reject);
  listener.listen(0,'127.0.0.1',resolve);
 });
 const port=listener.address().port;
 await new Promise(resolve=>listener.close(resolve));
 return port;
}

async function startServer(t, overrides={}) {
 const port=await unusedPort();
 const child=spawn(process.execPath,['server.js'],{
  cwd:path.join(__dirname,'..'),
  env:{
   PATH:process.env.PATH||'',PORT:String(port),
   SITE_PRIVATE:'true',OFFER_ACCEPTANCE_ENABLED:'false',PREVIEW_TOKEN:'',
   NODE_ENV:'staging',LSZH_STAGING_ARCHIVE_SMOKE:'false',
   ...overrides
  },
  stdio:['ignore','pipe','pipe']
 });
 let output='',ready=false;
 for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{
  output+=String(chunk).slice(0,4096);
  if(output.includes('LSZH Automations listening on'))ready=true;
 });
 t.after(async()=>{
  if(child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>{
   child.once('exit',resolve);setTimeout(resolve,2000).unref();
  });}
 });
 const stopAt=Date.now()+8000;
 while(!ready && child.exitCode===null && Date.now()<stopAt)
  await new Promise(resolve=>setTimeout(resolve,30));
 assert.equal(ready,true,'private test server starts');
 return 'http://127.0.0.1:'+port;
}

const PRIVATE_BODY='LSZH Automations ist vorübergehend nicht öffentlich verfügbar.';
async function assertDenied(origin,route,options={}) {
 const response=await fetch(origin+route,{
  redirect:'manual',signal:AbortSignal.timeout(4000),...options
 });
 assert.equal(response.status,503,(options.method||'GET')+' '+route);
 if(options.method==='HEAD') assert.equal(await response.text(),'');
 else assert.equal(await response.text(),PRIVATE_BODY);
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.match(response.headers.get('x-robots-tag')||'',/noindex/);
 assert.equal(response.headers.get('set-cookie'),null);
}

test('only the synthetic offer demo GET is public on private staging', {timeout:20000},async t=>{
 const origin=await startServer(t);
 const response=await fetch(origin+'/offerte-annehmen/?demo=1',{
  redirect:'manual',signal:AbortSignal.timeout(4000)
 });
 assert.equal(response.status,200);
 assert.match(response.headers.get('content-type')||'',/text\/html/);
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.match(response.headers.get('x-robots-tag')||'',/noindex/);
 assert.equal(response.headers.get('referrer-policy'),'no-referrer');
 assert.equal(response.headers.get('set-cookie'),null,'public demo must never grant privileged session');
 const html=await response.text();
 assert.match(html,/MUSTER-2026-001/,'fake offer only');
 assert.match(html,/if\(!current\|\|demo\|\|current\.test_only===true\|\|!form\.reportValidity\(\)\)return/,'demo and synthetic previews have no submit path');

 // ChatGPT and other link providers append tracking to opened URLs.
 // These parameters must not turn a harmless public demo into HTTP 503.
 for(const route of [
  '/offerte-annehmen/?demo=1&utm_source=chatgpt.com',
  '/offerte-annehmen/?utm_source=chatgpt.com&demo=1',
  '/offerte-annehmen/?demo=1&utm_source=chatgpt.com&utm_medium=referral'
 ]) {
  const tracked=await fetch(origin+route,{redirect:'manual',signal:AbortSignal.timeout(4000)});
  assert.equal(tracked.status,200,'tracked synthetic GET '+route);
  assert.match(await tracked.text(),/MUSTER-2026-001/);
  assert.equal(tracked.headers.get('set-cookie'),null);
 }

 for(const route of [
  '/', '/onboarding/', '/make-start/', '/secure/', '/secure-admin/',
  '/offerte-annehmen/', '/offerte-annehmen/?demo=0',
  '/offerte-annehmen/?code=real-looking&demo=1',
  '/offerte-annehmen/?demo=1&code=anything',
  '/offerte-annehmen/?demo=1&demo=1',
  '/offerte-annehmen/?demo=1&code=real-offer',
  '/offerte-annehmen/?demo=1&preview=guess',
  '/offerte-annehmen/?demo=1&something_else=1',
  '/offerte-annehmen/?demo=1&utm_source=x&utm_medium=x&utm_campaign=x&utm_term=x&utm_content=x&utm_source=y',
  '/offerte-annehmen/index.html?demo=1',
  '/?demo=1', '/api/offer/preview?demo=1'
 ]) await assertDenied(origin,route);

 await assertDenied(origin,'/offerte-annehmen/?demo=1',{method:'HEAD'});
 for(const route of [
  '/offerte-annehmen/?demo=1',
  '/api/offer/preview','/api/offer/accept','/api/offer/document',
  '/api/onboarding','/api/secure/submit','/api/ai-demo'
 ]) await assertDenied(origin,route,{
  method:'POST',headers:{'Content-Type':'application/json',Origin:origin},
  body:JSON.stringify({testOnly:true})
 });
});

test('public demo exception is unavailable outside staging', {timeout:20000},async t=>{
 const origin=await startServer(t,{NODE_ENV:'production'});
 await assertDenied(origin,'/offerte-annehmen/?demo=1');
});

test('public demo exception is unavailable if acceptance is enabled', {timeout:20000},async t=>{
 const origin=await startServer(t,{OFFER_ACCEPTANCE_ENABLED:'true'});
 await assertDenied(origin,'/offerte-annehmen/?demo=1');
});
