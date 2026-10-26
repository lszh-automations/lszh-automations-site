'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {digest}=require('../offer-contract-package');
const {createC34GmailReadOnlyVerifier,createC34DemoGmailReadbackLedger}=require(
  '../contract-gmail-c34-readback-staging'
);
const TO='test-approved@example.com';
const FROM='sender-test@example.com';
const MID='gmail_c34_test_0001';
function fixture(avv='no',external=false){
  const kinds=avv==='yes'?['offer','terms','avv']:['offer','terms'];
  const eventId='contract_send_pkg_test_c34_quote_1_r1';
  const hash='a'.repeat(64);
  const attachments=new Map();
  const documents=kinds.map((kind,i)=>{
    const bytes=Buffer.from('%PDF-1.4\nTEST_ONLY '+kind+'\n'+'#'.repeat(80));
    const filename='TEST_ONLY_'+kind+'.pdf';
    const attachmentId='attach_c34_'+String(i+1);
    attachments.set(attachmentId,{data:bytes.toString('base64url'),size:bytes.length});
    return {kind,filename,sha256:digest(bytes),bytes:bytes.length,data:bytes,attachmentId};
  });
  const expected={eventId,packageSha256:hash,recipient:TO,
    documentHashes:documents.map(({kind,filename,sha256,bytes})=>({
      kind,filename,sha256,bytes
    }))};
  const receipt={ok:true,eventId,packageSha256:hash,to:TO,
    attachmentCount:documents.length,provider:'gmail',messageId:MID};
  const message={
    id:MID,labelIds:['SENT'],payload:{
      headers:[
        {name:'From',value:'LSZH Automations <'+FROM+'>'},
        {name:'To',value:TO},
        {name:'Subject',value:'[TEST_ONLY] LSZH C3.4 Musterdokumente'},
        {name:'X-LSZH-Contract-Event',value:eventId},
        {name:'X-LSZH-Package-SHA256',value:hash}
      ],
      parts:documents.map(d=>({
        filename:d.filename,mimeType:'application/pdf',
        body:external?{size:d.bytes,attachmentId:d.attachmentId}:
          {size:d.bytes,data:d.data.toString('base64url')}
      }))
    }
  };
  const calls={messages:0,attachments:0};
  const getMessage=async id=>{
    calls.messages++;assert.equal(id,MID);return message;
  };
  const getAttachment=async(id,attachmentId)=>{
    calls.attachments++;assert.equal(id,MID);
    return attachments.get(attachmentId);
  };
  const create=(overrides={})=>createC34GmailReadOnlyVerifier({
    getMessage,getAttachment,allowedSenders:[FROM],allowedRecipients:[TO],
    ...overrides
  });
  return {documents,expected,receipt,message,calls,create,attachments};
}
test('C3.4 independently reads SENT and verifies 2 original inline PDF attachments',async()=>{
  const f=fixture();
  assert.equal(await f.create().verifyGatewayReceipt({
    receipt:f.receipt,expected:f.expected
  }),true);
  assert.equal(f.calls.messages,1);
  assert.equal(f.calls.attachments,0);
});
test('C3.4 3-PDF AVV readback requests actual Gmail attachment bytes separately',async()=>{
  const f=fixture('yes',true);
  assert.equal(await f.create().verifyGatewayReceipt({
    receipt:f.receipt,expected:f.expected
  }),true);
  assert.equal(f.calls.messages,1);
  assert.equal(f.calls.attachments,3);
});
test('C3.4 Make-reported success without matching independent Gmail evidence is rejected',async()=>{
  const f=fixture();
  for(const mutation of [
    {ok:false},{provider:'NONE'},{eventId:'fake'},
    {packageSha256:'0'.repeat(64)},{to:'client@example.ch'},
    {attachmentCount:3},{messageId:'no\nheader'}
  ]){
    assert.equal(await f.create().verifyGatewayReceipt({
      receipt:{...f.receipt,...mutation},expected:f.expected
    }),false);
  }
});
test('C3.4 refuses altered PDF SHA and missing, extra or reordered AVV',async()=>{
  const f=fixture('yes',true);
  const original=f.attachments.get(f.documents[2].attachmentId);
  f.attachments.set(f.documents[2].attachmentId,{
    ...original,data:Buffer.from('%PDF-1.4\nATTACK').toString('base64url')
  });
  assert.equal(await f.create().verifyGatewayReceipt({
    receipt:f.receipt,expected:f.expected
  }),false);
  f.attachments.set(f.documents[2].attachmentId,original);
  const parts=f.message.payload.parts;
  f.message.payload.parts=[...parts].reverse();
  assert.equal(await f.create().verifyGatewayReceipt({
    receipt:f.receipt,expected:f.expected
  }),false);
  f.message.payload.parts=parts.slice(0,2);
  assert.equal(await f.create().verifyGatewayReceipt({
    receipt:f.receipt,expected:f.expected
  }),false);
});
test('C3.4 refuses unapproved sender, changed recipient and CC/BCC headers',async()=>{
  const f=fixture();
  const heads=f.message.payload.headers;
  for(const extra of [
    {name:'From',value:'imposter@example.com'},
    {name:'To',value:'customer@example.ch'},
    {name:'Cc',value:'stranger@example.com'},
    {name:'Bcc',value:'stranger@example.com'}
  ]){
    const unchanged=heads.map(h=>({...h}));
    const old=heads.findIndex(h=>h.name.toLowerCase()===extra.name.toLowerCase());
    if(old<0)f.message.payload.headers=[...unchanged,extra];
    else f.message.payload.headers=unchanged.map((h,i)=>i===old?extra:h);
    assert.equal(await f.create().verifyGatewayReceipt({
      receipt:f.receipt,expected:f.expected
    }),false);
  }
  f.message.payload.headers=heads;
});
test('C3.4 requires Gmail SENT label, exact headers and safe MIME details',async()=>{
  const f=fixture();
  const labels=f.message.labelIds;
  f.message.labelIds=['INBOX'];
  assert.equal(await f.create().verifyGatewayReceipt({
    receipt:f.receipt,expected:f.expected
  }),false);
  f.message.labelIds=labels;
  const originalHeaders=f.message.payload.headers;
  f.message.payload.headers=originalHeaders.filter(h=>
    h.name!=='X-LSZH-Package-SHA256');
  assert.equal(await f.create().verifyGatewayReceipt({
    receipt:f.receipt,expected:f.expected
  }),false);
  f.message.payload.headers=originalHeaders;
  const first=f.message.payload.parts[0];
  f.message.payload.parts[0]={...first,mimeType:'text/plain'};
  assert.equal(await f.create().verifyGatewayReceipt({
    receipt:f.receipt,expected:f.expected
  }),false);
});
test('C3.4 fail-closed on Gmail read timeout or malformed attachment encoding',async()=>{
  const f=fixture('yes',true);
  assert.equal(await f.create({
    getMessage:async()=>{throw Error('TEST_ONLY Gmail read timeout')}
  }).verifyGatewayReceipt({
    receipt:f.receipt,expected:f.expected
  }),false);
  f.attachments.set(f.documents[0].attachmentId,{data:'%%%BAD%%%',size:98});
  assert.equal(await f.create().verifyGatewayReceipt({
    receipt:f.receipt,expected:f.expected
  }),false);
});
test('C3.4 rejects wildcard, non-test, empty or invalid allowlists and missing reader',()=>{
  const f=fixture();
  for(const recipients of [[],['*@example.com'],['preview@example.invalid'],
    [TO,TO],['Example@Test.com']]){
    assert.throws(()=>f.create({allowedRecipients:recipients}),/allowlist/);
  }
  assert.throws(()=>f.create({allowedSenders:['sender.invalid']}),/allowlist/);
  assert.throws(()=>f.create({getMessage:null}),/adapter/);
  assert.equal(f.calls.messages,0);
});
test('C3.4 demo ledger has a hard emulator-only guard and no send/production imports',()=>{
  assert.throws(()=>createC34DemoGmailReadbackLedger({
    db:{projectId:'live-project',collection:()=>{},runTransaction:()=>{}}
  }),/demo emulator/);
  const src=fs.readFileSync(path.join(__dirname,
    '../contract-gmail-c34-readback-staging.js'),'utf8');
  for(const prod of ['server.js','offer-send.js']){
    const live=fs.readFileSync(path.join(__dirname,'..',prod),'utf8');
    assert.doesNotMatch(live,/contract-gmail-c34-readback-staging/);
  }
  assert.doesNotMatch(src,/\bfetch\s*\(|https?\.request|gmail\.send|sendAnEmail/);
  assert.doesNotMatch(src,/require\s*\(\s*['"](?:node:http|node:https|googleapis)/);
  assert.match(src,/FIRESTORE_EMULATOR_HOST/);
  assert.match(src,/demo-lszha-c2-20261025/);
});
