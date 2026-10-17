import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {prepareSourceHandoff,inspectDestinationHandoff}=
 require('./quarantine-handoff-offline-flow');
const {ENABLE_FLAG}=require('./firestore-scoped-readers');
const {makeDraft,eventId}=require('./outbox');
const {toFirestore}=require('./firestore-store');
const {STATUS}=require('./draft-review-gate');
const {planQuarantine,STATES}=require('./quarantine-plan');
const {buildQuarantineCommit}=require('./firestore-quarantine-cas');

const code='ob_12345678-1234-4234-8234-123456789abc';
const record='rec'+'A'.repeat(14);
const id=eventId(record);
const draft=makeDraft(record,new Date('2026-10-17T14:00:00.000Z'));
const secret=Buffer.alloc(32,0x31);
const token='opaque-synthetic-not-a-real-GCP-credential-123456789';
const stamp=Date.parse('2026-10-17T15:00:00.000Z');
const nonce='7'.repeat(32);
const project='lszh-automations';
const sa={
 outbox:'lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com',
 quarantine:'lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com'
};
const db={outbox:'lszh-offers-staging',quarantine:'lszh-quarantine-staging'};
const coll={
 outbox:'lszh_onboarding_notification_drafts_staging',
 quarantine:'lszh_onboarding_quarantine_cases_staging'
};
function named(scope) {
 return 'projects/'+project+'/databases/'+db[scope]+
  '/documents/'+coll[scope]+'/'+id;
}
function outboxDoc() {
 return {name:named('outbox'),fields:toFirestore(draft).fields};
}
function quarantineDoc(){
 const review={status:STATUS.CURRENTLY_COMPLETE,reason:'FRESH_COMPLETE_EVIDENCE',
  quarantineRecommended:false,deliveryAllowed:false,requiresManualApproval:true};
 const proposal=planQuarantine({draftId:id,review,
  reviewedAt:'2026-10-17T14:59:00.000Z'});
 const w=buildQuarantineCommit({proposal}).body.writes[0];
 return {name:named('quarantine'),fields:w.update.fields,
  updateTime:'2026-10-17T14:59:01.123456Z'};
}
function context(scope,{identity=sa[scope],status=200,document=scope==='outbox'?outboxDoc():null}={}) {
 const calls=[];
 const metadata='http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/';
 const url='https://firestore.googleapis.com/v1/'+named(scope);
 const fetchImpl=async(address,request)=>{
  calls.push({url:address,method:request.method});
  assert.equal(request.method,'GET');
  assert.equal(request.redirect,'manual');
  const response=(s,body)=>({status:s,
   text:async()=>typeof body==='string'?body:JSON.stringify(body)});
  if(address===metadata+'email')return response(200,identity);
  if(address===metadata+'token')return response(200,{access_token:token,
    token_type:'Bearer',expires_in:1800});
  if(address===url)return response(status,document);
  throw Error('wrong_db_or_request');
 };
 const env={[ENABLE_FLAG]:'true',LSZH_OUTBOX_STAGE_ENABLED:'false',
  LSZH_SCOPED_READER_SCOPE:scope,
  FIRESTORE_PROJECT_ID:project,FIRESTORE_DATABASE_ID:db[scope]};
 return {calls,fetchImpl,env};
}
function airtable(mode='processing') {
 const calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url,method:options.method});
  assert.equal(options.method,'GET');
  const u=new URL(url);
  assert.equal(u.hostname,'api.airtable.com');
  assert.equal(options.headers.Authorization,'Bearer FAKE_READONLY_AIRTABLE_TOKEN');
  if(mode==='unavailable')throw Error('sensitive private@example.invalid');
  if(!u.pathname.endsWith('/tblWIY4l4VASz8Vse'))
   throw Error('unexpected further lookup');
  return {ok:true,json:async()=>({records:mode==='duplicate'?
   [{id:record,fields:{Projektcode:code}},
    {id:'rec'+'B'.repeat(14),fields:{Projektcode:code}}]:
   [{id:record,fields:{Projektcode:code,Status:'Neu'}}]})};
 };
 return {calls,fetchImpl};
}
function inputs(o,a,overrides={}) {
 return {documentId:id,projectCode:code,fixtureAllowlist:code,
  readToken:'FAKE_READONLY_AIRTABLE_TOKEN',
  secret,sourceEnv:o.env,sourceFirestoreFetch:o.fetchImpl,
  airtableFetch:a.fetchImpl,nowMs:stamp,nonce,...overrides};
}
async function signed(overrides={}) {
 const source=context('outbox'),a=airtable();
 const res=await prepareSourceHandoff(inputs(source,a,overrides));
 assert.equal(res.status,'SIGNED_NOT_SENT',JSON.stringify(res));
 return {res,source,a};
}
function safe(r){
 assert.equal(r.deliveryAllowed,false);
 assert.equal(r.writesAllowed,false);
 assert.equal(r.requiresManualApproval,true);
 assert.equal(r.retryAllowed,false);
 assert.equal(Object.isFrozen(r),true);
}
test('source side performs source-identity GET and fresh Airtable GET, signs minimal case without transporting',async()=>{
 const {res,source,a}=await signed();
 assert.equal(source.calls.length,3);
 assert.equal(a.calls.length,1);
 assert.deepEqual(source.calls.map(c=>c.method),['GET','GET','GET']);
 assert.equal(a.calls[0].method,'GET');
 assert.equal(res.envelope.payload.documentId,id);
 assert.equal(res.envelope.payload.reviewStatus,STATUS.QUARANTINE);
 assert.equal(res.envelope.payload.reviewReason,'ONBOARDING_NOT_COMPLETE');
 assert.ok(Object.isFrozen(res.envelope));
 safe(res);
 const publicText=JSON.stringify(res);
 for(const forbidden of ['ob_','FAKE_READONLY_AIRTABLE_TOKEN',
  'private@example.invalid','recAAAAAAAAAAAAAA','smtp','Bearer '])
  assert.equal(publicText.includes(forbidden),false,forbidden);
});
test('full simulated two-identity handoff is signature/replay protected and ends with CAS summary only',async()=>{
 const {res,source}=await signed();
 const destination=context('quarantine',{status:404});
 const used=new Set();
 const claimOnce=async key=>{
  if(used.has(key))return false;
  used.add(key);
  return true;
 };
 const input={envelope:res.envelope,secret,nowMs:stamp+3000,
  claimOnce,destinationEnv:destination.env,
  destinationFirestoreFetch:destination.fetchImpl};
 const result=await inspectDestinationHandoff(input);
 assert.equal(result.status,'OFFLINE_CAS_REVIEW_REQUIRED');
 assert.equal(result.operation,'created');
 assert.equal(result.proposedRevision,1);
 assert.equal(result.quarantineState,STATES.QUARANTINED);
 assert.equal('request' in result,false);
 assert.equal(destination.calls.length,3);
 assert.equal(source.calls.some(x=>x.url.includes('lszh-quarantine-staging')),false);
 assert.equal(destination.calls.some(x=>x.url.includes('lszh-offers-staging')),false);
 assert.equal(destination.calls.some(x=>x.method==='POST'),false);
 safe(result);
 const replay=await inspectDestinationHandoff(input);
 assert.equal(replay.status,'BLOCKED_NO_TRANSPORT');
 assert.equal(replay.reason,'REPLAY_OR_CLAIM_UNCERTAIN');
 assert.equal(destination.calls.length,3,'no second destination read');
 safe(replay);
});
test('existing quarantine record yields conditional update summary only',async()=>{
 const {res}=await signed();
 const destination=context('quarantine',{document:quarantineDoc()});
 const result=await inspectDestinationHandoff({envelope:res.envelope,
  secret,nowMs:stamp+3000,claimOnce:async()=>true,
  destinationEnv:destination.env,
  destinationFirestoreFetch:destination.fetchImpl});
 assert.equal(result.status,'OFFLINE_CAS_REVIEW_REQUIRED');
 assert.equal(result.operation,'updated');
 assert.equal(result.expectedRevision,1);
 assert.equal(result.proposedRevision,2);
 assert.equal(result.quarantineState,STATES.QUARANTINED);
 safe(result);
});
test('outbox missing, wrong source identity or disabled source scope cannot produce signed handoff',async()=>{
 for(const contextOpts of [
  {identity:sa.quarantine},{status:404}
 ]){
  const src=context('outbox',contextOpts),a=airtable();
  const r=await prepareSourceHandoff(inputs(src,a));
  assert.equal(r.status,'BLOCKED_NO_TRANSPORT');
  assert.equal(r.reason,'SOURCE_READ_NOT_VERIFIED');
  assert.equal(a.calls.length,0);
  safe(r);
 }
 const source=context('outbox'),a=airtable();
 const r=await prepareSourceHandoff(inputs(source,a,{
  sourceEnv:{...source.env,[ENABLE_FLAG]:'false'}
 }));
 assert.equal(r.status,'BLOCKED_NO_TRANSPORT');
 assert.equal(source.calls.length,0);
 safe(r);
});
test('source refuses unknown fixture and Airtable outage without sending a signed claim',async()=>{
 for(const override of [
  {fixtureAllowlist:'ob_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},
  {readToken:''}
 ]){
  const source=context('outbox'),a=airtable();
  const r=await prepareSourceHandoff(inputs(source,a,override));
  assert.equal(r.status,'BLOCKED_NO_TRANSPORT');
  assert.equal(source.calls.length,0);
  safe(r);
 }
 const source=context('outbox'),a=airtable('unavailable');
 const r=await prepareSourceHandoff(inputs(source,a));
 assert.equal(r.status,'HOLD_NO_TRANSPORT');
 assert.equal(source.calls.length,3);
 assert.equal('envelope' in r,false);
 safe(r);
});
test('receiver without durable claim backend, bad signature or wrong identity never plans CAS',async()=>{
 const {res}=await signed();
 const destination=context('quarantine',{identity:sa.outbox,status:404});
 const withoutClaim=await inspectDestinationHandoff({envelope:res.envelope,
  secret,nowMs:stamp+3000,
  destinationEnv:destination.env,
  destinationFirestoreFetch:destination.fetchImpl});
 assert.equal(withoutClaim.status,'BLOCKED_NO_TRANSPORT');
 assert.equal(destination.calls.length,0);
 const tampered=await inspectDestinationHandoff({envelope:{
  ...res.envelope,payload:{...res.envelope.payload,
   reviewReason:'AMBIGUOUS_ONBOARDING_STATE'}
 },secret,nowMs:stamp+3000,claimOnce:async()=>true,
 destinationEnv:destination.env,destinationFirestoreFetch:destination.fetchImpl});
 assert.equal(tampered.status,'BLOCKED_NO_TRANSPORT');
 assert.equal(destination.calls.length,0);
 const validWrongIdentity=await inspectDestinationHandoff({envelope:res.envelope,
  secret,nowMs:stamp+3000,claimOnce:async()=>true,
  destinationEnv:destination.env,
  destinationFirestoreFetch:destination.fetchImpl});
 assert.equal(validWrongIdentity.status,'BLOCKED_NO_TRANSPORT');
 assert.equal(validWrongIdentity.reason,'DESTINATION_READ_NOT_VERIFIED');
 assert.equal(destination.calls.length,1);
 safe(validWrongIdentity);
});
test('replay claiming with uncertain result blocks before any destination Firestore request',async()=>{
 const {res}=await signed();
 for(const claimOnce of [()=>false,()=>undefined,async()=>{throw Error('SECRET');}]){
  const destination=context('quarantine',{status:404});
  const r=await inspectDestinationHandoff({envelope:res.envelope,
   secret,nowMs:stamp+3000,claimOnce,
   destinationEnv:destination.env,
   destinationFirestoreFetch:destination.fetchImpl});
  assert.equal(r.status,'BLOCKED_NO_TRANSPORT');
  assert.equal(destination.calls.length,0);
  assert.doesNotMatch(JSON.stringify(r),/SECRET/);
  safe(r);
 }
});
test('receiver does not accept Firestore 403, unexpected response or malformed quarantine record',async()=>{
 const {res}=await signed();
 for(const opts of [{status:403},{status:500},
  {status:200,document:{name:named('quarantine'),fields:{invalid:'field'}}}]){
  const destination=context('quarantine',opts);
  const r=await inspectDestinationHandoff({envelope:res.envelope,
   secret,nowMs:stamp+3000,claimOnce:async()=>true,
   destinationEnv:destination.env,
   destinationFirestoreFetch:destination.fetchImpl});
  assert.equal(r.status,'BLOCKED_NO_TRANSPORT');
  assert.equal(r.reason,'DESTINATION_READ_NOT_VERIFIED');
  safe(r);
 }
});
test('offline flow cannot create services, send mail or export Firestore write methods',()=>{
 const m=require('./quarantine-handoff-offline-flow');
 assert.deepEqual(Object.keys(m).sort(),[
  'inspectDestinationHandoff','prepareSourceHandoff']);
 for(const method of ['send','post','createServer','commit','persist',
  'delete','createTask','grantRole','impersonate','run'])
  assert.equal(method in m,false);
});
