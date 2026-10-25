'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {digest}=require('../offer-contract-package');
const {ROOT}=require('../contract-gmail-c35-readonly-api-staging');
const {
  SERVICE,PROJECT,SECRET_PURPOSE,EXPECTED_MAILBOX,SCOPE,
  requireIsolatedStaging,readSecretEnvelope,createC37StagingGmailBackend
}=require('../contract-gmail-c37-backend-staging');

const NOW=1792920000000;
const CID='470613067122-testonlyc37clientsecret.apps.googleusercontent.com';
const RECIPIENT='test-approved@example.com';
const ALIAS='info@lszh-automations.ch';
const MID='gmail_c37_test_00001';
const EVENT='contract_send_pkg_test_c37_quote_1_r1';
const SHA='a'.repeat(64);
const RUNTIME=Object.freeze({
  K_SERVICE:SERVICE,GOOGLE_CLOUD_PROJECT:PROJECT,
  LSZH_C37_READONLY_ENABLED:'true',LSZH_C37_TEST_ONLY:'true'
});
function config(overrides={}){
  return JSON.stringify({
    version:1,purpose:SECRET_PURPOSE,
    expectedMailbox:EXPECTED_MAILBOX,
    clientId:CID,
    clientSecret:'TEST_ONLY_C37_CLIENT_SECRET_NOT_REAL',
    refreshToken:'TEST_ONLY_C37_REFRESH_TOKEN_NOT_REAL',
    approvedSenders:[ALIAS],
    allowedRecipients:[RECIPIENT],
    ...overrides
  });
}
function fixture({avv=false,external=false,configJson=config()}={}){
  const types=avv?['offer','terms','avv']:['offer','terms'];
  const attachments=new Map();
  const docs=types.map(kind=>{
    const bytes=Buffer.from('%PDF-1.4\nTEST_ONLY '+kind+'\n'+'.'.repeat(120));
    const filename='TEST_ONLY_'+kind+'.pdf';
    const attachmentId='attachment_'+kind+'_0001';
    attachments.set(attachmentId,bytes);
    return {kind,filename,bytes:bytes.length,sha256:digest(bytes),
      attachmentId,data:bytes};
  });
  const expected={eventId:EVENT,packageSha256:SHA,recipient:RECIPIENT,
    documentHashes:docs.map(d=>({
      kind:d.kind,filename:d.filename,sha256:d.sha256,bytes:d.bytes
    }))};
  const receipt={ok:true,eventId:EVENT,packageSha256:SHA,to:RECIPIENT,
    attachmentCount:docs.length,provider:'gmail',messageId:MID};
  const message={id:MID,labelIds:['SENT'],payload:{
    headers:[
      {name:'From',value:'LSZH Automations <'+ALIAS+'>'},
      {name:'To',value:RECIPIENT},
      {name:'Subject',value:'[TEST_ONLY] C3.7 sichere PDF-Lesepruefung'},
      {name:'X-LSZH-Contract-Event',value:EVENT},
      {name:'X-LSZH-Package-SHA256',value:SHA}
    ],
    parts:docs.map(d=>({
      mimeType:'application/pdf',filename:d.filename,
      body:external?{size:d.bytes,attachmentId:d.attachmentId}:
        {size:d.bytes,data:d.data.toString('base64url')}
    }))
  }};
  let info={aud:CID,scopes:[SCOPE],expiry_date:NOW+3600000};
  let mailbox=EXPECTED_MAILBOX;
  let failAt=null;
  let token='TEST_ONLY_C37_MINTED_ACCESS_TOKEN';
  let secret=configJson;
  const calls={created:[],set:[],refresh:0,info:0,gmail:[]};
  function makeClient(clientId,clientSecret){
    calls.created.push({clientId,secretUsed:clientSecret!==undefined});
    const isManager=clientSecret!==undefined;
    return {
      setCredentials:credentials=>calls.set.push({isManager,credentials:{...credentials}}),
      getAccessToken:async()=>{
        assert.equal(isManager,true);
        calls.refresh++;
        if(failAt==='token')throw new Error('raw provider error (MUST NOT LEAK)');
        return {token};
      },
      getTokenInfo:async value=>{
        assert.equal(value,token);calls.info++;
        if(failAt==='tokeninfo')throw new Error('raw token diagnostic');
        return info;
      },
      request:async request=>{
        assert.equal(isManager,false,'Gmail must use the access-token-only reader');
        calls.gmail.push(request);
        if(failAt==='gmail')throw new Error('raw Gmail response');
        if(request.url===ROOT+'/profile')return {data:{emailAddress:mailbox}};
        if(request.url===ROOT+'/messages/'+MID+'?format=full')
          return {data:message};
        const prefix=ROOT+'/messages/'+MID+'/attachments/';
        if(request.url.startsWith(prefix)){
          const bytes=attachments.get(request.url.slice(prefix.length));
          if(!bytes)throw new Error('unknown synthetic attachment');
          return {data:{size:bytes.length,data:bytes.toString('base64url')}};
        }
        throw new Error('unexpected URL');
      }
    };
  }
  const build=(overrides={})=>createC37StagingGmailBackend({
    runtime:RUNTIME,now:()=>NOW,
    loadManagedSecret:async()=>secret,makeClient,...overrides
  });
  return {docs,attachments,expected,receipt,message,calls,build,
    info:value=>{info=value},mailbox:value=>{mailbox=value},
    fail:v=>{failAt=v},token:v=>{token=v},
    secret:v=>{secret=v}};
}
function blockedResponse(r){
  assert.deepEqual(r,{verified:false,status:'BLOCKED'});
}
test('C3.7 refuses absent or productive Cloud Run configuration',()=>{
  for(const runtime of [
    undefined,{}, {...RUNTIME,K_SERVICE:'lszh-crm-v2'},
    {...RUNTIME,GOOGLE_CLOUD_PROJECT:'production-other'},
    {...RUNTIME,LSZH_C37_READONLY_ENABLED:'false'},
    {...RUNTIME,LSZH_C37_TEST_ONLY:'false'},
    {...RUNTIME,LSZH_C37_ENABLE_SENDING:'true'},
    {...RUNTIME,LSZH_C37_ALLOW_CUSTOMER_MAIL:'true'}
  ]){
    assert.throws(()=>requireIsolatedStaging(runtime),/isolated staging/);
  }
  assert.doesNotThrow(()=>requireIsolatedStaging(RUNTIME));
});
test('C3.7 envelope requires exact policy, workspace mailbox, and named sender/recipient lists',()=>{
  const parsed=readSecretEnvelope(config());
  assert.equal(parsed.expectedMailbox,EXPECTED_MAILBOX);
  assert.deepEqual(parsed.approvedSenders,[ALIAS]);
  for(const bad of [
    '{}','malformed','[]',
    config({purpose:'LIVE_CUSTOMER_MAIL'}),
    config({version:2}),
    config({expectedMailbox:'personal@gmail.com'}),
    config({clientId:'bad'}),
    config({refreshToken:'too-short'}),
    config({clientSecret:''}),
    config({allowedRecipients:[]}),
    config({allowedRecipients:['*@example.com']}),
    config({approvedSenders:[ALIAS,ALIAS]}),
    config({unknownField:'prohibited'})
  ])assert.throws(()=>readSecretEnvelope(bad),/managed secret|allowlist/);
});
test('C3.7 constructor does not call secret loader or Google until invoked',()=>{
  const f=fixture();
  const app=f.build();
  assert.equal(typeof app.inspectAuthorisedMailbox,'function');
  assert.equal(typeof app.verifyExistingSentTestEvidence,'function');
  assert.deepEqual(f.calls.created,[]);
  assert.equal(f.calls.refresh,0);
  assert.equal(f.calls.gmail.length,0);
});
test('C3.7 server check verifies token audience, exact scope, and LSZH profile via GET only',async()=>{
  const f=fixture();
  assert.deepEqual(await f.build().inspectAuthorisedMailbox(),{
    verified:true,status:'READONLY_MAILBOX_VERIFIED'
  });
  assert.equal(f.calls.refresh,1);
  assert.equal(f.calls.info,1);
  assert.deepEqual(f.calls.gmail.map(q=>q.url),[ROOT+'/profile']);
  assert.ok(f.calls.gmail.every(q=>q.method==='GET'));
  assert.deepEqual(f.calls.created.map(c=>c.secretUsed),[true,false]);
  const manager=f.calls.set.filter(x=>x.isManager);
  const reader=f.calls.set.filter(x=>!x.isManager);
  assert.ok(manager[0].credentials.refresh_token.length>20);
  assert.equal('refresh_token' in reader[0].credentials,false);
  assert.deepEqual(manager.at(-1).credentials,{});
  assert.deepEqual(reader.at(-1).credentials,{});
});
test('C3.7 exactly verifies an existing SENT two-PDF test fixture without sending',async()=>{
  const f=fixture();
  const result=await f.build().verifyExistingSentTestEvidence({
    receipt:f.receipt,expected:f.expected
  });
  assert.deepEqual(result,{verified:true,status:'READONLY_SENT_EVIDENCE_VERIFIED'});
  assert.deepEqual(f.calls.gmail.map(x=>x.url),[
    ROOT+'/profile',ROOT+'/messages/'+MID+'?format=full'
  ]);
  assert.ok(f.calls.gmail.every(x=>x.method==='GET'));
});
test('C3.7 actual attachment-get shape handles three distinct AVV PDFs',async()=>{
  const f=fixture({avv:true,external:true});
  const result=await f.build().verifyExistingSentTestEvidence({
    receipt:f.receipt,expected:f.expected
  });
  assert.equal(result.verified,true);
  assert.equal(f.calls.gmail.filter(x=>x.url.includes('/attachments/')).length,3);
  assert.ok(f.calls.gmail.every(x=>x.method==='GET'));
});
test('C3.7 no token scope/audience proof means NO Gmail requests',async()=>{
  for(const payload of [
    {aud:'unknown-client',scopes:[SCOPE],expiry_date:NOW+3600000},
    {aud:CID,scopes:['https://www.googleapis.com/auth/gmail.send'],expiry_date:NOW+3600000},
    {aud:CID,scopes:[SCOPE,'openid'],expiry_date:NOW+3600000},
    {aud:CID,scopes:[SCOPE],expiry_date:NOW+1000}
  ]){
    const f=fixture();f.info(payload);
    blockedResponse(await f.build().verifyExistingSentTestEvidence({
      receipt:f.receipt,expected:f.expected
    }));
    assert.equal(f.calls.gmail.length,0);
    assert.deepEqual(f.calls.set.at(-1).credentials,{});
  }
});
test('C3.7 fake/private Gmail identity cannot read SENT message or verify',async()=>{
  const f=fixture();f.mailbox('personal@gmail.com');
  blockedResponse(await f.build().verifyExistingSentTestEvidence({
    receipt:f.receipt,expected:f.expected
  }));
  assert.deepEqual(f.calls.gmail.map(x=>x.url),[ROOT+'/profile']);
});
test('C3.7 disallowed From alias or wrong recipient fails closed',async()=>{
  const f=fixture();
  f.message.payload.headers[0].value='LSZH Automations <unapproved@example.com>';
  blockedResponse(await f.build().verifyExistingSentTestEvidence({
    receipt:f.receipt,expected:f.expected
  }));
  const f2=fixture();
  f2.expected.recipient='nonallowlisted@example.com';
  blockedResponse(await f2.build().verifyExistingSentTestEvidence({
    receipt:f2.receipt,expected:f2.expected
  }));
  assert.equal(f2.calls.gmail.length,0);
});
test('C3.7 changed PDF SHA and fake SENT labels reject independently',async()=>{
  const f=fixture({avv:true,external:true});
  f.expected.documentHashes[2].sha256='b'.repeat(64);
  blockedResponse(await f.build().verifyExistingSentTestEvidence({
    receipt:f.receipt,expected:f.expected
  }));
  const f2=fixture();f2.message.labelIds=['INBOX'];
  blockedResponse(await f2.build().verifyExistingSentTestEvidence({
    receipt:f2.receipt,expected:f2.expected
  }));
});
test('C3.7 token refresh, token info, Gmail timeouts are fail closed and secrets not returned',async()=>{
  for(const stage of ['token','tokeninfo','gmail']){
    const f=fixture();f.fail(stage);
    const result=await f.build().verifyExistingSentTestEvidence({
      receipt:f.receipt,expected:f.expected
    });
    blockedResponse(result);
    assert.doesNotMatch(JSON.stringify(result),/raw|secret|token|email/i);
    assert.equal(f.calls.refresh,1);
    assert.deepEqual(f.calls.set.at(-1).credentials,{});
  }
});
test('C3.7 missing secret and empty access tokens are blocked before Gmail GET',async()=>{
  const f=fixture();f.secret('');
  blockedResponse(await f.build().inspectAuthorisedMailbox());
  assert.equal(f.calls.refresh,0);
  const f2=fixture();f2.token(null);
  blockedResponse(await f2.build().inspectAuthorisedMailbox());
  assert.equal(f2.calls.gmail.length,0);
});
test('C3.7 ordinary customer events cannot request ANY Gmail data',async()=>{
  const f=fixture();
  f.expected.eventId='contract_send_pkg_customer_011_r1';
  blockedResponse(await f.build().verifyExistingSentTestEvidence({
    receipt:f.receipt,expected:f.expected
  }));
  assert.equal(f.calls.refresh,0);
  assert.equal(f.calls.gmail.length,0);
});
test('C3.7 does not have any live CRM, Make, Firestore or email delivery path',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,
    '../contract-gmail-c37-backend-staging.js'),'utf8');
  for(const live of ['server.js','offer-send.js']){
    const active=fs.readFileSync(path.resolve(__dirname,'..',live),'utf8');
    assert.doesNotMatch(active,/contract-gmail-c37-backend-staging/);
  }
  assert.doesNotMatch(source,/\/messages\/send|\.sendMail\(|\bcreateDraft\(|gcloud run deploy|runTransaction\(/);
  assert.doesNotMatch(source,/writeFileSync|localStorage|Firestore|mcp__Make__/);
  assert.equal(typeof createC37StagingGmailBackend,'function');
});
