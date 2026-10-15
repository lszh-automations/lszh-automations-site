'use strict';
// Synthetic-only HTTP tests. No real credentials, no remote Cloud requests.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createGateway}=require('../app');
const {createStagingReadProbe,isReadProbeRuntime,PROBE_PATH,PROBE_FIXTURE_ID}=
  require('../stagingReadProbe');
const VALID_ENV={
 NODE_ENV:'production',K_SERVICE:'lszh-offer-acceptance-staging',
 K_REVISION:'lszh-offer-acceptance-staging-00001-test',
 GOOGLE_CLOUD_PROJECT:'lszh-automations',
 LSZH_FIRESTORE_PROJECT_ID:'lszh-automations',
 LSZH_FIRESTORE_DATABASE_ID:'lszh-offers-staging',
 LSZH_STAGING_READ_PROBE_ENABLED:'yes',
 LSZH_FIRESTORE_STAGING_WRITE_ENABLED:'false'
};
const KEYS=[...Object.keys(VALID_ENV),'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_CLOUD_KEYFILE_JSON','FIRESTORE_EMULATOR_HOST'];
function applyEnv(fields={}){
 const previous=Object.fromEntries(KEYS.map(k=>[k,process.env[k]]));
 for(const k of KEYS)delete process.env[k];
 Object.assign(process.env,{...VALID_ENV,...fields});
 return ()=>{for(const k of KEYS){
  if(previous[k]===undefined)delete process.env[k];
  else process.env[k]=previous[k];
 }};
}
let reads=0,writes=0,lastOptions=null,lastPath=null;
class FakeFirestore {
 constructor(opts){lastOptions=opts;}
 doc(p){
  lastPath=p;
  return {get:async()=>{
   reads++;
   return {exists:false};
  },set:()=>{writes++;throw Error('write_forbidden');},
   update:()=>{writes++;throw Error('write_forbidden');}};
 }
}
async function setup({stagingReadProbe=null}={}){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'lszh-stage-read-http-'));
 const htmlPath=path.join(folder,'index.html');
 fs.writeFileSync(htmlPath,'<html>LOCAL TEST</html>');
 const srv=createGateway({htmlPath,stagingReadProbe});
 srv.listen(0,'127.0.0.1');await once(srv,'listening');
 return {url:'http://127.0.0.1:'+srv.address().port,
  close:async()=>{await new Promise(resolve=>srv.close(resolve));
   fs.rmSync(folder,{recursive:true,force:true});}};
}
test('an enabled gateway only emits a redacted yes/no for a fixed scoped read',async()=>{
 const restore=applyEnv();reads=0;writes=0;
 const probe=createStagingReadProbe({Firestore:FakeFirestore,env:{...VALID_ENV}});
 const {url,close}=await setup({stagingReadProbe:probe});
 try{
  const r=await fetch(url+PROBE_PATH);
  assert.equal(r.status,200);
  const output=await r.json();
  assert.deepEqual(output,{ok:true,mode:'staging_firestore_read_only',
   reachable:true,fixture_exists:false,acceptanceEnabled:false,writeEnabled:false});
  assert.equal(r.headers.get('cache-control'),'no-store, max-age=0');
  assert.equal(r.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
  assert.equal(reads,1);assert.equal(writes,0);
  assert.equal(lastPath,'stagingOfferFixtures/'+PROBE_FIXTURE_ID);
  assert.deepEqual(lastOptions,{projectId:'lszh-automations',databaseId:'lszh-offers-staging'});
  assert.ok(!JSON.stringify(output).includes(PROBE_FIXTURE_ID));
  assert.equal((await fetch(url+'/api/offer/accept',{method:'POST'})).status,503);
 }finally{await close();restore();}
});
test('read endpoint refuses unknown parameters/methods and cannot trigger extra reads',async()=>{
 const restore=applyEnv();reads=0;
 const probe=createStagingReadProbe({Firestore:FakeFirestore,env:{...VALID_ENV}});
 const {url,close}=await setup({stagingReadProbe:probe});
 try{
  assert.equal((await fetch(url+PROBE_PATH+'?fixture=anything')).status,400);
  assert.equal((await fetch(url+PROBE_PATH,{method:'POST'})).status,405);
  assert.equal((await fetch(url+PROBE_PATH,{method:'PUT'})).status,405);
  assert.equal((await fetch(url+PROBE_PATH+'/other')).status,404);
  assert.equal(reads,0);
 }finally{await close();restore();}
});
test('missing opt-in handler or incorrect Cloud Run context always hides the endpoint',async()=>{
 const invalid=[
  {LSZH_STAGING_READ_PROBE_ENABLED:'no'},
  {NODE_ENV:'test'}, {K_SERVICE:'lszh-offer-portal-staging'},
  {K_REVISION:'lszh-offer-portal-staging-00001-test'},
  {GOOGLE_CLOUD_PROJECT:'another-project'},
  {LSZH_FIRESTORE_DATABASE_ID:'(default)'},
  {LSZH_FIRESTORE_STAGING_WRITE_ENABLED:'true'},
  {GOOGLE_APPLICATION_CREDENTIALS:'/tmp/secret.json'},
  {FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'}
 ];
 for(const field of invalid){
  const restore=applyEnv(field);
  const e=await setup({stagingReadProbe:async()=>({reachable:true,fixtureExists:false})});
  try{
   assert.equal(isReadProbeRuntime(process.env),false);
   assert.equal((await fetch(e.url+PROBE_PATH)).status,404);
   assert.throws(()=>createStagingReadProbe({Firestore:FakeFirestore,env:process.env}));
  }finally{await e.close();restore();}
 }
 const restore=applyEnv();
 const e=await setup();
 try{assert.equal((await fetch(e.url+PROBE_PATH)).status,404);}
 finally{await e.close();restore();}
});
test('Firestore read error is sanitized and never exposes internal exception or data',async()=>{
 const restore=applyEnv();
 const e=await setup({stagingReadProbe:async()=>{throw Error('private-key-trace-sensitive');}});
 try{
  const r=await fetch(e.url+PROBE_PATH);
  assert.equal(r.status,503);
  const s=await r.text();
  assert.doesNotMatch(s,/private-key|sensitive|trace/i);
  assert.equal(JSON.parse(s).error,'staging_unavailable');
 }finally{await e.close();restore();}
});
test('record contents cannot leak even if a synthetic record exists in Firestore',async()=>{
 const restore=applyEnv();
 class ExistingFake {
  constructor(opts){this.options=opts;}
  doc(){return {get:async()=>({exists:true,data:()=>({
   schemaVersion:1,testOnly:true,fixtureId:PROBE_FIXTURE_ID,
   recipientEmail:'fake-secret@example.invalid',tokenHash:'sensitive-test-data'
  })})};}
 }
 const probe=createStagingReadProbe({Firestore:ExistingFake,env:{...VALID_ENV}});
 const e=await setup({stagingReadProbe:probe});
 try{
  const res=await fetch(e.url+PROBE_PATH);
  assert.equal(res.status,200);
  const txt=await res.text();
  assert.equal(JSON.parse(txt).fixture_exists,true);
  assert.doesNotMatch(txt,/fake-secret|tokenHash|stagingOfferFixtures|LSZH-STAGING-20261015-001/);
 }finally{await e.close();restore();}
});
test('incorrect fixture schema must fail closed and never return forged details',async()=>{
 const restore=applyEnv();
 class ForgedFake {
  constructor(opts){this.options=opts;}
  doc(){return {get:async()=>({exists:true,data:()=>({
   schemaVersion:1,testOnly:false,fixtureId:PROBE_FIXTURE_ID,
   recipientEmail:'sensitive@example.invalid'
  })})};}
 }
 const probe=createStagingReadProbe({Firestore:ForgedFake,env:{...VALID_ENV}});
 const e=await setup({stagingReadProbe:probe});
 try{
  const res=await fetch(e.url+PROBE_PATH);
  assert.equal(res.status,503);
  assert.doesNotMatch(await res.text(),/sensitive@example.invalid/);
 }finally{await e.close();restore();}
});
