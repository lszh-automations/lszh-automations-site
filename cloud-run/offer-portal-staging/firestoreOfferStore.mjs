import {offerFingerprint} from './portalCore.mjs';
import {buildSyntheticReceiptReview} from './receiptRecoveryReview.mjs';
import {decideSyntheticReceiptReviewLock} from './receiptProcessingLock.mjs';

// Purposefully isolated staging collection. Firestore server SDK uses the
// Cloud Run service identity (ADC) — never JSON private keys in the app.
// No database, credentials or data are created by importing this module.
const COLLECTION='lszh_staging_offers_v1';
const SHA=/^[a-f0-9]{64}$/;

export function createFirestoreOfferStore(db){
  if(!db||typeof db.collection!=='function'||typeof db.runTransaction!=='function')
    throw Error('firestore_not_configured');
  const collection=db.collection(COLLECTION);
  function refFor(tokenHash){
    if(typeof tokenHash!=='string'||!SHA.test(tokenHash))throw Error('invalid_token_hash');
    return collection.doc(tokenHash);
  }
  async function get(tokenHash){
    const snapshot=await refFor(tokenHash).get();
    if(!snapshot.exists)return null;
    const item=snapshot.data();
    return item && item.tokenHash===tokenHash ? item : null;
  }
  async function claim(tokenHash,expectedFingerprint,evidence,now){
    if(typeof expectedFingerprint!=='string'||!SHA.test(expectedFingerprint)||
       !evidence||typeof evidence!=='object'||
       !(now instanceof Date)||Number.isNaN(now.valueOf()))
      throw Error('claim_invalid');
    const ref=refFor(tokenHash);
    // Firestore retries transactions under contention. Callback has NO
    // external API calls, emails, Make invocations or side effects.
    return db.runTransaction(async transaction=>{
      const snapshot=await transaction.get(ref);
      if(!snapshot.exists)return 'offer_changed';
      const latest=snapshot.data();
      if(!latest || latest.tokenHash!==tokenHash)return 'offer_changed';
      if(latest.status==='accepted')return 'already_accepted';
      if(latest.status!=='sent' || latest.approved!==true ||
         !Number.isSafeInteger(latest.revision) ||
         Date.parse(latest.expiresAt)<now.getTime() ||
         offerFingerprint(latest)!==expectedFingerprint)return 'offer_changed';
      // For explicitly synthetic staging offers, persist a non-dispatchable
      // recovery marker ATOMICALLY with acceptance. No external side effects.
      const receiptReview=buildSyntheticReceiptReview(latest,evidence,now.toISOString());
      transaction.update(ref,{
        status:'accepted',revision:latest.revision+1,acceptedAt:now.toISOString(),
        evidence,
        ...(receiptReview?{receiptReview}:{}),
        // Persist decision only: no automatic Airtable, Make or email actions.
        downstream:{airtable:'disabled',proofPdf:'disabled',email:'disabled'}
      });
      return 'accepted';
    });
  }
  // Extra capability is intentionally LOCAL-EMULATOR-ONLY, even if the
  // disabled full portal package were accidentally built in Cloud Run.
  // It atomically reserves a review marker; it NEVER authorises a PDF upload.
  async function reserveSyntheticReceiptReview(tokenHash,expectedReviewKey,attemptId,now){
    if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8088' ||
       process.env.GCLOUD_PROJECT!=='demo-lszh-automations' ||
       process.env.GOOGLE_APPLICATION_CREDENTIALS ||
       process.env.K_SERVICE ||
       db.projectId!=='demo-lszh-automations' ||
       db.databaseId!=='lszh-offers-staging')
      throw Error('local_emulator_required');
    const ref=refFor(tokenHash);
    return db.runTransaction(async transaction=>{
      const snapshot=await transaction.get(ref);
      if(!snapshot.exists)return 'NO_GO_INVALID_SYNTHETIC_REVIEW';
      const latest=snapshot.data();
      if(!latest || latest.tokenHash!==tokenHash)
        return 'NO_GO_INVALID_SYNTHETIC_REVIEW';
      const decision=decideSyntheticReceiptReviewLock(latest,{
        expectedReviewKey,attemptId,now
      });
      if(decision.code==='RESERVED_REVIEW_ONLY')
        transaction.update(ref,decision.patch);
      return decision.code;
    });
  }
  return {get,claim,reserveSyntheticReceiptReview};
}
export const STAGING_COLLECTION=COLLECTION;
