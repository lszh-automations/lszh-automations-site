import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {run,load,safeEnv,airtableAbsent}=require('./staging-synthetic-source-e2e-once.js');
const {generate}=require('./synthetic-source-fixture-local.js');
const source=require('./staging-synthetic-source-e2e-once.js');
const UUID='d23190ab-89cd-4abc-9234-222222222222';
const fixture=generate({now:new Date('2026-10-17T17:00:00.000Z'),uuid:()=>UUID,choice:()=>1});
const env={
 LSZH_SYNTHETIC_SOURCE_E2E_ONCE:'true',
 LSZH_SOURCE_HANDOFF_ENABLED:'true',LSZH_OUTBOX_STAGE_ENABLED:'false',
 LSZH_SCOPED_STAGING_READER_ENABLED:'true',LSZH_SCOPED_READER_SCOPE:'outbox',
 FIRESTORE_PROJECT_ID:'lszh-automations',FIRESTORE_DATABASE_ID:'lszh-offers-staging',
 LSZH_QUARANTINE_HANDOFF_MODE:'REVIEW_ONLY',
 LSZH_QUARANTINE_SERVICE_URL:'https://lszh-quarantine-handoff-staging-ozx7mp2bka-oa.a.run.app',
 CLOUD_RUN_JOB:'lszh-quarantine-source-e2e-staging',CLOUD_RUN_TASK_INDEX:'0',
 CLOUD_RUN_TASK_COUNT:'1',CLOUD_RUN_TASK_ATTEMPT:'0',
 AIRTABLE_ONBOARDING_READ_TOKEN:'A'.repeat(44),
 LSZH_QUARANTINE_HMAC_B64:Buffer.alloc(32,1).toString('base64'),
 LSZH_SYNTHETIC_FIXTURE_JSON:JSON.stringify(fixture),
 LSZH_EXPECTED_FIXTURE_SHA256:createHash('sha256').update(fixture.projectCode).digest('hex')
};
const resp=(status,body)=>({
 status,headers:{get:()=>null},
 text:async()=>typeof body==='string'?body:JSON.stringify(body)
});
test('fixture secret verified against pinned digest, expected databases and frozen send-disabled draft',()=>{
 assert.equal(load(env).documentId,fixture.documentId);
 for(const change of [
  {LSZH_EXPECTED_FIXTURE_SHA256:'f'.repeat(64)},
  {LSZH_SYNTHETIC_FIXTURE_JSON:JSON.stringify({...fixture,airtableAbsenceVerified:true})},
  {LSZH_SYNTHETIC_FIXTURE_JSON:JSON.stringify({...fixture,projectCode:'ob_00000000-0000-4000-8000-000000000000'})},
  {LSZH_SYNTHETIC_FIXTURE_JSON:JSON.stringify({...fixture,draft:{...fixture.draft,emailSent:true}})},
  {LSZH_SYNTHETIC_FIXTURE_JSON:JSON.stringify({...fixture,firestorePersisted:true})}
 ])assert.throws(()=>load({...env,...change}),/fixture_secret_invalid/);
});
test('only exact Cloud Run Job first task/first attempt with all send gates disabled is eligible',()=>{
 assert.equal(safeEnv(env),true);
 for(const change of [
  {CLOUD_RUN_JOB:'website-service'}, {CLOUD_RUN_TASK_ATTEMPT:'1'},
  {CLOUD_RUN_TASK_INDEX:'1'}, {CLOUD_RUN_TASK_COUNT:'2'},
  {LSZH_OUTBOX_STAGE_ENABLED:'true'}, {LSZH_SOURCE_HANDOFF_ENABLED:'false'},
  {FIRESTORE_DATABASE_ID:'(default)'}, {LSZH_QUARANTINE_HANDOFF_MODE:'SEND'},
  {LSZH_QUARANTINE_SERVICE_URL:'https://example.com'}
 ])assert.equal(safeEnv({...env,...change}),false);
});
test('live Airtable absence requires exactly empty records, GET-only strict projectcode filter',async()=>{
 let count=0;
 assert.equal(await airtableAbsent(fixture.projectCode,env.AIRTABLE_ONBOARDING_READ_TOKEN,
  async(url,opts)=>{
   count++;
   const u=new URL(url);
   assert.equal(u.hostname,'api.airtable.com');
   assert.equal(u.pathname,'/v0/appzJiskpAdaR1HEv/tblWIY4l4VASz8Vse');
   assert.equal(u.searchParams.get('maxRecords'),'2');
   assert.equal(u.searchParams.get('filterByFormula'),"{Projektcode}='"+fixture.projectCode+"'");
   assert.deepEqual(u.searchParams.getAll('fields[]'),['Projektcode']);
   assert.equal(opts.method,'GET');
   assert.equal(opts.redirect,'manual');
   assert.equal(opts.body,undefined);
   return resp(200,{records:[]});
  }),true);
 assert.equal(count,1);
 for(const body of [{records:[{id:'recABCDEFG1234567'}]},
  {records:[],offset:'next'}, {records:null}, {}]){
  await assert.rejects(()=>airtableAbsent(fixture.projectCode,env.AIRTABLE_ONBOARDING_READ_TOKEN,
   async()=>resp(200,body)),/airtable_absence_not_verified/);
 }
 for(const status of [401,403,429,500]){
  await assert.rejects(()=>airtableAbsent(fixture.projectCode,env.AIRTABLE_ONBOARDING_READ_TOKEN,
   async()=>resp(status,{records:[]})),/airtable_absence_not_verified/);
 }
});
test('successful end-to-end obeys metadata -> Airtable absent -> Firestore create -> scoped readback -> signed source handoff',async()=>{
 const events=[];
 const fetchImpl=async(url)=>{
  if(url.includes('metadata.google.internal')){
   events.push('metadata');
   return resp(200,'lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com');
  }
  if(url.startsWith('https://api.airtable.com/')) {
   events.push('airtable');
   return resp(200,{records:[]});
  }
  throw Error('Unexpected network request '+new URL(url).hostname);
 };
 const result=await run({env,fetchImpl,
  storeFactory:()=>({createOnce:async(id,draft)=>{
   assert.equal(id,fixture.documentId);
   assert.deepEqual(draft,fixture.draft);
   events.push('firestore_create');
   return 'created';
  }}),
  scopedFactory:()=>({read:async(id)=>{
   assert.equal(id,fixture.documentId);
   events.push('firestore_readback');
   return {status:'VERIFIED_DRAFT',draft:fixture.draft};
  }}),
  dispatch:async({env:actualEnv})=>{
   assert.equal(actualEnv.LSZH_STAGING_DOCUMENT_ID,fixture.documentId);
   assert.equal(actualEnv.LSZH_STAGING_PROJECT_CODE,fixture.projectCode);
   assert.equal(actualEnv.LSZH_STAGING_FIXTURE_CODES,fixture.fixtureAllowlist);
   events.push('private_signed_dispatch');
   return {status:'REVIEW_ONLY_HANDOFF_ACKNOWLEDGED',
    deliveryAllowed:false,retryAllowed:false,writeAllowed:false};
  }});
 assert.equal(result.status,'PASS_SYNTHETIC_SOURCE_E2E_REVIEW_ONLY');
 assert.deepEqual(events,['metadata','airtable','firestore_create','firestore_readback','private_signed_dispatch']);
 assert.equal(result.customerDataProcessed,false);
});
test('refuse ambiguous states: no Firestore after Airtable collision, no transport after duplicate or bad readback',async()=>{
 const events=[];
 const fetched=async(url)=>{
  if(url.includes('metadata.google.internal'))return resp(200,'lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com');
  if(url.startsWith('https://api.airtable.com/'))return resp(200,{records:[{id:'recABCDEFG1234567'}]});
  throw Error('unexpected');
 };
 await assert.rejects(()=>run({env,fetchImpl:fetched,
  storeFactory:()=>({createOnce:()=>{events.push('write');return 'created';}})}),/airtable_absence_not_verified/);
 assert.deepEqual(events,[]);
 for(const actualResult of ['exists','unavailable']){
  const states=[];
  await assert.rejects(()=>run({env,fetchImpl:async(url)=>{
   if(url.includes('metadata.google.internal'))return resp(200,'lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com');
   return resp(200,{records:[]});
  },storeFactory:()=>({createOnce:async()=>actualResult}),
  scopedFactory:()=>({read:async()=>{states.push('read');return {status:'VERIFIED_DRAFT',draft:fixture.draft};}}),
  dispatch:async()=>{states.push('dispatch');return {status:'REVIEW_ONLY_HANDOFF_ACKNOWLEDGED'};}}),/synthetic_draft_not_new/);
  assert.deepEqual(states,[]);
 }
});
test('invalid container identity blocks before Firestore or Airtable access',async()=>{
 let other=0;
 await assert.rejects(()=>run({env,fetchImpl:async()=>resp(200,'wrong@example.org'),
  storeFactory:()=>({createOnce:()=>{other++;}})}),/source_identity_mismatch/);
 assert.equal(other,0);
});
test('runtime has no email sender and never prints fixture or credentials',()=>{
 const s=require('node:fs').readFileSync(require.resolve('./staging-synthetic-source-e2e-once.js'),'utf8');
 assert.doesNotMatch(s,/sendMail|smtp|sendgrid|nodemailer|gcloud|execSync|spawnSync/);
 assert.doesNotMatch(s,/console\.log\([^)]*projectCode|console\.log\([^)]*token/);
 assert.match(s,/BLOCKED_SYNTHETIC_SOURCE_E2E/);
 assert.deepEqual(Object.keys(source).sort(),['airtableAbsent','load','run','safeEnv']);
});
