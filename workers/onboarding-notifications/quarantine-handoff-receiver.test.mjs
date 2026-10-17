import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createHandoffReceiver,decodeSecret}=require('./quarantine-handoff-receiver');
const {createDurableReplayClaimOnce}=require('./quarantine-handoff-replay-runtime');
const {buildHandoff}=require('./quarantine-handoff-protocol');
const {STATUS}=require('./draft-review-gate');
const {eventId}=require('./outbox');
const {PATH}=require('./quarantine-handoff-http-contract');
const key=Buffer.alloc(32,0x31);
const at=Date.parse('2026-10-17T18:00:00.000Z');
const id=eventId('rec'+'A'.repeat(14));
const sa='lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com';
const root='projects/lszh-automations/databases/lszh-quarantine-staging/documents/';
const replay=root+'lszh_quarantine_handoff_replay_staging/';
const cases=root+'lszh_onboarding_quarantine_cases_staging/';
const version='2026-10-17T18:00:01.123456Z';
const env={
 LSZH_QUARANTINE_HANDOFF_HTTP_ENABLED:'true',
 LSZH_QUARANTINE_REPLAY_WRITE_ENABLED:'true',
 LSZH_QUARANTINE_HMAC_B64:key.toString('base64'),
 LSZH_OUTBOX_STAGE_ENABLED:'false',LSZH_QUARANTINE_HANDOFF_MODE:'REVIEW_ONLY',
 LSZH_SCOPED_STAGING_READER_ENABLED:'true',LSZH_SCOPED_READER_SCOPE:'quarantine',
 FIRESTORE_PROJECT_ID:'lszh-automations',FIRESTORE_DATABASE_ID:'lszh-quarantine-staging'
};
const make=nonce=>buildHandoff({documentId:id,
 review:{status:STATUS.QUARANTINE,reason:'ONBOARDING_NOT_COMPLETE',
  quarantineRecommended:true,deliveryAllowed:false,requiresManualApproval:true},
 secret:key,issuedAtMs:at,nonce});
const message=make('7'.repeat(32));
function mocks({identity=sa,commitStatus=200,quarantineStatus=404}={}){
 const calls=[],docs=new Map();
 const response=(status,body)=>{
  const content=typeof body==='string'?body:JSON.stringify(body??{});
  return {status,headers:{get:()=>String(Buffer.byteLength(content))},
   text:async()=>content};
 };
 const fetchImpl=async (url,options)=>{
  calls.push({url,method:options.method,redirect:options.redirect});
  if(url.endsWith('/email') && url.includes('metadata.google.internal'))
   return response(200,identity);
  if(url.endsWith('/token') && url.includes('metadata.google.internal'))
   return response(200,{access_token:'FAKE_'+('a'.repeat(70)),
    token_type:'Bearer',expires_in:1800});
  if(options.method==='POST' && url.endsWith('/documents:commit')){
   assert.equal(options.redirect,'manual');
   const w=JSON.parse(options.body).writes;
   assert.equal(w.length,1);
   assert.deepEqual(w[0].currentDocument,{exists:false});
   assert.match(w[0].update.name,/lszh_quarantine_handoff_replay_staging\/[a-f0-9]{64}$/);
   if(commitStatus!==200)return response(commitStatus,{});
   if(docs.has(w[0].update.name))return response(409,{});
   docs.set(w[0].update.name,{...w[0].update,updateTime:version});
   return response(200,{writeResults:[{updateTime:version}],commitTime:version});
  }
  if(options.method==='GET' && url.includes('firestore.googleapis.com')){
   const name=url.replace('https://firestore.googleapis.com/v1/','');
   if(name.startsWith(replay)){
    return docs.has(name)?response(200,docs.get(name)):response(404,{});
   }
   if(name.startsWith(cases))return response(quarantineStatus,{});
  }
  throw Error('unexpected_network_call');
 };
 return {calls,docs,fetchImpl};
}
async function serve({runtime=mocks(),settings=env,clock=at+1000}={}){
 const server=createHandoffReceiver({env:settings,fetchImpl:runtime.fetchImpl,
  nowMs:()=>clock});
 await new Promise((resolve,reject)=>{
  server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
 });
 const url='http://127.0.0.1:'+server.address().port;
 return {runtime,url,close:()=>new Promise(resolve=>server.close(resolve))};
}
const send=(url,envelope=message,options={})=>fetch(url+PATH,{
 method:'POST',headers:{'content-type':'application/json',...options.headers},
 body:JSON.stringify(envelope)
});
test('receiver and replay claim default to disabled, no network and no persistence',async()=>{
 const runtime=mocks(),t=await serve({runtime,settings:{...env,
  LSZH_QUARANTINE_REPLAY_WRITE_ENABLED:'false'}});
 try{
  const res=await send(t.url);
  assert.equal(res.status,503);
  assert.deepEqual(await res.json(),{error:'handoff_disabled'});
  assert.equal(runtime.calls.length,0);
  assert.equal(runtime.docs.size,0);
 }finally{await t.close();}
 assert.throws(()=>createDurableReplayClaimOnce({env:{},fetchImpl:runtime.fetchImpl}),
  /replay_runtime_disabled/);
});
test('private receiver uses HMAC and atomic Firestore replay claim, no case mutation',async()=>{
 const runtime=mocks(),t=await serve({runtime});
 try {
  const first=await send(t.url);
  assert.equal(first.status,202);
  assert.deepEqual(await first.json(),{mode:'STAGING_REVIEW_ONLY',
   status:'MANUAL_REVIEW_REQUIRED',deliveryAllowed:false});
  const second=await send(t.url);
  assert.equal(second.status,403,'second nonce cannot reenter');
  assert.equal(runtime.docs.size,1);
  assert.equal(runtime.calls.filter(c=>c.method==='POST').length,2);
  assert.equal(runtime.calls.filter(c=>c.method==='GET' &&
   c.url.includes('firestore.googleapis.com')).length,2,
   'one replay readback and one case GET, never twice');
  assert.equal(runtime.calls.some(c=>c.method==='DELETE'||c.method==='PATCH'),false);
  assert.equal(runtime.calls.some(c=>c.url.includes('lszh-offers-staging')),false);
  const raw=JSON.stringify([...runtime.docs.values()]);
  for(const forbidden of ['@gmail.com','recipient','mail','ob_','Authorization','access_token']){
   assert.equal(raw.includes(forbidden),false,forbidden);
  }
 }finally{await t.close();}
});
test('invalid HMAC cannot claim, even with spoofed authorization headers',async()=>{
 const runtime=mocks(),t=await serve({runtime});
 try {
  const forged={...message,signature:'A'.repeat(43)};
  const res=await send(t.url,forged,{headers:{
   authorization:'Bearer totally-fake',
   'x-forwarded-user':sa,
   'x-goog-authenticated-user-email':sa
  }});
  assert.equal(res.status,403);
  assert.equal(runtime.calls.length,0);
 }finally{await t.close();}
});
test('invalid Cloud runtime identity cannot write replay claims or read cases',async()=>{
 const runtime=mocks({identity:'other@lszh-automations.iam.gserviceaccount.com'});
 const t=await serve({runtime});
 try {
  assert.equal((await send(t.url)).status,403);
  assert.equal(runtime.calls.filter(c=>c.method==='POST').length,0);
  assert.equal(runtime.docs.size,0);
 }finally{await t.close();}
});
test('ambiguous commit, IAM error and Firestore 403 cannot become accepted',async()=>{
 for(const commitStatus of [409,412,500,503]){
  const runtime=mocks({commitStatus}),t=await serve({runtime});
  try{
   assert.equal((await send(t.url)).status,403);
   assert.equal(runtime.calls.filter(c=>c.method==='GET' &&
    c.url.includes('firestore.googleapis.com')).length,0);
  }finally{await t.close();}
 }
 const runtime=mocks({quarantineStatus:403}),t=await serve({runtime});
 try{
  assert.equal((await send(t.url)).status,403);
  assert.equal(runtime.docs.size,1,'replay remains consumed after downstream failure');
 }finally{await t.close();}
});
test('unrelated routes, chunked body and invalid MIME never touch Google metadata',async()=>{
 const runtime=mocks(),t=await serve({runtime});
 try {
  const get=await fetch(t.url+'/health');
  assert.equal(get.status,404);
  const badMime=await fetch(t.url+PATH,{method:'POST',
   headers:{'content-type':'text/plain'},body:JSON.stringify(message)});
  assert.equal(badMime.status,400);
  const compressed=await fetch(t.url+PATH,{method:'POST',
   headers:{'content-type':'application/json','content-encoding':'gzip'},
   body:JSON.stringify(message)});
  assert.equal(compressed.status,400);
  assert.equal(runtime.calls.length,0);
 }finally{await t.close();}
});
test('32-byte Secret Manager value must be canonical base64, not plain or short',()=>{
 assert.deepEqual(decodeSecret(env),key);
 for(const v of [undefined,'',key.toString('hex'),'AAAA',key.toString('base64')+' ']){
  assert.equal(decodeSecret({...env,LSZH_QUARANTINE_HMAC_B64:v}),null);
 }
});
test('receiver exports only factory and decoder, no sender or quarantine commit',()=>{
 const mod=require('./quarantine-handoff-receiver');
 assert.deepEqual(Object.keys(mod).sort(),['createHandoffReceiver','decodeSecret']);
 for(const name of ['send','deliver','email','persistCase','quarantineCommit','grantIam'])
  assert.equal(name in mod,false);
});
