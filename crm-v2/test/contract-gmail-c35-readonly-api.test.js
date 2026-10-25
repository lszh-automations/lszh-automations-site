'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {digest}=require('../offer-contract-package');
const {
  ROOT,SCOPE,createC35GmailApiReadOnlyAdapter,
  createC35ReadOnlyGmailVerifier,createC35DemoGmailReadback
}=require('../contract-gmail-c35-readonly-api-staging');

const ACCOUNT='lszh-test-sender@example.com';
const TO='test-approved@example.com';
const MID='gmail_test_id_0001';
function fixture(avv='no',external=false){
  const kinds=avv==='yes'?['offer','terms','avv']:['offer','terms'];
  const eventId='contract_send_pkg_test_c35_quote_1_r1';
  const packageSha256='a'.repeat(64);
  const contents=new Map();
  const docs=kinds.map(kind=>{
    const bytes=Buffer.from('%PDF-1.4\nTEST_ONLY '+kind+'\n'+'#'.repeat(80));
    const aid='attachment_'+kind+'_0001';
    contents.set(aid,bytes);
    return {kind,filename:'TEST_ONLY_'+kind+'.pdf',sha256:digest(bytes),
      bytes:bytes.length,aid,data:bytes};
  });
  const expected={eventId,packageSha256,recipient:TO,
    documentHashes:docs.map(d=>({
      kind:d.kind,filename:d.filename,sha256:d.sha256,bytes:d.bytes
    }))};
  const receipt={ok:true,eventId,packageSha256,to:TO,
    attachmentCount:docs.length,provider:'gmail',messageId:MID};
  const message={
    id:MID,labelIds:['SENT'],payload:{
      headers:[
        {name:'From',value:'LSZH Automations <'+ACCOUNT+'>'},
        {name:'To',value:TO},
        {name:'Subject',value:'[TEST_ONLY] LSZH C3.5 Muster'},
        {name:'X-LSZH-Contract-Event',value:eventId},
        {name:'X-LSZH-Package-SHA256',value:packageSha256}
      ],
      parts:docs.map(d=>({
        filename:d.filename,mimeType:'application/pdf',
        body:external?{size:d.bytes,attachmentId:d.aid}:
          {size:d.bytes,data:d.data.toString('base64url')}
      }))
    }
  };
  const requests=[];
  let identity=ACCOUNT;
  let shouldFail=false;
  const authClient={
    request:async opts=>{
      requests.push(opts);
      if(shouldFail)throw new Error('synthetic OAuth timeout');
      if(opts.url===ROOT+'/profile')return {data:{emailAddress:identity}};
      if(opts.url===ROOT+'/messages/'+MID+'?format=full')
        return {data:message};
      const prefix=ROOT+'/messages/'+MID+'/attachments/';
      if(opts.url.startsWith(prefix)){
        const bytes=contents.get(opts.url.slice(prefix.length));
        if(!bytes)throw new Error('attachment not found');
        return {data:{size:bytes.length,data:bytes.toString('base64url')}};
      }
      throw new Error('unexpected API request: '+opts.url);
    }
  };
  const build=(overrides={})=>createC35ReadOnlyGmailVerifier({
    authClient,expectedMailbox:ACCOUNT,allowedRecipients:[TO],
    ...overrides
  });
  return {docs,message,contents,requests,authClient,expected,receipt,build,
    setIdentity:v=>{identity=v},
    setFailure:v=>{shouldFail=v}};
}
test('C3.5 connection checks exact authorised mailbox by Gmail profile GET',async()=>{
  const f=fixture();
  const check=await f.build().verifyMailbox();
  assert.equal(check.mailbox,ACCOUNT);
  assert.equal(check.scopeRequired,SCOPE);
  assert.equal(check.readOnly,true);
  assert.deepEqual(f.requests.map(x=>x.url),[ROOT+'/profile']);
  assert.equal(f.requests[0].method,'GET');
});
test('C3.5 independent 2-PDF SENT lookup uses only GET and no send routes',async()=>{
  const f=fixture();
  assert.equal(await f.build().verifyGatewayReceipt({
    receipt:f.receipt,expected:f.expected
  }),true);
  assert.deepEqual(f.requests.map(x=>x.url),[
    ROOT+'/profile',ROOT+'/messages/'+MID+'?format=full'
  ]);
  assert.ok(f.requests.every(x=>x.method==='GET'));
  assert.ok(f.requests.every(x=>x.timeout===10000));
  assert.ok(f.requests.every(x=>!x.url.includes('/send')));
});
test('C3.5 AVV 3-PDF attachment get uses trusted fixed GET URLs',async()=>{
  const f=fixture('yes',true);
  assert.equal(await f.build().verifyGatewayReceipt({
    receipt:f.receipt,expected:f.expected
  }),true);
  assert.equal(f.requests.length,8);
  assert.equal(f.requests.filter(x=>x.url===ROOT+'/profile').length,4);
  assert.deepEqual(f.requests.filter(x=>x.url.includes('/attachments/')).map(x=>x.url),
    f.docs.map(d=>ROOT+'/messages/'+MID+'/attachments/'+d.aid));
  assert.ok(f.requests.every(x=>x.method==='GET'));
});
test('C3.5 rejects a personal or misbound OAuth mailbox before reading messages',async()=>{
  const f=fixture();
  f.setIdentity('personal@example.com');
  assert.equal(await f.build().verifyGatewayReceipt({
    receipt:f.receipt,expected:f.expected
  }),false);
  assert.equal(f.requests.length,1);
  assert.equal(f.requests[0].url,ROOT+'/profile');
});
test('C3.5 refuses wrong headers, not SENT, changed recipient and mutated AVV bytes',async()=>{
  const f=fixture('yes',true);
  f.message.labelIds=['INBOX'];
  assert.equal(await f.build().verifyGatewayReceipt({
    receipt:f.receipt,expected:f.expected
  }),false);
  f.message.labelIds=['SENT'];
  const target=f.contents.get(f.docs[2].aid);
  f.contents.set(f.docs[2].aid,Buffer.from('%PDF-1.4\nBAD'));
  assert.equal(await f.build().verifyGatewayReceipt({
    receipt:f.receipt,expected:f.expected
  }),false);
  f.contents.set(f.docs[2].aid,target);
  f.message.payload.headers[1].value='real-client@example.ch';
  assert.equal(await f.build().verifyGatewayReceipt({
    receipt:f.receipt,expected:f.expected
  }),false);
});
test('C3.5 refuses mismatched message ID and no-read retry on OAuth timeout',async()=>{
  const f=fixture();
  const read=createC35GmailApiReadOnlyAdapter({
    authClient:f.authClient,expectedMailbox:ACCOUNT
  });
  await assert.rejects(read.getMessage('invalid/id'),/unsafe Gmail identifier/);
  assert.equal(f.requests.length,0);
  f.setFailure(true);
  assert.equal(await f.build().verifyGatewayReceipt({
    receipt:f.receipt,expected:f.expected
  }),false);
  assert.equal(f.requests.length,1);
});
test('C3.5 malformed identifiers cannot escape fixed API resource paths',async()=>{
  const f=fixture();
  const read=createC35GmailApiReadOnlyAdapter({
    authClient:f.authClient,expectedMailbox:ACCOUNT
  });
  for(const value of ['../send','foo/bar','https://evil.example','bad%2f','x',
    'abc?format=raw','x\nattack','../../profile']){
    await assert.rejects(read.getMessage(value),/unsafe Gmail identifier/);
    await assert.rejects(read.getAttachment(MID,value),/unsafe Gmail identifier/);
  }
  assert.equal(f.requests.length,0);
});
test('C3.5 invalid mailbox config and invalid client cause fail-closed construction',()=>{
  const f=fixture();
  for(const mailbox of ['',null,'*@example.com','preview@example.invalid',
    'Personal@Example.com','bad\nX:header'])
    assert.throws(()=>createC35GmailApiReadOnlyAdapter({
      authClient:f.authClient,expectedMailbox:mailbox
    }),/invalid/);
  assert.throws(()=>createC35GmailApiReadOnlyAdapter({
    authClient:{},expectedMailbox:ACCOUNT
  }),/missing/);
  assert.throws(()=>createC35GmailApiReadOnlyAdapter({
    authClient:f.authClient,expectedMailbox:ACCOUNT,timeoutMs:60000
  }),/missing/);
});
test('C3.5 legacy C3.4 demo-only guard and zero productive send imports preserved',()=>{
  const f=fixture();
  assert.throws(()=>createC35DemoGmailReadback({
    db:{projectId:'live',collection:()=>{},runTransaction:()=>{}},
    authClient:f.authClient,expectedMailbox:ACCOUNT,
    allowedRecipients:[TO],signingSecret:Buffer.alloc(40)
  }),/demo emulator/);
  const source=fs.readFileSync(path.join(__dirname,
    '../contract-gmail-c35-readonly-api-staging.js'),'utf8');
  for(const file of ['server.js','offer-send.js']){
    const live=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    assert.doesNotMatch(live,/contract-gmail-c35-readonly-api-staging/);
  }
  assert.doesNotMatch(source,/\bfetch\s*\(|gmail\.send|sendAnEmail|\/messages\/send/);
  assert.doesNotMatch(source,/require\s*\(\s*['"]node:https/);
});
