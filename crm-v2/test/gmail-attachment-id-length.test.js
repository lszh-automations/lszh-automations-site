'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {createC35GmailApiReadOnlyAdapter,createC35ReadOnlyGmailVerifier,ROOT}=
  require('../contract-gmail-c35-readonly-api-staging');
const {createGmailApiReadOnlyAdapter}=require('../contract-gmail-api-readonly-staging');
const {digest}=require('../offer-contract-package');
const MID='test_message_1101',MAILBOX='test-sender@example.com',TO='test-recipient@example.com';
const LONG_ID='A'.repeat(404);
function fixture(){
  const files=['offer','terms','avv'].map((kind,i)=>{
    const data=Buffer.from('%PDF-1.4\nTEST_ONLY '+kind+'\n%%EOF');
    return {filename:'TEST_ONLY_'+kind+'.pdf',data,sha256:digest(data),bytes:data.length,
      aid:LONG_ID+i};
  });
  const expected={eventId:'contract_send_pkg_test_1101_r1',packageSha256:'a'.repeat(64),
    recipient:TO,documentHashes:files.map(({filename,sha256,bytes})=>({filename,sha256,bytes}))};
  const raw={id:MID,labelIds:['SENT'],payload:{headers:[
    {name:'From',value:MAILBOX},{name:'To',value:TO},{name:'Subject',value:'[TEST_ONLY] length'},
    {name:'X-LSZH-Contract-Event',value:expected.eventId},
    {name:'X-LSZH-Package-SHA256',value:expected.packageSha256}],
    parts:files.map(f=>({filename:f.filename,mimeType:'application/pdf',
      body:{size:f.bytes,attachmentId:f.aid}}))}};
  const requests=[];
  const authClient={request:async opts=>{
    requests.push(opts);assert.equal(opts.method,'GET');
    if(opts.url===ROOT+'/profile')return {data:{emailAddress:MAILBOX}};
    if(opts.url===ROOT+'/messages/'+MID+'?format=full')return {data:raw};
    const file=files.find(f=>opts.url===ROOT+'/messages/'+MID+'/attachments/'+f.aid);
    assert.ok(file,'only exact approved attachment URL allowed');
    return {data:{size:file.bytes,data:file.data.toString('base64url')}};
  }};
  return {files,expected,raw,requests,authClient};
}
test('404-character provider attachment IDs pass both normalizer and complete SENT byte verification',async()=>{
  const f=fixture();
  const verifier=createC35ReadOnlyGmailVerifier({authClient:f.authClient,
    expectedMailbox:MAILBOX,approvedSenders:[MAILBOX],allowedRecipients:[TO]});
  assert.equal(await verifier.verifyGatewayReceipt({expected:f.expected,receipt:{ok:true,
    provider:'gmail',eventId:f.expected.eventId,packageSha256:f.expected.packageSha256,
    to:TO,messageId:MID,attachmentCount:3}}),true);
  assert.equal(f.requests.filter(r=>r.url.includes('/attachments/')).length,3);
});
test('attachment length increase cannot expand message IDs or allow URL injection',async()=>{
  const f=fixture(),adapter=createC35GmailApiReadOnlyAdapter({authClient:f.authClient,expectedMailbox:MAILBOX});
  for(const value of ['A'.repeat(2049),'a/bc','a?bc','a%2Fbc','a\nbc','../bad'])
    await assert.rejects(adapter.getAttachment(MID,value),/unsafe Gmail/);
  await assert.rejects(adapter.getMessage('A'.repeat(201)),/unsafe Gmail/);
  assert.equal(f.requests.length,0);
});
test('normalizer rejects overlong and unsafe attachment IDs before fetching',async()=>{
  for(const value of ['A'.repeat(2049),'bad/attachment','bad?attachment']){
    const f=fixture();f.raw.payload.parts[0].body.attachmentId=value;let fetched=0;
    const adapter=createGmailApiReadOnlyAdapter({getMessage:async()=>f.raw,
      getAttachment:async()=>{fetched++;throw Error('must not fetch');}});
    await assert.rejects(adapter.readSentMessage(MID));assert.equal(fetched,0);
  }
});
