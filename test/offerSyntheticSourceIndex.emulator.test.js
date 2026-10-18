'use strict';
// Real transaction semantics through the LOCAL Firebase Firestore emulator.
// Never connect to live Cloud project, Make, Airtable, Google Drive or Gmail.
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes,createHash}=require('node:crypto');
const {createRequire}=require('node:module');
const sdk=createRequire(require('node:path').resolve(
  'cloud-run/offer-portal-staging/package.json'));
const SHA=v=>createHash('sha256').update(v).digest('hex');
const PROJECT='demo-lszh-automations',DATABASE='lszh-offers-staging';
const AT='2026-10-18T12:00:00.000Z';
const NOW=new Date('2026-10-18T12:00:01.000Z');
const LOCAL=process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8088' &&
  process.env.GCLOUD_PROJECT===PROJECT && !process.env.K_SERVICE &&
  !process.env.GOOGLE_APPLICATION_CREDENTIALS;
const newSource=()=> 'rec'+randomBytes(7).toString('hex');
const token=()=>SHA(randomBytes(36));
function synthetic(recordId,tokenHash,mode='Ja'){
  const quote='a'.repeat(64),terms='b'.repeat(64),avv='c'.repeat(64);
  return {
    tokenHash,status:'sent',approved:true,revision:1,
    termsVersion:'TEST_v1.0_RC1',expiresAt:'2099-12-31T00:00:00.000Z',
    recipientEmail:'synthetic@example.invalid',
    offerNumber:'TEST_INDEXED_LOOKUP_20261018_NO_CONTRACT',
    details:{company:'Synthetic Company'},
    source:{kind:'LSZH_SYNTHETIC_ONLY',baseId:'appzJiskpAdaR1HEv',
      tableId:'tbljeIUoD7wwKuSmS',recordId},
    bundle:{avv_required:mode,
      quote:{id:'1LSZHTestIndexedQuote00000000000000001',sha256:quote},
      terms:{id:'1LSZHTestIndexedTerms00000000000000001',sha256:terms},
      ...(mode==='Ja'?{avv:{id:'1LSZHTestIndexedAvv00000000000000001',sha256:avv}}:{})},
    downstream:{airtable:'disabled',proofPdf:'disabled',email:'disabled'}
  };
}
function proof(o){
  return {accepted_at_utc:AT,authorized_confirmed:true,
    terms_confirmed:true,quote_pdf_sha256:o.bundle.quote.sha256,
    terms_pdf_sha256:o.bundle.terms.sha256,avv_required:o.bundle.avv_required==='Ja',
    avv_confirmed:o.bundle.avv_required==='Ja',
    avv_pdf_sha256:o.bundle.avv_required==='Ja'?o.bundle.avv.sha256:null};
}
const request=(o,attemptId)=>({
  schemaVersion:1,channel:'LSZH_MAKE_RECEIPT_REVIEW_STAGING_V1',
  syntheticOnly:true,sourceRecordId:o.source.recordId,
  receiptReviewKey:o.receiptReview.idempotencyKey,attemptId
});
const a='TEST_ATTEMPT_ABCDE12345ABCDE12345';
const b='TEST_ATTEMPT_56789FGHIJ56789FGHIJ';
if(!LOCAL){
  test('source index requires isolated local Firestore emulator',{skip:true},()=>{});
}else{
  const load=()=>import('../cloud-run/offer-portal-staging/syntheticSourceIndex.mjs');
  for(const mode of ['Ja','Nein']){
    test('indexed source resolves atomically into one Make review reservation: '+mode,
      {timeout:60000},async t=>{
      const {Firestore}=sdk('@google-cloud/firestore');
      const {registerSyntheticSourceLocalEmulator,
        resolveAndReserveSyntheticMakeLocalEmulator,
        syntheticSourceIndexId,SYNTHETIC_SOURCE_INDEX}=await load();
      const {createFirestoreOfferStore}=await import(
        '../cloud-run/offer-portal-staging/firestoreOfferStore.mjs');
      const {offerFingerprint}=await import(
        '../cloud-run/offer-portal-staging/portalCore.mjs');
      const db=new Firestore({projectId:PROJECT,databaseId:DATABASE});
      const sourceId=newSource(),item=synthetic(sourceId,token(),mode);
      const offerRef=db.collection('lszh_staging_offers_v1').doc(item.tokenHash);
      const indexRef=db.collection(SYNTHETIC_SOURCE_INDEX)
        .doc(syntheticSourceIndexId(sourceId));
      t.after(async()=>{
        const index=await indexRef.get();
        if(index.exists){
          assert.equal(index.data().sourceRecordId,sourceId);
          assert.equal(index.data().tokenHash,item.tokenHash);
          await indexRef.delete();
        }
        const offer=await offerRef.get();
        if(offer.exists){
          assert.equal(offer.data().source.recordId,sourceId);
          assert.equal(offer.data().tokenHash,item.tokenHash);
          await offerRef.delete();
        }
        await db.terminate();
      });
      assert.deepEqual(await registerSyntheticSourceLocalEmulator(db,item),
        {result:'created',sourceRecordId:sourceId});
      assert.deepEqual(await registerSyntheticSourceLocalEmulator(db,item),
        {result:'already_identical',sourceRecordId:sourceId});
      const idx=(await indexRef.get()).data();
      assert.equal(idx.tokenHash,item.tokenHash);
      assert.equal(idx.sourceRecordId,sourceId);
      assert.ok(!(JSON.stringify(idx).includes(item.recipientEmail)));

      const store=createFirestoreOfferStore(db);
      assert.equal(await store.claim(item.tokenHash,offerFingerprint(item),
        proof(item),new Date(AT)),'accepted');
      const accepted=(await offerRef.get()).data();
      const [first,second]=await Promise.all([
        resolveAndReserveSyntheticMakeLocalEmulator(db,request(accepted,a),NOW),
        resolveAndReserveSyntheticMakeLocalEmulator(db,request(accepted,b),NOW)
      ]);
      assert.equal([first,second].filter(r=>r.reservationResult==='RESERVED_REVIEW_ONLY').length,1);
      assert.equal([first,second].filter(r=>r.reservationResult==='LOCKED_BY_OTHER_ATTEMPT').length,1);
      for(const outcome of [first,second]){
        assert.equal(outcome.status,'STOP_REVIEW_ONLY');
        assert.equal(outcome.stopBeforeModule,5);
        assert.equal(outcome.canCreateGoogleDoc,false);
        assert.equal(outcome.canUpload,false);
        assert.equal(outcome.canSendEmail,false);
        assert.ok(!JSON.stringify(outcome).includes(item.tokenHash));
        assert.ok(!('tokenHash' in outcome));
      }
      const lock=(await offerRef.get()).data().receiptReviewLock;
      assert.equal(lock.state,'HELD_FOR_REVIEW');
      const same=await resolveAndReserveSyntheticMakeLocalEmulator(
        db,request(accepted,lock.attemptId),NOW);
      assert.equal(same.reservationResult,'ALREADY_RESERVED_REVIEW_ONLY');
      assert.equal((await offerRef.get()).data().receiptReviewLock.attemptId,lock.attemptId);
    });
  }

  test('two simultaneous tokens for one Airtable source cannot both be registered',
    {timeout:60000},async t=>{
    const {Firestore}=sdk('@google-cloud/firestore');
    const {registerSyntheticSourceLocalEmulator,syntheticSourceIndexId,
      SYNTHETIC_SOURCE_INDEX}=await load();
    const db=new Firestore({projectId:PROJECT,databaseId:DATABASE});
    const recordId=newSource(),first=synthetic(recordId,token());
    const second=synthetic(recordId,token());
    const idxRef=db.collection(SYNTHETIC_SOURCE_INDEX)
      .doc(syntheticSourceIndexId(recordId));
    const refs=[first,second].map(o=>db.collection('lszh_staging_offers_v1').doc(o.tokenHash));
    t.after(async()=>{
      const idx=await idxRef.get();
      if(idx.exists){
        assert.equal(idx.data().sourceRecordId,recordId);
        await idxRef.delete();
      }
      for(let i=0;i<refs.length;i++){
        const snap=await refs[i].get();
        if(snap.exists){
          assert.equal(snap.data().source.recordId,recordId);
          assert.equal(snap.data().tokenHash,[first,second][i].tokenHash);
          await refs[i].delete();
        }
      }
      await db.terminate();
    });
    const settled=await Promise.allSettled([
      registerSyntheticSourceLocalEmulator(db,first),
      registerSyntheticSourceLocalEmulator(db,second)
    ]);
    assert.equal(settled.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(settled.filter(r=>r.status==='rejected').length,1);
    assert.match(String(settled.find(r=>r.status==='rejected').reason),/seed_conflict/);
    const idx=(await idxRef.get()).data();
    assert.ok([first.tokenHash,second.tokenHash].includes(idx.tokenHash));
    const stored=await Promise.all(refs.map(ref=>ref.get()));
    assert.equal(stored.filter(x=>x.exists).length,1);
  });
  test('legacy offer without source index is NOT implicitly rebound', 
    {timeout:30000},async t=>{
    const {Firestore}=sdk('@google-cloud/firestore');
    const {registerSyntheticSourceLocalEmulator,SYNTHETIC_SOURCE_INDEX,
      syntheticSourceIndexId}=await load();
    const db=new Firestore({projectId:PROJECT,databaseId:DATABASE});
    const recordId=newSource(),item=synthetic(recordId,token());
    const ref=db.collection('lszh_staging_offers_v1').doc(item.tokenHash);
    const indexRef=db.collection(SYNTHETIC_SOURCE_INDEX)
      .doc(syntheticSourceIndexId(recordId));
    t.after(async()=>{
      const snap=await ref.get();
      if(snap.exists){
        assert.equal(snap.data().source.recordId,recordId);
        await ref.delete();
      }
      assert.equal((await indexRef.get()).exists,false);
      await db.terminate();
    });
    await ref.create(item);
    await assert.rejects(()=>registerSyntheticSourceLocalEmulator(db,item),
      /seed_conflict/);
    assert.equal((await indexRef.get()).exists,false);
  });
  test('missing index or mismatched offer fails before any Make reservation',
    {timeout:30000},async t=>{
    const {Firestore}=sdk('@google-cloud/firestore');
    const {registerSyntheticSourceLocalEmulator,
      resolveAndReserveSyntheticMakeLocalEmulator,
      syntheticSourceIndexId,SYNTHETIC_SOURCE_INDEX}=await load();
    const db=new Firestore({projectId:PROJECT,databaseId:DATABASE});
    const item=synthetic(newSource(),token());
    const idxRef=db.collection(SYNTHETIC_SOURCE_INDEX)
      .doc(syntheticSourceIndexId(item.source.recordId));
    const offerRef=db.collection('lszh_staging_offers_v1').doc(item.tokenHash);
    t.after(async()=>{
      const idx=await idxRef.get();
      if(idx.exists){assert.equal(idx.data().sourceRecordId,item.source.recordId);await idxRef.delete();}
      const offer=await offerRef.get();
      if(offer.exists){assert.equal(offer.data().tokenHash,item.tokenHash);await offerRef.delete();}
      await db.terminate();
    });
    const fake={schemaVersion:1,channel:'LSZH_MAKE_RECEIPT_REVIEW_STAGING_V1',
      syntheticOnly:true,sourceRecordId:item.source.recordId,
      receiptReviewKey:'a'.repeat(64),attemptId:a};
    const missing=await resolveAndReserveSyntheticMakeLocalEmulator(db,fake,NOW);
    assert.equal(missing.status,'NO_GO');
    await registerSyntheticSourceLocalEmulator(db,item);
    const unaccepted=await resolveAndReserveSyntheticMakeLocalEmulator(db,fake,NOW);
    assert.equal(unaccepted.status,'NO_GO');
    assert.equal((await offerRef.get()).data().receiptReviewLock,undefined);
    await idxRef.update({sourceRecordId:newSource()});
    const poisoned=await resolveAndReserveSyntheticMakeLocalEmulator(db,fake,NOW);
    assert.equal(poisoned.status,'NO_GO');
    assert.equal((await offerRef.get()).data().receiptReviewLock,undefined);
  });
}
