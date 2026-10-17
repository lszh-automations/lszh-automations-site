import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {run,SECRET_PATH}=require('./airtable-runtime-probe');
const GOOD_ENV={
 LSZH_AIRTABLE_RUNTIME_PROBE_ONLY:'true',
 LSZH_OUTBOX_STAGE_ENABLED:'false',
 GOOGLE_CLOUD_PROJECT:'lszh-automations',
 CLOUD_RUN_JOB:'lszh-airtable-read-probe-staging',
 CLOUD_RUN_TASK_INDEX:'0',
 CLOUD_RUN_TASK_ATTEMPT:'0'
};
const TOKEN='pat_SYNTHETIC_READ_ONLY_VALIDATOR_123456789';
const CODE='ob_92f84f12-25cc-4552-9f80-93d33a77f61b';
function mock({status=200,records=[]}={}){
 let reads=0,fetches=0;const logs=[];
 return {
  readSecret:(path,enc)=>{reads++;assert.equal(path,SECRET_PATH);assert.equal(enc,'utf8');return TOKEN+'\n';},
  fetchImpl:async(url,options)=>{
   fetches++;
   const u=new URL(url);
   assert.equal(u.hostname,'api.airtable.com');
   assert.equal(u.pathname,'/v0/appzJiskpAdaR1HEv/tblWIY4l4VASz8Vse');
   assert.equal(options.method,'GET');
   assert.equal(options.headers.Authorization,'Bearer '+TOKEN);
   assert.equal(u.searchParams.get('filterByFormula'),"{Projektcode}='"+CODE+"'");
   assert.equal(u.searchParams.get('maxRecords'),'2');
   return {ok:status===200,status,json:async()=>({records})};
  },
  logs,log:(msg)=>logs.push(msg),
  counts:()=>({reads,fetches})
 };
}
test('disabled by default: no secret file access or network calls',async()=>{
 const x=mock();
 await assert.rejects(run({...x,env:{}}),/airtable_runtime_probe_disabled/);
 assert.deepEqual(x.counts(),{reads:0,fetches:0});
});
test('only one read of a mounted secret then one read-only Airtable REST request',async()=>{
 const x=mock();
 assert.equal(await run({...x,env:GOOD_ENV,freshCode:()=>CODE}),true);
 assert.deepEqual(x.counts(),{reads:1,fetches:1});
 assert.equal(x.logs.length,3);
 assert.doesNotMatch(x.logs.join(' '),/pat_|ob_92f84|Authorization/);
});
test('wrong Cloud Run job, task, attempt, account or enabled outbox all fail before reading secret',async()=>{
 for (const fragment of [
  {CLOUD_RUN_JOB:'lszh-onboarding-outbox-staging'},
  {CLOUD_RUN_TASK_INDEX:'1'},
  {CLOUD_RUN_TASK_ATTEMPT:'1'},
  {GOOGLE_CLOUD_PROJECT:'another-project'},
  {LSZH_OUTBOX_STAGE_ENABLED:'true'},
  {LSZH_AIRTABLE_RUNTIME_PROBE_ONLY:'false'}
 ]) {
  const x=mock();
  await assert.rejects(run({...x,env:{...GOOD_ENV,...fragment},freshCode:()=>CODE}),/airtable_runtime_probe_disabled/);
  assert.deepEqual(x.counts(),{reads:0,fetches:0});
 }
});
test('any plaintext secret/token fixture or Firestore config in environment prevents startup',async()=>{
 for (const fragment of [
  {AIRTABLE_ONBOARDING_READ_TOKEN:'bad'},
  {AIRTABLE_PERSONAL_ACCESS_TOKEN:'bad'},
  {OUTBOX_CONTROL_SECRET:'bad'},
  {LSZH_STAGING_FIXTURE_CODES:CODE},
  {FIRESTORE_PROJECT_ID:'lszh-automations'},
  {FIRESTORE_DATABASE_ID:'lszh-offers-staging'}
 ]) {
  const x=mock();
  await assert.rejects(run({...x,env:{...GOOD_ENV,...fragment},freshCode:()=>CODE}),/airtable_runtime_probe_disabled/);
  assert.deepEqual(x.counts(),{reads:0,fetches:0});
 }
});
test('wrong/unavailable token rejects without claiming success',async()=>{
 const x=mock({status:403});
 await assert.rejects(run({...x,env:GOOD_ENV,freshCode:()=>CODE}),/airtable_token_not_authorized/);
 assert.deepEqual(x.counts(),{reads:1,fetches:1});
 assert.equal(x.logs.length,0);
});
test('if random code unexpectedly has an existing CRM record: fail closed, no record-detail GET',async()=>{
 const x=mock({records:[{id:'rec'+'A'.repeat(14),fields:{
  Projektcode:CODE,Auftrag:['rec'+'B'.repeat(14)],Status:'Eingegangen'}}]});
 await assert.rejects(run({...x,env:GOOD_ENV,freshCode:()=>CODE}),/unexpected_airtable_request/);
 assert.deepEqual(x.counts(),{reads:1,fetches:1});
});
test('missing mounted secret is an error, not silent success',async()=>{
 const x=mock();
 await assert.rejects(run({...x,env:GOOD_ENV,readSecret:()=>{throw Error('ENOENT')},freshCode:()=>CODE}),/ENOENT/);
 assert.equal(x.counts().fetches,0);
});
