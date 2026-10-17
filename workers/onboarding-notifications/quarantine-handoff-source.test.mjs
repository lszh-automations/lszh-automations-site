import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {sourceDispatchOnce,targetBase}=require('./quarantine-handoff-source');
const {makeDraft,eventId}=require('./outbox');
const {toFirestore}=require('./firestore-store');
const code='ob_12345678-1234-4234-8234-123456789abc';
const record='rec'+'A'.repeat(14);
const id=eventId(record);
const secret=Buffer.alloc(32,0x31);
const uri='https://lszh-quarantine-handoff-staging-12345.europe-west6.run.app';
const outbox='projects/lszh-automations/databases/lszh-offers-staging/documents/lszh_onboarding_notification_drafts_staging/'+id;
const draft=makeDraft(record,new Date('2026-10-17T14:00:00.000Z'));
const env={
 LSZH_SOURCE_HANDOFF_ENABLED:'true',LSZH_OUTBOX_STAGE_ENABLED:'false',
 LSZH_SCOPED_STAGING_READER_ENABLED:'true',LSZH_SCOPED_READER_SCOPE:'outbox',
 LSZH_QUARANTINE_HANDOFF_MODE:'REVIEW_ONLY',
 FIRESTORE_PROJECT_ID:'lszh-automations',FIRESTORE_DATABASE_ID:'lszh-offers-staging',
 LSZH_QUARANTINE_HMAC_B64:secret.toString('base64'),
 LSZH_STAGING_DOCUMENT_ID:id,LSZH_STAGING_PROJECT_CODE:code,
 LSZH_STAGING_FIXTURE_CODES:code,
 AIRTABLE_ONBOARDING_READ_TOKEN:'FAKE_READONLY_AIRTABLE_TOKEN',
 LSZH_QUARANTINE_SERVICE_URL:uri
};
function stub({metadataIdentity='lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com',
 targetStatus=202}={}){
 const calls=[];
 const result=(status,body)=>({status,ok:status===200,
  text:async()=>typeof body==='string'?body:JSON.stringify(body),
  json:async()=>body});
 const fetchImpl=async(url,options)=>{
  calls.push({url,method:options.method,headers:options.headers,body:options.body});
  if(url.includes('metadata.google.internal')&&url.endsWith('/email'))
   return result(200,metadataIdentity);
  if(url.includes('metadata.google.internal')&&url.endsWith('/token'))
   return result(200,{access_token:'FAKE_'+('a'.repeat(70)),
    token_type:'Bearer',expires_in:1800});
  if(url.includes('metadata.google.internal')&&url.includes('/identity?audience=')){
   assert.equal(decodeURIComponent(url.split('audience=')[1]),uri);
   return result(200,'eyJhbGciOiJSUzI1NiJ9.'+('a'.repeat(80))+'.'+('b'.repeat(64)));
  }
  if(url==='https://firestore.googleapis.com/v1/'+outbox)
   return result(200,{name:outbox,fields:toFirestore(draft).fields});
  if(url.startsWith('https://api.airtable.com/'))
   return result(200,{records:[{id:record,fields:{Projektcode:code,Status:'Neu'}}]});
  if(url===uri+'/internal/quarantine/handoff'){
   assert.equal(options.method,'POST');
   assert.equal(options.redirect,'manual');
   assert.equal(options.headers['Content-Type'],'application/json');
   assert.equal(Number(options.headers['Content-Length']),Buffer.byteLength(options.body));
   assert.match(options.headers.Authorization,/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
   const msg=JSON.parse(options.body);
   assert.equal(msg.payload.documentId,id);
   assert.equal(msg.payload.reviewStatus,'QUARANTINE_RECOMMENDED');
   assert.equal(msg.payload.reviewReason,'ONBOARDING_NOT_COMPLETE');
   assert.equal(msg.payload.issuer,'lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com');
   assert.equal('projectCode' in msg.payload,false);
   assert.equal('email' in msg.payload,false);
   return result(targetStatus,{mode:'STAGING_REVIEW_ONLY',
    status:'MANUAL_REVIEW_REQUIRED',deliveryAllowed:false});
  }
  throw Error('unexpected_mock_request');
 };
 return {calls,fetchImpl};
}
test('sender remains disabled unless explicitly enabled and supplied exact synthetic fixtures',async()=>{
 const s=stub();
 for(const change of [{LSZH_SOURCE_HANDOFF_ENABLED:'false'},
  {LSZH_OUTBOX_STAGE_ENABLED:'true'},{LSZH_STAGING_DOCUMENT_ID:'f'.repeat(64)},
  {LSZH_QUARANTINE_SERVICE_URL:'https://example.com'},
  {LSZH_QUARANTINE_HMAC_B64:''}]){
  const result=await sourceDispatchOnce({env:{...env,...change},fetchImpl:s.fetchImpl});
  if(change.LSZH_STAGING_DOCUMENT_ID){
   assert.equal(result.status,'BLOCKED_NO_SOURCE_DISPATCH');
  }else assert.equal(result.status,'BLOCKED_NO_SOURCE_DISPATCH');
 }
 assert.equal(s.calls.filter(x=>x.method==='POST').length,0);
});
test('target must be exact private Google Cloud Run base domain, not arbitrary URL',()=>{
 assert.equal(targetBase(uri),uri);
 for(const value of ['http://'+uri.slice(8),
  uri+'/internal/quarantine/handoff',uri+'/?foo=1',
  'https://lszh-quarantine-handoff-staging-12345.europe-west6.run.app.evil.net',
  'https://bad-host.run.app',null,
  'https://lszh-quarantine-handoff-staging-12345.europe-west6.run.app:8443']){
  assert.equal(targetBase(value),null,value);
 }
});
test('source reads protected draft and fresh Airtable data, then one OIDC-authenticated POST only',async()=>{
 const s=stub();
 const result=await sourceDispatchOnce({env,fetchImpl:s.fetchImpl,
  nowMs:Date.parse('2026-10-17T18:00:00.000Z')});
 assert.equal(result.status,'REVIEW_ONLY_HANDOFF_ACKNOWLEDGED',JSON.stringify(result));
 assert.equal(result.deliveryAllowed,false);
 assert.equal(result.retryAllowed,false);
 assert.equal(s.calls.filter(x=>x.method==='POST').length,1);
 assert.equal(s.calls.filter(x=>x.url.startsWith('https://api.airtable.com/')).length,1);
 assert.equal(s.calls.filter(x=>x.url.includes('identity?audience=')).length,1);
 assert.equal(JSON.stringify(result).includes('FAKE_'),false);
});
test('wrong identity or HTTP 403/503 from target stops with no automatic resend',async()=>{
 for(const status of [403,503]){
  const s=stub({targetStatus:status});
  const result=await sourceDispatchOnce({env,fetchImpl:s.fetchImpl,
   nowMs:Date.parse('2026-10-17T18:00:00.000Z')});
  assert.equal(result.status,'BLOCKED_NO_SOURCE_DISPATCH');
  assert.equal(result.retryAllowed,false);
  assert.equal(s.calls.filter(x=>x.method==='POST').length,1);
 }
 const s=stub({metadataIdentity:'wrong@lszh-automations.iam.gserviceaccount.com'});
 const result=await sourceDispatchOnce({env,fetchImpl:s.fetchImpl});
 assert.equal(result.status,'BLOCKED_NO_SOURCE_DISPATCH');
 assert.equal(s.calls.filter(x=>x.method==='POST').length,0);
});
test('source module contains no scheduler, customer mail or automatic Firestore write capability',()=>{
 const m=require('./quarantine-handoff-source');
 assert.deepEqual(Object.keys(m).sort(),['sourceDispatchOnce','targetBase']);
 for(const name of ['sendMail','schedule','createService','commit','delete','grantIam'])
  assert.equal(name in m,false);
});
