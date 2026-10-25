'use strict';
// PHASE C STAGING ledger. A transaction-backed design, NOT wired to live CRM.
// This module NEVER calls Gmail, Make, HTTP, or any customer-facing CRM route.
// Trust boundary: Firestore client, signing key and receipt-verifier callback
// MUST be provisioned on an authorised backend, not by a browser.
const {createHash}=require('node:crypto');
const {
  COLLECTION,PURPOSE,blocked,verifyReleaseManifest,WINDOW_MS
}=require('./contract-dispatch-release-staging');
const ID=/^contract_send_pkg_[A-Za-z0-9_-]{1,100}_r[1-9][0-9]{0,6}$/;
const MESSAGE=/^[A-Za-z0-9_./:+-]{4,200}$/;
function docId(prefix,value){
  return prefix+createHash('sha256').update(value).digest('hex');
}
function mustId(eventId){
  if(typeof eventId!=='string'||!ID.test(eventId))
    throw blocked('invalid event ID');
  return eventId;
}
function createContractDispatchLedger(db,config={}){
  const {signingSecret,verifyGatewayReceipt,verifyManualReview,now=()=>Date.now()}=config;
  if(!db||typeof db.collection!=='function'||typeof db.runTransaction!=='function'||
     !Buffer.isBuffer(signingSecret)||signingSecret.length<32||
     typeof verifyGatewayReceipt!=='function'||typeof verifyManualReview!=='function'||
     typeof now!=='function')
    throw blocked('trusted transaction ledger configuration missing');
  const col=db.collection(COLLECTION);
  const attemptRef=eventId=>col.doc(docId('attempt_',mustId(eventId)));
  const lockRef=offerId=>col.doc(docId('lock_',offerId));
  const iso=()=>{
    const v=now();
    if(!Number.isFinite(v))throw blocked('invalid transaction clock');
    return new Date(v).toISOString();
  };
  async function reserve(manifest){
    verifyReleaseManifest(manifest,signingSecret);
    if(manifest.purpose!==PURPOSE)throw blocked('test release purpose missing');
    const age=now()-Date.parse(manifest.approvedAt);
    if(!Number.isFinite(age)||age < -30000||age>WINDOW_MS)
      throw blocked('signed approval has expired');
    const ref=attemptRef(manifest.eventId),lock=lockRef(manifest.offerId);
    return db.runTransaction(async tx=>{
      // Both reads happen before any write, as required by Firestore transactions.
      const [prior,offerLock]=await Promise.all([tx.get(ref),tx.get(lock)]);
      if(prior.exists||offerLock.exists)
        throw blocked('dispatch already reserved or offer locked; no automatic retry',409);
      const stamp=iso();
      // Never persist PDF bytes, token, email HTML, Google secrets or callback data.
      const record={
        kind:'TEST_ONLY_CONTRACT_DISPATCH_LEDGER',schemaVersion:1,
        packageId:manifest.packageId,eventId:manifest.eventId,
        packageSha256:manifest.packageSha256,offerId:manifest.offerId,
        offerNumber:manifest.offerNumber,revision:manifest.revision,
        offerSnapshotSha256:manifest.offerSnapshotSha256,
        avvRequired:manifest.avvRequired,
        recipient:manifest.recipient,operatorEmail:manifest.operatorEmail,
        approvalId:manifest.approvalId,approvedAt:manifest.approvedAt,
        documentHashes:manifest.documents.map(d=>({
          kind:d.kind,version:d.version,sha256:d.sha256,bytes:d.bytes,
          archiveFileId:d.archiveFileId,filename:d.filename
        })),
        state:'reserved',provider:'NONE',messageId:null,
        createdAt:stamp,updatedAt:stamp,reviewedBy:null,reviewId:null
      };
      // Lock remains even when delivery is uncertain or manually closed,
      // preventing replay under an alternative package revision.
      tx.create(lock,{kind:'TEST_ONLY_CONTRACT_OFFER_LOCK',
        offerId:manifest.offerId,eventId:manifest.eventId,createdAt:stamp});
      tx.create(ref,record);
      return Object.freeze({eventId:record.eventId,packageId:record.packageId,
        state:record.state,recipient:record.recipient,documentCount:record.documentHashes.length});
    });
  }
  async function markDeliveryUncertain(eventId){
    const ref=attemptRef(eventId);
    return db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists)throw blocked('no reserved dispatch',404);
      const prev=snap.data();
      if(prev.state!=='reserved')
        throw blocked('dispatch already reviewed or finalised',409);
      tx.update(ref,{state:'delivery_review',updatedAt:iso()});
      return Object.freeze({eventId,state:'delivery_review',transmitted:'unknown'});
    });
  }
  async function confirmVerifiedReceipt(eventId,receipt){
    const ref=attemptRef(eventId);
    // Check structural evidence before external trusted verification.
    if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||
       Object.keys(receipt).some(k=>![
         'ok','eventId','packageSha256','to','attachmentCount',
         'provider','messageId'
       ].includes(k))||
       receipt.ok!==true||receipt.eventId!==eventId||
       receipt.provider!=='gmail'||!MESSAGE.test(receipt.messageId||''))
      throw blocked('Gmail receipt has invalid structure');
    return db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists)throw blocked('no reserved dispatch',404);
      const prev=snap.data();
      if(!['reserved','delivery_review'].includes(prev.state))
        throw blocked('dispatch already finalised or duplicated',409);
      if(receipt.packageSha256!==prev.packageSha256||
         receipt.to!==prev.recipient||
         receipt.attachmentCount!==prev.documentHashes.length)
        throw blocked('Gmail receipt does not match sealed package');
      // Must be a trusted backend verifier against the actual Gmail sent event.
      // Provider response alone or a browser-supplied boolean is NOT sufficient.
      const proven=await verifyGatewayReceipt({receipt,
        expected:{eventId:prev.eventId,packageSha256:prev.packageSha256,
          recipient:prev.recipient,documentHashes:prev.documentHashes}});
      if(proven!==true)throw blocked('gateway/provider delivery was not independently verified');
      tx.update(ref,{state:'confirmed_test_only',provider:'gmail',
        messageId:receipt.messageId,updatedAt:iso()});
      return Object.freeze({eventId,state:'confirmed_test_only',
        messageId:receipt.messageId,transmitted:true});
    });
  }
  async function closeVerifiedNotSent(eventId,review){
    const ref=attemptRef(eventId);
    if(!review||typeof review!=='object'||Array.isArray(review)||
       Object.keys(review).some(k=>!['reviewId','reviewedBy'].includes(k))||
       typeof review.reviewId!=='string'||!/^review_[A-Za-z0-9_-]{8,120}$/.test(review.reviewId)||
       typeof review.reviewedBy!=='string'||review.reviewedBy.length>254)
      throw blocked('manual review evidence malformed');
    return db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists)throw blocked('no reserved dispatch',404);
      const prev=snap.data();
      if(prev.state!=='delivery_review')
        throw blocked('only uncertain sends can be manually closed',409);
      const verified=await verifyManualReview({
        review,expected:{eventId:prev.eventId,recipient:prev.recipient,
          packageSha256:prev.packageSha256}
      });
      if(verified!==true)throw blocked('unverified mailbox check cannot close dispatch');
      tx.update(ref,{state:'not_sent_closed',updatedAt:iso(),
        reviewedBy:review.reviewedBy,reviewId:review.reviewId});
      // Per-offer lock deliberately remains. New release needs separate,
      // explicit operator remediation code not provided in Phase C.
      return Object.freeze({eventId,state:'not_sent_closed',mayAutoRetry:false});
    });
  }
  async function inspect(eventId){
    const snap=await attemptRef(eventId).get();
    if(!snap.exists)return null;
    const r=snap.data();
    // No email bodies, attachment bytes or credentials are ever stored.
    return Object.freeze({eventId:r.eventId,packageId:r.packageId,
      status:r.state,attachmentCount:r.documentHashes.length,
      createdAt:r.createdAt,updatedAt:r.updatedAt,
      provider:r.provider,messageId:r.messageId});
  }
  return Object.freeze({
    reserve,markDeliveryUncertain,confirmVerifiedReceipt,
    closeVerifiedNotSent,inspect
  });
}
module.exports={COLLECTION,createContractDispatchLedger};
