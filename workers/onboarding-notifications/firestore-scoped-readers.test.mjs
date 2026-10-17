import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createScopedReader,decodeOutboxDraft,ENABLE_FLAG}=
 require('./firestore-scoped-readers');
const {eventId,makeDraft}=require('./outbox');
const {toFirestore}=require('./firestore-store');
const {planQuarantine}=require('./quarantine-plan');
const {STATUS}=require('./draft-review-gate');
const {buildQuarantineCommit}=require('./firestore-quarantine-cas');

const ID=eventId('rec'+'A'.repeat(14));
const TOKEN='synthetic-not-real-token-for-firestore-read-only-tests-123456789';
const ENDPOINT='https://firestore.googleapis.com/v1/projects/lszh-automations/databases/';
const META='http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/';
const EMAILS={
 outbox:'lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com',
 quarantine:'lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com'
};
const DBS={outbox:'lszh-offers-staging',quarantine:'lszh-quarantine-staging'};
const COLS={outbox:'lszh_onboarding_notification_drafts_staging',
 quarantine:'lszh_onboarding_quarantine_cases_staging'};
const readURL=(scope)=>ENDPOINT+DBS[scope]+'/documents/'+COLS[scope]+'/'+ID;
const draft=makeDraft('rec'+'A'.repeat(14),new Date('2026-10-17T16:00:00.000Z'));
function syntheticDocument(scope) {
 if(scope==='outbox')return {
  name:readURL(scope).replace('https://firestore.googleapis.com/v1/',''),
  fields:toFirestore(draft).fields,updateTime:'2026-10-17T16:00:01.123456Z'
 };
 const review={status:STATUS.QUARANTINE,reason:'ONBOARDING_NOT_COMPLETE',
  quarantineRecommended:true,deliveryAllowed:false,requiresManualApproval:true};
 const proposal=planQuarantine({draftId:ID,review,
  reviewedAt:'2026-10-17T16:01:00.000Z'});
 const write=buildQuarantineCommit({proposal}).body.writes[0];
 return {name:write.update.name,fields:write.update.fields,
  updateTime:'2026-10-17T16:01:01.123456Z'};
}
function fakeResponse(status,body='',headers={}) {
 const value=typeof body==='string'?body:JSON.stringify(body);
 return {status,headers:{get:k=>headers[k]??null},
  text:async()=>value};
}
function simulate(scope,{
 identity=EMAILS[scope],dbStatus=200,document=syntheticDocument(scope),
 metadataStatus=200,tokenType='Bearer',tokenExpires=1800,
 token=TOKEN,tooBig=false
}={}){
 const calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url,method:options?.method,headers:options?.headers,redirect:options?.redirect});
  assert.equal(options.method,'GET');
  assert.equal(options.redirect,'manual');
  if(url===META+'email')
   return fakeResponse(metadataStatus,identity);
  if(url===META+'token')
   return fakeResponse(metadataStatus,{
    access_token:token,token_type:tokenType,expires_in:tokenExpires
   });
  if(url===readURL(scope)) {
   assert.equal(options.headers.Authorization,'Bearer '+token);
   return fakeResponse(dbStatus,document,
    tooBig?{'content-length':'999999'}:{});
  }
  throw Error('attempted_an_unexpected_network_request');
 };
 const env={[ENABLE_FLAG]:'true',LSZH_OUTBOX_STAGE_ENABLED:'false',
  LSZH_SCOPED_READER_SCOPE:scope,FIRESTORE_PROJECT_ID:'lszh-automations',
  FIRESTORE_DATABASE_ID:DBS[scope]};
 return {calls,fetchImpl,env};
}
async function call(scope,options={},envOverrides={}){
 const sim=simulate(scope,options);
 const reader=createScopedReader({scope,env:{...sim.env,...envOverrides},
  fetchImpl:sim.fetchImpl});
 return {answer:await reader.read(ID),calls:sim.calls};
}
test('read adapters refuse default/partial activation without any network call',async()=>{
 for(const scope of ['outbox','quarantine']){
  const sim=simulate(scope);
  for(const overrides of [
   {[ENABLE_FLAG]:'false'}, {LSZH_OUTBOX_STAGE_ENABLED:'true'},
   {LSZH_SCOPED_READER_SCOPE:'other'},
   {FIRESTORE_PROJECT_ID:'wrong-project'},
   {FIRESTORE_DATABASE_ID:DBS[scope==='outbox'?'quarantine':'outbox']}
  ]){
   assert.throws(()=>createScopedReader({scope,fetchImpl:sim.fetchImpl,
    env:{...sim.env,...overrides}}),/scoped_reader_disabled/);
  }
  assert.equal(sim.calls.length,0);
 }
 assert.throws(()=>createScopedReader({scope:'other',env:{}}),/scoped_reader_scope_invalid/);
});
test('source identity reads exactly one offers-outbox document (never quarantine)',async()=>{
 const {answer,calls}=await call('outbox');
 assert.equal(answer.status,'VERIFIED_DRAFT');
 assert.deepEqual(answer.draft,draft);
 assert.equal(answer.writesAllowed,false);
 assert.equal(answer.deliveryAllowed,false);
 assert.ok(Object.isFrozen(answer.draft));
 assert.deepEqual(calls.map(x=>x.url),[META+'email',META+'token',readURL('outbox')]);
 assert.ok(calls.every(x=>x.method==='GET'));
 assert.equal(calls.some(x=>x.url.includes('lszh-quarantine-staging')),false);
 assert.equal(JSON.stringify(answer).includes(TOKEN),false);
});
test('quarantine identity reads only separate named database with strict Firestore snapshot',async()=>{
 const {answer,calls}=await call('quarantine');
 assert.equal(answer.status,'VERIFIED_QUARANTINE_SNAPSHOT');
 assert.equal(answer.snapshot.record.revision,1);
 assert.equal(answer.snapshot.record.deliveryAllowed,false);
 assert.equal(answer.snapshot.record.requiresManualApproval,true);
 assert.equal(answer.writesAllowed,false);
 assert.equal(answer.readStatus,200);
 assert.ok(Object.isFrozen(answer.document));
 assert.ok(Object.isFrozen(answer.document.fields.events.arrayValue.values[0].mapValue.fields));
 assert.equal(answer.document.name,readURL('quarantine').replace('https://firestore.googleapis.com/v1/',''));
 assert.deepEqual(calls.map(x=>x.url),[META+'email',META+'token',readURL('quarantine')]);
 assert.equal(calls.some(x=>x.url.includes('lszh-offers-staging')),false);
 assert.equal(JSON.stringify(answer).includes(TOKEN),false);
});
test('wrong runtime service identity is blocked before token or Firestore request',async()=>{
 for(const scope of ['outbox','quarantine']){
  const sim=simulate(scope,{identity:EMAILS[scope==='outbox'?'quarantine':'outbox']});
  const reader=createScopedReader({scope,env:sim.env,fetchImpl:sim.fetchImpl});
  await assert.rejects(reader.read(ID),/scoped_reader_identity_mismatch/);
  assert.deepEqual(sim.calls.map(x=>x.url),[META+'email']);
 }
});
test('missing, invalid or expired runtime token blocks without Firestore query',async()=>{
 for(const opts of [
  {metadataStatus:403}, {tokenType:'Basic'}, {tokenExpires:1}, {token:'bad'}
 ]){
  const sim=simulate('outbox',opts);
  const reader=createScopedReader({scope:'outbox',env:sim.env,fetchImpl:sim.fetchImpl});
  await assert.rejects(reader.read(ID),/scoped_reader_(identity_unavailable|token_invalid)/);
  assert.equal(sim.calls.some(x=>x.url===readURL('outbox')),false);
 }
});
test('missing source draft is not treated as a legitimate quarantine trigger',async()=>{
 const sim=simulate('outbox',{dbStatus:404});
 const reader=createScopedReader({scope:'outbox',env:sim.env,fetchImpl:sim.fetchImpl});
 await assert.rejects(reader.read(ID),/outbox_draft_missing/);
 assert.equal(sim.calls.length,3);
});
test('missing quarantine case is a normal no-write observation',async()=>{
 const {answer,calls}=await call('quarantine',{dbStatus:404});
 assert.equal(answer.status,'MISSING');
 assert.equal(answer.writesAllowed,false);
 assert.equal(answer.readStatus,404);
 assert.equal(answer.document,null);
 assert.equal('draft' in answer,false);
 assert.equal('request' in answer,false);
 assert.equal(calls.length,3);
});
test('HTTP redirects, IAM denials and service errors cannot be misread as a 404',async()=>{
 for(const scope of ['outbox','quarantine']){
  for(const status of [301,302,401,403,408,429,500,503]){
   const sim=simulate(scope,{dbStatus:status});
   const reader=createScopedReader({scope,env:sim.env,fetchImpl:sim.fetchImpl});
   await assert.rejects(reader.read(ID),/scoped_reader_document_unavailable/);
   assert.equal(sim.calls.length,3);
  }
 }
});
test('untrusted outbox snapshots with wrong ID, extra fields, invalid flags or timestamps fail',async()=>{
 const valid=syntheticDocument('outbox');
 const invalid=[
  {...valid,name:valid.name.replace('lszh-offers-staging','lszh-quarantine-staging')},
  {...valid,name:valid.name.replace(ID,'0'.repeat(64))},
  {...valid,fields:{...valid.fields,recipient:{stringValue:'secret@example.invalid'}}},
  {...valid,fields:{...valid.fields,deliveryEnabled:{booleanValue:true}}},
  {...valid,fields:{...valid.fields,testOnly:{booleanValue:false}}},
  {...valid,fields:{...valid.fields,createdAt:{timestampValue:'2026-02-30T16:00:00Z'}}},
  {...valid,fields:{...valid.fields,createdAt:{timestampValue:'2026-10-17T16:00:00.000001Z'}}},
  {...valid,fields:{...valid.fields,recordId:{stringValue:'rec'+'B'.repeat(14)}}}
 ];
 for(const doc of invalid){
  assert.throws(()=>decodeOutboxDraft(doc,ID),/outbox_document_invalid/);
 }
});
test('untrusted quarantine snapshot cannot inject recipient, enable delivery or change ID',async()=>{
 const valid=syntheticDocument('quarantine');
 for(const document of [
  {...valid,name:valid.name.replace('lszh-quarantine-staging','lszh-offers-staging')},
  {...valid,fields:{...valid.fields,recipient:{stringValue:'secret@example.invalid'}}},
  {...valid,fields:{...valid.fields,deliveryAllowed:{booleanValue:true}}}
 ]){
  const sim=simulate('quarantine',{document});
  const reader=createScopedReader({scope:'quarantine',env:sim.env,fetchImpl:sim.fetchImpl});
  await assert.rejects(reader.read(ID),/quarantine_snapshot_invalid/);
 }
});
test('larger or malformed body is not accepted by either domain',async()=>{
 for(const scope of ['outbox','quarantine']){
  const sim=simulate(scope,{tooBig:true});
  const reader=createScopedReader({scope,env:sim.env,fetchImpl:sim.fetchImpl});
  await assert.rejects(reader.read(ID),/scoped_reader_response_(oversize|invalid)/);
 }
});
test('incorrect IDs are rejected before checking identity or calling Firestore',async()=>{
 for(const scope of ['outbox','quarantine']){
  const sim=simulate(scope);
  const reader=createScopedReader({scope,env:sim.env,fetchImpl:sim.fetchImpl});
  for(const wrong of ['../../',ID.toUpperCase(),'a'.repeat(63),null]){
   await assert.rejects(reader.read(wrong),/scoped_reader_id_invalid/);
  }
  assert.equal(sim.calls.length,0);
 }
});
test('reader module exports no write/sender/impersonation helpers',()=>{
 const mod=require('./firestore-scoped-readers');
 assert.deepEqual(Object.keys(mod).sort(),
  ['ENABLE_FLAG','createScopedReader','decodeOutboxDraft']);
 for(const key of ['send','commit','update','delete','impersonate','grantRole',
  'createServer','run','activate','write']){
  assert.equal(key in mod,false);
 }
});
