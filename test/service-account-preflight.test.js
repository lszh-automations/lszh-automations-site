'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {verifyTestArchive}=require('../scripts/check-offer-service-account');
const pdf=Buffer.from('%PDF-1.4\nTEST PDF\n%%EOF\n');
const id='1ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef';
const hash=crypto.createHash('sha256').update(pdf).digest('hex');
function fake(){let reads=0;return{get reads(){return reads;},
  pdf:async()=>{reads++;return pdf;}};}
test('read-only service-account preflight verifies one synthetic PDF and never approves contracts',async()=>{
  const v=fake();
  const result=await verifyTestArchive({id,hash,env:{OFFER_DRIVE_SA_B64:'TEST_ONLY',OFFER_ACCEPTANCE_ENABLED:'false'},verifier:v});
  assert.equal(result.status,'TEST_PDF_READ_ONLY_VERIFIED_NOT_APPROVED');
  assert.equal(result.sha256,hash);
  assert.equal(result.size,pdf.length);
  assert.equal(result.contract_approved,false);
  assert.equal(v.reads,1);
});
test('missing secret / incorrect id or hash fail before read',async()=>{
  const v=fake();
  await assert.rejects(()=>verifyTestArchive({id,hash,env:{OFFER_ACCEPTANCE_ENABLED:'false'},verifier:v}),/secret_not_configured/);
  await assert.rejects(()=>verifyTestArchive({id:'bad',hash,env:{OFFER_DRIVE_SA_B64:'TEST_ONLY'},verifier:v}),/invalid_test_archive_input/);
  await assert.rejects(()=>verifyTestArchive({id,hash:'f'.repeat(60),env:{OFFER_DRIVE_SA_B64:'TEST_ONLY'},verifier:v}),/invalid_test_archive_input/);
  assert.equal(v.reads,0);
});
test('refuses smoke test when actual acceptance has been enabled',async()=>{
  const v=fake();
  await assert.rejects(()=>verifyTestArchive({id,hash,env:{OFFER_DRIVE_SA_B64:'TEST_ONLY',OFFER_ACCEPTANCE_ENABLED:'true'},verifier:v}),/acceptance_must_remain_disabled/);
  assert.equal(v.reads,0);
});
test('mismatched delivered PDF fails closed without approval',async()=>{
  await assert.rejects(()=>verifyTestArchive({id,hash,env:{OFFER_DRIVE_SA_B64:'TEST_ONLY'},verifier:{pdf:async()=>Buffer.from('%PDF-1.4\nALTERED\n%%EOF\n')}}),/archive_changed/);
});
