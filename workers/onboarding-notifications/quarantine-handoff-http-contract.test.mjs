import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {buildHandoff}=require('./quarantine-handoff-protocol');
const {STATUS}=require('./draft-review-gate');
const {eventId}=require('./outbox');
const {parseHandoffHttpRequest,PATH,ENABLE,MAX_BYTES}=
 require('./quarantine-handoff-http-contract');
const secret=Buffer.alloc(32,0x31);
const env={
 [ENABLE]:'true',LSZH_OUTBOX_STAGE_ENABLED:'false',
 LSZH_QUARANTINE_HANDOFF_MODE:'REVIEW_ONLY',
 FIRESTORE_PROJECT_ID:'lszh-automations',
 FIRESTORE_DATABASE_ID:'lszh-quarantine-staging'
};
const envelope=buildHandoff({
 documentId:eventId('rec'+'A'.repeat(14)),
 review:{status:STATUS.QUARANTINE,reason:'ONBOARDING_NOT_COMPLETE',
  quarantineRecommended:true,deliveryAllowed:false,requiresManualApproval:true},
 secret,issuedAtMs:Date.parse('2026-10-17T15:00:00.000Z'),
 nonce:'a'.repeat(32)
});
const payload=Buffer.from(JSON.stringify(envelope));
const request=(changes={})=>({
 method:'POST',path:PATH,headers:{
  'content-type':'application/json',
  'content-length':String(payload.byteLength)
 },body:payload,env,...changes
});
test('disabled endpoint has no processing even for valid signed body',()=>{
 for(const disabled of [
  undefined,{...env,[ENABLE]:'false'},
  {...env,LSZH_OUTBOX_STAGE_ENABLED:'true'},
  {...env,LSZH_QUARANTINE_HANDOFF_MODE:'SEND'},
  {...env,FIRESTORE_PROJECT_ID:'other'},
  {...env,FIRESTORE_DATABASE_ID:'lszh-offers-staging'}
 ]){
  const r=parseHandoffHttpRequest(request({env:disabled}));
  assert.equal(r.status,'BLOCKED_NO_HTTP_PROCESSING');
  assert.equal(r.reason,'ENDPOINT_DISABLED');
  assert.equal(r.authenticated,false);
  assert.equal(r.writeAllowed,false);
 }
});
test('candidate request parses strict JSON but cannot claim OIDC authentication or acceptance',()=>{
 const r=parseHandoffHttpRequest(request());
 assert.equal(r.status,'UNAUTHENTICATED_ENVELOPE_PARSED_NOT_ACCEPTED');
 assert.equal(r.authenticated,false);
 assert.equal(r.writeAllowed,false);
 assert.equal(r.deliveryAllowed,false);
 assert.deepEqual(r.envelope,envelope);
 assert.ok(Object.isFrozen(r));
 assert.ok(Object.isFrozen(r.envelope));
 assert.ok(Object.isFrozen(r.envelope.payload));
 assert.equal('commit' in r,false);
 assert.equal('send' in r,false);
});
test('route, method, preflight and unrelated endpoints always block',()=>{
 for(const [method,path] of [
  ['GET',PATH],['HEAD',PATH],['OPTIONS',PATH],
  ['POST','/'],['POST',PATH+'/'],['POST',PATH+'?admin=1'],
  ['PUT',PATH],['DELETE',PATH]
 ]){
  const r=parseHandoffHttpRequest(request({method,path}));
  assert.equal(r.status,'BLOCKED_NO_HTTP_PROCESSING');
  assert.equal(r.reason,'ROUTE_OR_METHOD_NOT_ALLOWED');
 }
});
test('wrong content type, compression or mismatched content length refused',()=>{
 for(const headers of [
  {'content-type':'text/plain'},
  {'content-type':'application/json; charset=utf-8'},
  {'content-type':'application/json','content-encoding':'gzip'},
  {'content-type':'application/json','content-length':'999'},
  {'content-type':'application/json','content-length':'abc'},
  {'content-type':'application/json','content-length':'0'}
 ]){
  const r=parseHandoffHttpRequest(request({headers}));
  assert.equal(r.status,'BLOCKED_NO_HTTP_PROCESSING');
 }
});
test('no oversized body, JSON arrays or unknown fields',()=>{
 for(const body of [
  Buffer.alloc(MAX_BYTES+1,'a'),Buffer.from(''),
  Buffer.from('not-json'),Buffer.from('[]'),
  Buffer.from(JSON.stringify({...envelope,recipient:'email@example.invalid'})),
  Buffer.from(JSON.stringify({...envelope,payload:{...envelope.payload,
    projectCode:'ob_1234'}}))
 ]){
  const r=parseHandoffHttpRequest(request({body,
   headers:{'content-type':'application/json'}}));
  assert.equal(r.status,'BLOCKED_NO_HTTP_PROCESSING');
 }
});
test('spoofed Google identity / forwarded principal headers never authenticate message',()=>{
 for(const injected of [
  {'x-goog-authenticated-user-email':'accounts.google.com:source'},
  {'x-forwarded-user':'lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com'},
  {'authorization':'Bearer totally-forged-ID-token'},
  {'x-serverless-authorization':'Bearer fake'},
  {'x-lszh-principal':'trusted'}
 ]){
  const r=parseHandoffHttpRequest(request({
   headers:{'content-type':'application/json',...injected}
  }));
  assert.equal(r.status,'UNAUTHENTICATED_ENVELOPE_PARSED_NOT_ACCEPTED');
  assert.equal(r.authenticated,false);
  assert.equal(r.writeAllowed,false);
 }
});
test('malformed envelope signatures do not become accepted messages',()=>{
 for(const signed of [
  {...envelope,signature:'wrong'},
  {...envelope,payload:{...envelope.payload,extra:true}},
  {...envelope,signature:null},
  {payload:envelope.payload}
 ]){
  const r=parseHandoffHttpRequest(request({
   body:Buffer.from(JSON.stringify(signed)),
   headers:{'content-type':'application/json'}
  }));
  assert.equal(r.status,'BLOCKED_NO_HTTP_PROCESSING');
 }
});
test('endpoint contract module exports no live server, networking or delivery API',()=>{
 const api=require('./quarantine-handoff-http-contract');
 assert.deepEqual(Object.keys(api).sort(),
  ['ENABLE','MAX_BYTES','PATH','parseHandoffHttpRequest']);
 for(const key of ['listen','createServer','start','fetch','send','persist',
  'commit','applyIam','verifyOidc','authorizePrincipal','email']){
  assert.equal(key in api,false);
 }
});
