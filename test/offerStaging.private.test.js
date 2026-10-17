'use strict';
// Synthetic local server contract for deliberately PRIVATE offer-acceptance staging.
// No cloud access, actual tokens, customer data, Make execution or mail.
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

test('private offer staging denies demo and ALL offer POSTs with 503 before any processing', {timeout:20000},async t=>{
 const port=await unusedPort();
 const child=spawn(process.execPath,['server.js'],{
  cwd:path.join(__dirname,'..'),
  env:{
   PATH:process.env.PATH||'',PORT:String(port),
   SITE_PRIVATE:'true',OFFER_ACCEPTANCE_ENABLED:'false',PREVIEW_TOKEN:'',
   NODE_ENV:'test'
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
 const origin='http://127.0.0.1:'+port;
 for(const route of ['/', '/onboarding/', '/offerte-annehmen/?demo=1','/make-start/']) {
  const response=await fetch(origin+route,{redirect:'manual',signal:AbortSignal.timeout(4000)});
  assert.equal(response.status,503,'GET '+route);
  assert.equal(await response.text(),'LSZH Automations ist vorübergehend nicht öffentlich verfügbar.');
  assert.match(response.headers.get('x-robots-tag')||'',/noindex/);
  assert.equal(response.headers.get('cache-control'),'no-store');
 }
 for(const route of ['/api/offer/preview','/api/offer/accept','/api/offer/document','/api/onboarding']) {
  const response=await fetch(origin+route,{
   method:'POST',headers:{'Content-Type':'application/json',Origin:origin},
   body:JSON.stringify({testOnly:true}),redirect:'manual',
   signal:AbortSignal.timeout(4000)
  });
  assert.equal(response.status,503,'POST '+route);
  assert.equal(await response.text(),'LSZH Automations ist vorübergehend nicht öffentlich verfügbar.');
 }
});
