'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {extendRecipientPolicy}=require('../scripts/c373-allow-test-recipient.cjs');
const {SECRET_PURPOSE,EXPECTED_MAILBOX}=require('../contract-gmail-c37-backend-staging');
function fixture(){return {version:1,purpose:SECRET_PURPOSE,expectedMailbox:EXPECTED_MAILBOX,
  clientId:'470613067122-c373syntheticclient.apps.googleusercontent.com',
  clientSecret:'TEST_ONLY_CLIENT_SECRET',refreshToken:'TEST_ONLY_REFRESH_TOKEN_123456',
  approvedSenders:['info@lszh-automations.ch'],allowedRecipients:[EXPECTED_MAILBOX]};}
test('policy extension adds exactly the designated recipient and preserves credentials and existing addresses',()=>{
  const original=fixture(),r=extendRecipientPolicy(JSON.stringify(original)),next=JSON.parse(r.updated);
  assert.equal(r.changed,true);assert.deepEqual(next.allowedRecipients,[EXPECTED_MAILBOX,'lars.schulthess@outlook.com']);
  delete next.allowedRecipients;delete original.allowedRecipients;assert.deepEqual(next,original);
});
test('already authorised recipient produces no duplicate or other changes',()=>{
  const original=fixture();original.allowedRecipients.push('lars.schulthess@outlook.com');
  const input=JSON.stringify(original),r=extendRecipientPolicy(input);
  assert.equal(r.changed,false);assert.equal(r.updated,input);
});
test('invalid envelope, wrong sender and exhausted policy capacity are blocked',()=>{
  assert.throws(()=>extendRecipientPolicy('not json'));
  const wrong=fixture();wrong.approvedSenders=['other@example.com'];
  assert.throws(()=>extendRecipientPolicy(JSON.stringify(wrong)));
  const full=fixture();full.allowedRecipients=Array.from({length:5},(_,i)=>'test'+i+'@example.com');
  assert.throws(()=>extendRecipientPolicy(JSON.stringify(full)));
});
