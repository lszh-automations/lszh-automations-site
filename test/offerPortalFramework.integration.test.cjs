'use strict';
// Real Functions Framework body parsing; fake domain only, no cloud calls.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {createRequire}=require('node:module');
const {pathToFileURL}=require('node:url');
const ORIGIN='https://portal-staging.lszh-automations.ch';

test('real Functions Framework forwards parsed JSON to portal routes',async t=>{
 const root=path.resolve(__dirname,'..');
 const portalRoot=path.join(root,'cloud-run/offer-portal-staging');
 const cli=path.join(portalRoot,'node_modules/.bin/functions-framework');
 assert.ok(fs.existsSync(cli),'Install portal SDK dependencies before this integration test');
 const requirePortal=createRequire(path.join(portalRoot,'package.json'));
 const framework=pathToFileURL(requirePortal.resolve('@google-cloud/functions-framework')).href;
 const adapter=pathToFileURL(path.join(portalRoot,'portalHttp.mjs')).href;
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'lszh-framework-'));
 const source=path.join(temp,'fixture.mjs');
 fs.writeFileSync(source,[
  'import {http} from '+JSON.stringify(framework)+';',
  'import {createOfferPortalHttp} from '+JSON.stringify(adapter)+';',
  'const portal={',
  ' preview:async code=>({number:code}),',
  " accept:async(code,body)=>({accepted:body.name==='Synthetic Tester',offer_number:code}),",
  " document:async()=>({bytes:Buffer.from('%PDF-1.4 synthetic only'),which:'quote',number:'TEST_ONLY',version:''})",
  '};',
  'const handle=createOfferPortalHttp({portal,enabled:true,acceptEnabled:true,allowedOrigin:'+JSON.stringify(ORIGIN)+'});',
  "http('syntheticBodyCheck',handle);"
 ].join('\n'));
 const child=spawn(cli,['--target=syntheticBodyCheck','--source='+source,'--port=18083'],{
  cwd:portalRoot,env:{...process.env,GOOGLE_CLOUD_PROJECT:'demo-offline',FUNCTION_TARGET:'syntheticBodyCheck'},
  stdio:['ignore','pipe','pipe']
 });
 let logs='';
 child.stdout.on('data',x=>logs+=x);
 child.stderr.on('data',x=>logs+=x);
 t.after(async()=>{
  if(child.exitCode===null){
   const done=once(child,'exit');
   child.kill('SIGTERM');
   const timeout=setTimeout(()=>child.kill('SIGKILL'),3000);
   await done;clearTimeout(timeout);
  }
  fs.rmSync(temp,{recursive:true,force:true});
 });
 const base='http://127.0.0.1:18083';
 let ready=false;
 for(let i=0;i<100;i++){
  if(child.exitCode!==null)throw Error('Framework boot failed: '+logs);
  try{await fetch(base+'/ready',{signal:AbortSignal.timeout(250)});ready=true;break;}catch{}
  await new Promise(r=>setTimeout(r,100));
 }
 assert.ok(ready,'Framework did not start: '+logs);
 const call=(route,body,origin=ORIGIN)=>fetch(base+route,{
  method:'POST',headers:{'Content-Type':'application/json',Origin:origin},
  body:JSON.stringify(body),signal:AbortSignal.timeout(3000)});
 const p=await call('/api/offer/preview',{code:'SYNTHETIC_ONLY'});
 assert.equal(p.status,200);assert.equal((await p.json()).offer.number,'SYNTHETIC_ONLY');
 const d=await call('/api/offer/document',{code:'SYNTHETIC_ONLY',which:'quote'});
 assert.equal(d.status,200);assert.match(await d.text(),/^%PDF-/);
 const a=await call('/api/offer/accept',{code:'SYNTHETIC_ONLY',name:'Synthetic Tester'});
 assert.equal(a.status,200);assert.equal((await a.json()).accepted,true);
 assert.equal((await call('/api/offer/preview',{code:'x'},'https://wrong.invalid')).status,403);
 assert.equal((await call('/api/offer/preview',[])).status,400);
 assert.equal((await call('/api/offer/preview',{padding:'X'.repeat(13000)})).status,400);
});
