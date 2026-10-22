'use strict';
// Entirely offline: real claim transaction logic, synthetic fake Firestore,
// no external providers, no Firestore emulator, no customer messages.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const sha=s=>createHash('sha256').update(s).digest('hex');
const tokenHash=sha('LSZH_SYNTHETIC_ONLY_TOKEN_NEVER_ISSUED');
const at=new Date('2026-10-18T12:00:00.000Z');
const docs={quote:'a'.repeat(64),terms:'b'.repeat(64),avv:'c'.repeat(64)};
const files={
  quote:{id:'SYNTHETIC_QUOTE_ID',sha256:docs.quote},
  terms:{id:'SYNTHETIC_TERMS_ID',sha256:docs.terms},
  avv:{id:'SYNTHETIC_AVV_ID',sha256:docs.avv}
};
const enabled={airtable:'disabled',proofPdf:'disabled',email:'disabled'};
function offer(mode='Ja'){
  return {
    tokenHash,status:'sent',approved:true,revision:1,
    termsVersion:'TEST_v1.0_RC1',expiresAt:'2099-12-31T23:59:59.000Z',
    recipientEmail:'synthetic@example.invalid',
    offerNumber:'TEST_RECEIPT_REVIEW_20261018_NO_CONTRACT',
    details:{company:'Synthetic GmbH'},
    source:{kind:'LSZH_SYNTHETIC_ONLY',baseId:'appzJiskpAdaR1HEv',
      tableId:'tbljeIUoD7wwKuSmS',recordId:'rec12345678901234'},
    bundle:{avv_required:mode,quote:structuredClone(files.quote),terms:structuredClone(files.terms),
      ...(mode==='Ja'?{avv:structuredClone(files.avv)}:{})},
    downstream:{...enabled}
  };
}
function evidence(mode='Ja'){
  return {accepted_at_utc:at.toISOString(),authorized_confirmed:true,
    terms_confirmed:true,quote_pdf_sha256:docs.quote,
    terms_pdf_sha256:docs.terms,avv_required:mode==='Ja',
    avv_confirmed:mode==='Ja',avv_pdf_sha256:mode==='Ja'?docs.avv:null};
}
function fakeDb(initial){
  let doc=structuredClone(initial),updates=0;
  let chain=Promise.resolve();
  const ref={get:async()=>({exists:!!doc,data:()=>structuredClone(doc)})};
  return {
    db:{
      collection(name){
        assert.equal(name,'lszh_staging_offers_v1');
        return {doc(key){assert.equal(key,tokenHash);return ref;}};
      },
      runTransaction(cb){
        const run=chain.then(async()=>{
          let patch=null;
          const output=await cb({
            get:async(target)=>{assert.equal(target,ref);return ref.get();},
            update(target,fields){assert.equal(target,ref);patch=fields;}
          });
          if(patch){doc={...doc,...patch};updates++;}
          return output;
        });
        chain=run.catch(()=>{});
        return run;
      }
    },
    current:()=>structuredClone(doc),
    updates:()=>updates
  };
}
const load=async()=>Promise.all([
  import('../cloud-run/offer-portal-staging/receiptRecoveryReview.mjs'),
  import('../cloud-run/offer-portal-staging/firestoreOfferStore.mjs'),
  import('../cloud-run/offer-portal-staging/portalCore.mjs')
]);
test('accepted synthetic AVV yes/no produces deterministic NON-dispatchable review marker',async()=>{
  const [{buildSyntheticReceiptReview,inspectSyntheticReceiptRecovery},
    {createFirestoreOfferStore},{offerFingerprint}]=await load();
  for(const mode of ['Ja','Nein']){
    const initial=offer(mode),ev=evidence(mode),fake=fakeDb(initial);
    const store=createFirestoreOfferStore(fake.db);
    assert.equal(await store.claim(tokenHash,offerFingerprint(initial),ev,at),'accepted');
    const saved=fake.current();
    const intent=buildSyntheticReceiptReview(initial,ev,at.toISOString());
    assert.deepEqual(saved.receiptReview,intent);
    assert.match(intent.idempotencyKey,/^[a-f0-9]{64}$/);
    assert.equal(intent.purpose,'LSZH_SYNTHETIC_REVIEW_ONLY_NO_CONTRACT');
    assert.equal(intent.state,'AWAITING_MANUAL_RECONCILIATION');
    assert.equal(intent.receiptDriveId,null);
    assert.equal(intent.emailProviderMessageId,null);
    assert.deepEqual(intent.downstream,enabled);
    assert.deepEqual(saved.downstream,enabled);
    const report=inspectSyntheticReceiptRecovery(saved);
    assert.deepEqual(report,{
      status:'REVIEW_ONLY',idempotencyKey:intent.idempotencyKey,
      next:'MANUAL_RECONCILIATION_REQUIRED',
      canGenerateProof:false,canSendEmail:false,canWriteAirtable:false
    });
    assert.equal(await store.claim(tokenHash,offerFingerprint(initial),ev,at),'already_accepted');
    assert.equal(fake.updates(),1);
    assert.deepEqual(fake.current().receiptReview,intent);
    assert.ok(!JSON.stringify(intent).includes('synthetic@example.invalid'));
  }
});
test('12 simultaneous claim attempts commit exactly one marker and no downstream action',async()=>{
  const [{inspectSyntheticReceiptRecovery},{createFirestoreOfferStore},
    {offerFingerprint}]=await load();
  const initial=offer('Ja'),fake=fakeDb(initial),store=createFirestoreOfferStore(fake.db);
  const results=await Promise.all(Array.from({length:12},()=>
    store.claim(tokenHash,offerFingerprint(initial),evidence('Ja'),at)));
  assert.equal(results.filter(r=>r==='accepted').length,1);
  assert.equal(results.filter(r=>r==='already_accepted').length,11);
  assert.equal(fake.updates(),1);
  assert.equal(fake.current().revision,2);
  assert.equal(inspectSyntheticReceiptRecovery(fake.current()).status,'REVIEW_ONLY');
  assert.deepEqual(fake.current().downstream,enabled);
});
test('malformed synthetic provenance or altered evidence fails before any write',async()=>{
  const [{buildSyntheticReceiptReview},{createFirestoreOfferStore},
    {offerFingerprint}]=await load();
  const cases=[
    s=>{s.source.baseId='appForeignBase';},
    s=>{s.recipientEmail='real@example.com';},
    s=>{s.downstream.email='enabled';},
    s=>{s.offerNumber='REAL_CONTRACT';},
    s=>{s.bundle.quote.sha256='f'.repeat(64);}
  ];
  for(const change of cases){
    const initial=offer();
    change(initial);
    const tampered=fakeDb(initial);
    await assert.rejects(()=>createFirestoreOfferStore(tampered.db).claim(
      tokenHash,offerFingerprint(initial),evidence(),at),/synthetic_receipt_review_invalid/);
    assert.equal(tampered.updates(),0);
  }
  assert.throws(()=>buildSyntheticReceiptReview(offer('Nein'),evidence('Ja'),
    at.toISOString()),/synthetic_receipt_review_invalid/);
});
test('manual recovery refuses missing, mutated or ambiguous external receipt state',async()=>{
  const [{buildSyntheticReceiptReview,inspectSyntheticReceiptRecovery}]=await load();
  const base=offer(),ev=evidence();
  const intent=buildSyntheticReceiptReview(base,ev,at.toISOString());
  const accepted={...base,status:'accepted',revision:2,
    acceptedAt:at.toISOString(),evidence:ev,receiptReview:intent};
  assert.equal(inspectSyntheticReceiptRecovery(accepted).status,'REVIEW_ONLY');
  for(const changed of [
    {...accepted,receiptReview:{...intent,state:'READY_TO_SEND'}},
    {...accepted,receiptReview:{...intent,receiptDriveId:'fake'}},
    {...accepted,receiptReview:{...intent,downstream:{...enabled,email:'ready'}}},
    {...accepted,receiptReview:undefined},
    {...accepted,evidence:{...ev,quote_pdf_sha256:'f'.repeat(64)}},
    {...accepted,source:{...base.source,kind:'REAL_CUSTOMER'}}
  ]){
    assert.equal(inspectSyntheticReceiptRecovery(changed).status,'NO_GO');
  }
});
