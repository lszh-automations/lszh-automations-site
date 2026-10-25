'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JOB,requireJobRuntime,probeProfile}=
  require('../c372-profile-job');
const {
  PROJECT,SECRET_PURPOSE,EXPECTED_MAILBOX
}=require('../contract-gmail-c37-backend-staging');
const SCOPE='https://www.googleapis.com/auth/gmail.readonly';
const CID='470613067122-c372syntheticclient.apps.googleusercontent.com';
const NOW=1792945000000;
const RUNTIME=Object.freeze({
  CLOUD_RUN_JOB:JOB,CLOUD_RUN_EXECUTION:JOB+'-mock123',
  CLOUD_RUN_TASK_INDEX:'0',CLOUD_RUN_TASK_COUNT:'1',
  CLOUD_RUN_TASK_ATTEMPT:'0',GOOGLE_CLOUD_PROJECT:PROJECT,
  LSZH_C37_READONLY_ENABLED:'true',LSZH_C37_TEST_ONLY:'true',
  LSZH_C37_ENABLE_SENDING:'false',LSZH_C37_ALLOW_CUSTOMER_MAIL:'false'
});
function envelope(){
  return JSON.stringify({
    version:1,purpose:SECRET_PURPOSE,expectedMailbox:EXPECTED_MAILBOX,
    clientId:CID,clientSecret:'TEST_ONLY_CLIENT_SECRET_123456',
    refreshToken:'TEST_ONLY_C372_REFRESH_TOKEN_123456',
    approvedSenders:['info@lszh-automations.ch'],
    allowedRecipients:[EXPECTED_MAILBOX]
  });
}
function mock(overrides={}){
  let reads=0,gets=0;
  const calls={made:[],tokens:[],clear:0};
  const create=(id,secret)=>{
    assert.equal(id,CID);
    calls.made.push(secret===undefined?'reader':'refresh');
    return secret===undefined?{
      setCredentials:x=>{if(!Object.keys(x).length)calls.clear++},
      request:async q=>{
        gets++;assert.equal(q.method,'GET');
        assert.equal(q.url,'https://gmail.googleapis.com/gmail/v1/users/me/profile');
        return {data:{emailAddress:overrides.mailbox||EXPECTED_MAILBOX}};
      }
    }:{
      setCredentials:x=>{
        calls.tokens.push(Object.keys(x));
        if(!Object.keys(x).length)calls.clear++;
      },
      getAccessToken:async()=>({token:'TEST_ONLY_ACCESS_TOKEN_12345'}),
      getTokenInfo:async()=>({
        aud:overrides.aud||CID,
        scopes:overrides.scopes||[SCOPE],
        expiry_date:overrides.expires??NOW+3600000
      })
    };
  };
  const opts={
    runtime:overrides.runtime||RUNTIME,
    loadSecret:async()=>{reads++;return envelope()},
    makeClient:create,now:()=>NOW
  };
  return {opts,calls,reads:()=>reads,gets:()=>gets};
}
test('C3.7.2 cloud job runtime validates exact job, one task, no retries, no service',()=>{
  assert.doesNotThrow(()=>requireJobRuntime(RUNTIME));
  for(const env of [
    {...RUNTIME,CLOUD_RUN_JOB:'wrong'},
    {...RUNTIME,CLOUD_RUN_TASK_INDEX:'1'},
    {...RUNTIME,CLOUD_RUN_TASK_COUNT:'2'},
    {...RUNTIME,CLOUD_RUN_TASK_ATTEMPT:'1'},
    {...RUNTIME,K_SERVICE:'lszh-crm-v2-c37-readonly-staging'},
    {...RUNTIME,GOOGLE_CLOUD_PROJECT:'other'},
    {...RUNTIME,LSZH_C37_TEST_ONLY:'false'},
    {...RUNTIME,LSZH_C37_ENABLE_SENDING:'true'},
    {...RUNTIME,LSZH_C37_ALLOW_CUSTOMER_MAIL:'true'}
  ])assert.throws(()=>requireJobRuntime(env),/BLOCKED/);
});
test('C3.7.2 invalid task context denies before loading any secret',async()=>{
  const f=mock({runtime:{...RUNTIME,CLOUD_RUN_TASK_COUNT:'3'}});
  await assert.rejects(probeProfile(f.opts),/BLOCKED/);
  assert.equal(f.reads(),0);
  assert.deepEqual(f.calls.made,[]);
});
test('C3.7.2 job performs one exact Gmail-profile GET, no message access',async()=>{
  const f=mock();
  assert.deepEqual(await probeProfile(f.opts),{
    verified:true,status:'C372_PROFILE_READONLY_PASS',
    gmailGetCount:1,sendPermitted:false
  });
  assert.equal(f.reads(),1);
  assert.equal(f.gets(),1);
  assert.deepEqual(f.calls.made,['refresh','reader']);
  assert.deepEqual(f.calls.tokens[0],['refresh_token']);
  assert.equal(f.calls.clear,2);
});
test('C3.7.2 rejects expanded OAuth rights before Gmail or customer read',async()=>{
  for(const change of [
    {scopes:[SCOPE,'https://www.googleapis.com/auth/gmail.send']},
    {scopes:['https://www.googleapis.com/auth/gmail.modify']},
    {aud:'other-client'}, {expires:NOW+500}
  ]){
    const f=mock(change);
    await assert.rejects(probeProfile(f.opts),/BLOCKED/);
    assert.equal(f.gets(),0);
    assert.equal(f.calls.clear,1);
  }
});
test('C3.7.2 wrong mailbox is blocked and credentials cleared',async()=>{
  const f=mock({mailbox:'someone@gmail.com'});
  await assert.rejects(probeProfile(f.opts),/BLOCKED/);
  assert.equal(f.gets(),1);
  assert.equal(f.calls.clear,2);
});
test('C3.7.2 missing mounted secret is blocked without provider disclosure',async()=>{
  const f=mock();
  f.opts.loadSecret=async()=>{throw Error('private token and personal text')};
  await assert.rejects(probeProfile(f.opts),e=>{
    assert.equal(e.message,'C3.7.2 profile probe BLOCKED');
    return true;
  });
  assert.equal(f.gets(),0);
});
test('C3.7.2 Cloud Run job has no HTTP routes, mail send or Firestore writes',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../c372-profile-job.js'),'utf8');
  for(const name of ['server.js','offer-send.js']){
    const live=fs.readFileSync(path.resolve(__dirname,'..',name),'utf8');
    assert.equal(live.includes('c372-profile-job'),false);
  }
  for(const forbidden of ['http.createServer','/messages/send',
    'gmail.send','sendMail(','new Firestore(','makeDispatcher(',
    'writeFileSync(','runTransaction(','fetch(']){
    assert.equal(source.includes(forbidden),false,'Forbidden: '+forbidden);
  }
  assert.equal(source.includes("require('./contract-gmail-c35-readonly-api-staging')"),true);
});
