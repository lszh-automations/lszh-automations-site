'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {JOB,verifySentReadback}=require('../c373-sent-readback-job');
const EXPECTED=require('../c373-sent-readback-expected.json');
const {SECRET_PURPOSE,EXPECTED_MAILBOX}=require('../contract-gmail-c37-backend-staging');
const CID='470613067122-c373syntheticclient.apps.googleusercontent.com';
const SCOPE='https://www.googleapis.com/auth/gmail.readonly';
const NOW=Date.parse('2026-10-25T18:30:00.000Z');
function mock(change={}){
  let reads=0,evidence=0,clears=0,clients=0;
  const runtime={CLOUD_RUN_JOB:JOB,CLOUD_RUN_EXECUTION:JOB+'-offline',
    CLOUD_RUN_TASK_INDEX:'0',CLOUD_RUN_TASK_COUNT:'1',CLOUD_RUN_TASK_ATTEMPT:'0',
    GOOGLE_CLOUD_PROJECT:'lszh-automations',LSZH_C37_READONLY_ENABLED:'true',
    LSZH_C37_TEST_ONLY:'true',LSZH_C37_ENABLE_SENDING:'false',
    LSZH_C37_ALLOW_CUSTOMER_MAIL:'false',LSZH_TEST_MESSAGE_ID:'synthetic_1234',...change.runtime};
  const secret={version:1,purpose:SECRET_PURPOSE,expectedMailbox:EXPECTED_MAILBOX,
    clientId:CID,clientSecret:'TEST_ONLY_C373_CLIENT_SECRET',refreshToken:'TEST_ONLY_C373_REFRESH_TOKEN_123456',
    approvedSenders:['info@lszh-automations.ch'],allowedRecipients:['lars.schulthess@outlook.com'],...change.secret};
  const opts={runtime,now:()=>NOW,loadSecret:async()=>{reads++;return JSON.stringify(secret);},
    makeClient:(id,clientSecret)=>{
      clients++;assert.equal(id,CID);
      const base={setCredentials:value=>{if(!Object.keys(value).length)clears++;}};
      return clientSecret===undefined?base:{...base,
        getAccessToken:async()=>({token:'TEST_ONLY_SHORT_ACCESS_TOKEN'}),
        getTokenInfo:async()=>({aud:CID,expiry_date:NOW+3600000,scopes:change.scopes||[SCOPE]})};
    },makeVerifier:config=>{
      assert.equal(config.expectedMailbox,EXPECTED_MAILBOX);
      assert.deepEqual(config.approvedSenders,['info@lszh-automations.ch']);
      return {verifyMailbox:async()=>({mailbox:EXPECTED_MAILBOX}),verifyGatewayReceipt:async({receipt,expected})=>{
        evidence++;assert.deepEqual(expected,EXPECTED);
        assert.equal(receipt.messageId,runtime.LSZH_TEST_MESSAGE_ID);
        assert.equal(receipt.attachmentCount,3);
        if(change.providerError)throw Error('PRIVATE PROVIDER TOKEN PAYLOAD');
        return change.proven!==false;
      }};
    }};
  return {opts,reads:()=>reads,evidence:()=>evidence,clears:()=>clears,clients:()=>clients};
}
test('C373 readback uses exact pinned package and clears both credential clients',async()=>{
  const f=mock();assert.deepEqual(await verifySentReadback(f.opts),{
    verified:true,status:'C373_SENT_PDF_READONLY_PASS',attachmentCount:3,sendPermitted:false});
  assert.equal(f.evidence(),1);assert.equal(f.clears(),2);
});
test('C373 invalid context or message identifier blocks before reading secret',async()=>{
  for(const runtime of [{K_SERVICE:'live'},{CLOUD_RUN_TASK_ATTEMPT:'1'},
    {LSZH_TEST_MESSAGE_ID:'../../messages'},{LSZH_C37_ENABLE_SENDING:'true'}]){
    const f=mock({runtime});await assert.rejects(verifySentReadback(f.opts),/BLOCKED/);
    assert.equal(f.reads(),0);
  }
});
test('C373 unapproved recipient or sender blocks before OAuth',async()=>{
  for(const secret of [{allowedRecipients:[EXPECTED_MAILBOX]},
    {approvedSenders:['other@example.com']}]){
    const f=mock({secret});await assert.rejects(verifySentReadback(f.opts));assert.equal(f.clients(),0);
  }
});
test('C373 expanded token scopes block before any message read',async()=>{
  const f=mock({scopes:[SCOPE,'https://www.googleapis.com/auth/gmail.send']});
  await assert.rejects(verifySentReadback(f.opts));assert.equal(f.evidence(),0);assert.equal(f.clears(),1);
});
test('C373 missing provider proof and sensitive errors never become PASS',async()=>{
  for(const change of [{proven:false},{providerError:true}]){
    const f=mock(change);
    await assert.rejects(verifySentReadback(f.opts),e=>e.message==='C3.7.3 SENT readback BLOCKED');
    assert.equal(f.clears(),2);
  }
});
test('C373 pre-send policy check verifies identity without reading a message',async()=>{
  const f=mock({runtime:{LSZH_C373_CHECK:'policy_only'}});
  delete f.opts.runtime.LSZH_TEST_MESSAGE_ID;
  assert.deepEqual(await verifySentReadback(f.opts),{ready:true,
    status:'C373_READONLY_POLICY_PASS',sentEvidenceVerified:false,sendPermitted:false});
  assert.equal(f.evidence(),0);assert.equal(f.clears(),2);
});
test('C373 policy check cannot accept a message ID or unknown mode',async()=>{
  for(const runtime of [{LSZH_C373_CHECK:'policy_only'},{LSZH_C373_CHECK:'send'}]){
    const f=mock({runtime});await assert.rejects(verifySentReadback(f.opts));assert.equal(f.reads(),0);
  }
});
