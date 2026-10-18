'use strict';
// Offline ONLY. No Make connection, Pub/Sub topic, Cloud Run, IAM, Google token
// or customer data. Exercises fail-closed envelopes and message redelivery.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const sha=s=>createHash('sha256').update(s).digest('hex');
const load=()=>import('../cloud-run/offer-portal-staging/syntheticPubsubReviewTransport.mjs');
const AT='2026-10-18T12:00:00.000Z';
async function source(mode='Ja'){
  const {buildSyntheticReceiptReview}=await import(
    '../cloud-run/offer-portal-staging/receiptRecoveryReview.mjs');
  const hash={quote:'a'.repeat(64),terms:'b'.repeat(64),avv:'c'.repeat(64)};
  const offer={
    tokenHash:sha('UNISSUED_SYNTHETIC_TOKEN'),
    status:'accepted',approved:true,revision:2,acceptedAt:AT,
    termsVersion:'TEST_v1.0_RC1',recipientEmail:'synthetic@example.invalid',
    offerNumber:'TEST_PUBSUB_BRIDGE_20261018_NO_CONTRACT',
    source:{kind:'LSZH_SYNTHETIC_ONLY',baseId:'appzJiskpAdaR1HEv',
      tableId:'tbljeIUoD7wwKuSmS',recordId:'rec12345678901234'},
    bundle:{avv_required:mode,quote:{sha256:hash.quote},
      terms:{sha256:hash.terms},
      ...(mode==='Ja'?{avv:{sha256:hash.avv}}:{})},
    downstream:{airtable:'disabled',proofPdf:'disabled',email:'disabled'}
  };
  offer.evidence={
    accepted_at_utc:AT,authorized_confirmed:true,terms_confirmed:true,
    quote_pdf_sha256:hash.quote,terms_pdf_sha256:hash.terms,
    avv_required:mode==='Ja',avv_confirmed:mode==='Ja',
    avv_pdf_sha256:mode==='Ja'?hash.avv:null
  };
  offer.receiptReview=buildSyntheticReceiptReview(offer,offer.evidence,AT);
  return offer;
}
function payload(offer,attemptId='TEST_ATTEMPT_AAAA123456789012'){
  return {schemaVersion:1,channel:'LSZH_MAKE_RECEIPT_REVIEW_STAGING_V1',
    syntheticOnly:true,sourceRecordId:offer.source.recordId,
    receiptReviewKey:offer.receiptReview.idempotencyKey,attemptId};
}
function envelope(plan,id='12345678901'){
  return {subscription:'projects/demo-lszh-automations/subscriptions/lszh-g3-review-demo',
    message:{messageId:id,publishTime:AT,
      data:plan.message.data,attributes:plan.message.attributes}};
}
function blocked(r){
  assert.equal(r.canPublish,false);assert.equal(r.canCreateGoogleDoc,false);
  assert.equal(r.canUpload,false);assert.equal(r.canWriteFirestore,false);
  assert.equal(r.canWriteAirtable,false);assert.equal(r.canSendEmail,false);
  assert.equal(r.manualReviewRequired,true);assert.equal(r.stopBeforeModule,5);
  assert.ok(!JSON.stringify(r).includes('synthetic@example.invalid'));
}
test('Make Publish Messages plan is inert and a matched PubSub push still STOP for both AVV modes',async()=>{
  const {buildSyntheticPubsubPublishPlan:plan,
    inspectSyntheticPubsubPushOffline:inspect}=await load();
  for(const mode of ['Ja','Nein']){
    const offer=await source(mode),request=payload(offer);
    const p=plan(request);
    assert.equal(p.status,'PLAN_ONLY_DO_NOT_PUBLISH');
    assert.equal(p.dataFormat,'PUBSUB_REST_BASE64_WIRE_ONLY');
    assert.equal(p.makeNativeDataEncodingVerified,false);
    assert.equal(p.topic,'projects/demo-lszh-automations/topics/lszh-g3-review-demo');
    assert.equal(p.requiresIndependentCloudRunIamVerification,true);
    blocked(p);
    const decoded=JSON.parse(Buffer.from(p.message.data,'base64').toString('utf8'));
    assert.deepEqual(decoded,request);
    assert.deepEqual(p.message.attributes,{
      lszhKind:'LSZH_G3_SYNTHETIC_REVIEW_ONLY',lszhSchema:'1'
    });
    const received=inspect(envelope(p),offer);
    assert.equal(received.status,'STOP_REVIEW_ONLY');
    assert.equal(received.sourceRecordId,offer.source.recordId);
    assert.equal(received.receiptReviewKey,offer.receiptReview.idempotencyKey);
    assert.equal(received.requiresCloudRunIamVerified,true);
    assert.equal(received.requiresAtomicFirestoreReviewLock,true);
    blocked(received);
    const retried=inspect(envelope(p,'9999999999999'),offer);
    assert.deepEqual(received,retried,'different PubSub messageIds must not create a new permit');
  }
});
test('malformed and non-synthetic Make requests are rejected before publishing',async()=>{
  const {buildSyntheticPubsubPublishPlan:plan}=await load();
  const offer=await source(),good=payload(offer);
  const cases=[
    null,{},[],{...good,sourceRecordId:'rec000'},
    {...good,sourceRecordId:'rec00000000000000',rawToken:'do-not-send'},
    {...good,receiptReviewKey:'f'.repeat(63)},
    {...good,attemptId:'REAL_ATTEMPT'},
    {...good,channel:'CUSTOMER_LIVE'}, {...good,syntheticOnly:false},
    {...good,canCreateGoogleDoc:true},
    {...good,email:'real@customer.com'}, {...good,tokenHash:offer.tokenHash},
    {...good,schemaVersion:'1'}
  ];
  for(const c of cases){const r=plan(c);assert.equal(r.status,'NO_GO');blocked(r);}
});
test('spoofed subscription, wrong attrs and forged payload never become a permit',async()=>{
  const {buildSyntheticPubsubPublishPlan:plan,
    inspectSyntheticPubsubPushOffline:inspect}=await load();
  const offer=await source(),p=plan(payload(offer)),good=envelope(p);
  const cases=[
    {},null,[],{...good,subscription:'projects/other/subscriptions/other'},
    {...good,message:{...good.message,messageId:'not-an-id'}},
    {...good,message:{...good.message,publishTime:'not-a-time'}},
    {...good,message:{...good.message,extra:'surprise'}},
    {...good,message:{...good.message,attributes:{lszhKind:'CUSTOMER_REAL',lszhSchema:'1'}}},
    {...good,message:{...good.message,attributes:{...good.message.attributes,admin:'yes'}}},
    {...good,message:{...good.message,data:'A'}},
    {...good,message:{...good.message,data:'!!!'}},
    {...good,message:{...good.message,data:'A'.repeat(5000)}},
    {...good,message:{...good.message,data:Buffer.from('not-json').toString('base64')}},
    {...good,message:{...good.message,data:Buffer.from(JSON.stringify({
      ...payload(offer),sourceRecordId:'rec00000000000000'
    })).toString('base64')}},
    {...good,message:{...good.message,data:Buffer.from(JSON.stringify({
      ...payload(offer),email:'real@customer.com'
    })).toString('base64')}},
  ];
  for(const c of cases){const r=inspect(c,offer);assert.equal(r.status,'NO_GO');blocked(r);}
});
test('canonical Firestore mismatch rejects even correctly formatted PubSub deliveries',async()=>{
  const {buildSyntheticPubsubPublishPlan:plan,
    inspectSyntheticPubsubPushOffline:inspect}=await load();
  const offer=await source(),message=envelope(plan(payload(offer)));
  for(const change of [
    o=>{o.source.recordId='rec00000000000000';},
    o=>{o.status='sent';},
    o=>{o.source.kind='CUSTOMER_REAL';},
    o=>{o.receiptReview.idempotencyKey='0'.repeat(64);},
    o=>{o.evidence.terms_pdf_sha256='f'.repeat(64);}
  ]){
    const tampered=structuredClone(offer);change(tampered);
    const r=inspect(message,tampered);
    assert.equal(r.status,'NO_GO');blocked(r);
  }
});
