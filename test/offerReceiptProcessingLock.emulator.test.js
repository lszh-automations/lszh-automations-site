'use strict';
// Actual Firestore SDK transaction contention against LOCAL EMULATOR ONLY.
// No Google account, remote project, Drive, Make, Airtable or Gmail.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash,randomBytes}=require('node:crypto');
const {createRequire}=require('node:module');
const sdk=createRequire(require('node:path').resolve(
  'cloud-run/offer-portal-staging/package.json'));
const sha=x=>createHash('sha256').update(x).digest('hex');
const AT='2026-10-18T12:00:00.000Z';
const NOW=new Date('2026-10-18T12:00:01.000Z');
const PROJECT='demo-lszh-automations';
const DATABASE='lszh-offers-staging';
const ENV_OK=process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8088' &&
 process.env.GCLOUD_PROJECT===PROJECT && !process.env.K_SERVICE &&
 !process.env.GOOGLE_APPLICATION_CREDENTIALS;
async function seed(mode,recordId,tokenHash){
 const {buildSyntheticReceiptReview}=await import(
   '../cloud-run/offer-portal-staging/receiptRecoveryReview.mjs');
 const quote='a'.repeat(64),terms='b'.repeat(64),avv='c'.repeat(64);
 const offer={
  tokenHash,status:'accepted',approved:true,revision:2,
  acceptedAt:AT,recipientEmail:'synthetic@example.invalid',
  offerNumber:'TEST_LOCK_EMULATOR_20261018_NO_CONTRACT',
  termsVersion:'TEST_v1.0_RC1',
  source:{kind:'LSZH_SYNTHETIC_ONLY',baseId:'appzJiskpAdaR1HEv',
    tableId:'tbljeIUoD7wwKuSmS',recordId},
  downstream:{airtable:'disabled',proofPdf:'disabled',email:'disabled'},
  bundle:{avv_required:mode,quote:{sha256:quote},terms:{sha256:terms},
    ...(mode==='Ja'?{avv:{sha256:avv}}:{})}
 };
 offer.evidence={
  accepted_at_utc:AT,authorized_confirmed:true,terms_confirmed:true,
  quote_pdf_sha256:quote,terms_pdf_sha256:terms,
  avv_required:mode==='Ja',avv_confirmed:mode==='Ja',
  avv_pdf_sha256:mode==='Ja'?avv:null
 };
 offer.receiptReview=buildSyntheticReceiptReview(offer,offer.evidence,AT);
 return offer;
}
if(!ENV_OK){
 test('review reservation requires local Firestore emulator, not Cloud',{skip:true},()=>{});
}else{
 for(const mode of ['Ja','Nein']){
  test('actual named Firestore emulator reserves one review lock under two concurrent writers: '+mode,
    {timeout:60000},async t=>{
    const {Firestore}=sdk('@google-cloud/firestore');
    const {createFirestoreOfferStore}=await import(
      '../cloud-run/offer-portal-staging/firestoreOfferStore.mjs');
    const db=new Firestore({projectId:PROJECT,databaseId:DATABASE});
    const tokenHash=sha(randomBytes(32));
    const recordId='rec'+randomBytes(7).toString('hex');
    const original=await seed(mode,recordId,tokenHash);
    const ref=db.collection('lszh_staging_offers_v1').doc(tokenHash);
    let created=false;
    t.after(async()=>{
      if(created){
       const latest=await ref.get();
       if(latest.exists){
        const data=latest.data();
        assert.equal(data.source.kind,'LSZH_SYNTHETIC_ONLY');
        assert.equal(data.source.recordId,recordId);
        assert.equal(data.tokenHash,tokenHash);
        await ref.delete();
        assert.equal((await ref.get()).exists,false);
       }
      }
      await db.terminate();
    });
    await ref.create(original);created=true;
    const storeA=createFirestoreOfferStore(db);
    const storeB=createFirestoreOfferStore(db);
    const key=original.receiptReview.idempotencyKey;
    const a='TEST_ATTEMPT_AAAA123456789012';
    const b='TEST_ATTEMPT_BBBB123456789012';
    const result=await Promise.all([
      storeA.reserveSyntheticReceiptReview(tokenHash,key,a,NOW),
      storeB.reserveSyntheticReceiptReview(tokenHash,key,b,NOW)
    ]);
    assert.equal(result.filter(x=>x==='RESERVED_REVIEW_ONLY').length,1);
    assert.equal(result.filter(x=>x==='LOCKED_BY_OTHER_ATTEMPT').length,1);
    const saved=(await ref.get()).data();
    assert.equal(saved.receiptReviewLock.state,'HELD_FOR_REVIEW');
    assert.equal(saved.receiptReviewLock.idempotencyKey,key);
    assert.ok([a,b].includes(saved.receiptReviewLock.attemptId));
    assert.equal(saved.receiptReviewLock.reviewDeadlineAt,
      new Date(NOW.getTime()+15*60*1000).toISOString());
    assert.equal(saved.revision,2);
    assert.equal(saved.status,'accepted');
    assert.equal(saved.receiptReview.receiptDriveId,null);
    assert.deepEqual(saved.downstream,{
      airtable:'disabled',proofPdf:'disabled',email:'disabled'
    });
    const matching=saved.receiptReviewLock.attemptId;
    const other=matching===a?b:a;
    assert.equal(await storeA.reserveSyntheticReceiptReview(tokenHash,key,matching,NOW),
      'ALREADY_RESERVED_REVIEW_ONLY');
    assert.equal(await storeB.reserveSyntheticReceiptReview(tokenHash,key,other,
      new Date(NOW.getTime()+16*60*1000)),'MANUAL_RECONCILIATION_REQUIRED');
    const later=(await ref.get()).data();
    assert.deepEqual(later.receiptReviewLock,saved.receiptReviewLock);
    assert.equal(later.receiptReview.receiptDriveId,null);
   });
 }
}
