'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createPortalGateways}=require('../customer-portal-gateways');const {digest}=require('../offer-contract-package');
const hook='https://hook.eu1.make.com/synthetic123456';
test('staging code gateway permits only the approved mailbox and requires Gmail confirmation',async()=>{
  let sends=0;const g=createPortalGateways({codeHook:hook,reserveHook:hook,writeHook:hook,reader:{},fetchImpl:async()=>{sends++;return Response.json({ok:true,messageId:'synthetic_message_1'});}});
  await assert.rejects(g.sendCode({recipient:'other@example.com',code:'12345678',idempotencyKey:'customer_login_'+'x'.repeat(32)}),{code:'RECIPIENT_NOT_APPROVED'});
  const r=await g.sendCode({recipient:'lars.schulthess@outlook.com',code:'12345678',idempotencyKey:'customer_login_'+'x'.repeat(32)});
  assert.equal(r.messageId,'synthetic_message_1');assert.equal(sends,1);
});
test('archive gateway readback closes a lost successful upload response; retries do not upload twice',async()=>{
  const bytes=Buffer.from('{"synthetic":true}'),sha256=digest(bytes);let saved=Buffer.alloc(0),writes=0;
  const g=createPortalGateways({codeHook:hook,reserveHook:hook,writeHook:hook,reader:{inspectEvidence:async()=>({bytes:saved})},fetchImpl:async()=>{writes++;saved=bytes;throw Error('timeout');}});
  for(let n=0;n<2;n++)assert.equal(await g.putVerified('synthetic_file_123456',bytes,{responseId:'response_'+'a'.repeat(32),sha256}),'synthetic_file_123456');
  assert.equal(writes,1);
});
test('archive gateway never overwrites nonempty conflicting evidence',async()=>{
  const bytes=Buffer.from('new');let writes=0;
  const g=createPortalGateways({codeHook:hook,reserveHook:hook,writeHook:hook,reader:{inspectEvidence:async()=>({bytes:Buffer.from('old')})},fetchImpl:async()=>{writes++;}});
  await assert.rejects(g.putVerified('synthetic_file_123456',bytes,{responseId:'response_'+'b'.repeat(32),sha256:digest(bytes)}),{code:'EVIDENCE_INTEGRITY_FAILED'});assert.equal(writes,0);
});
