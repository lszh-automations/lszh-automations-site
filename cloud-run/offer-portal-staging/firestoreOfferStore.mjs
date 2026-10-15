import {offerFingerprint} from './portalCore.mjs';

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
      transaction.update(ref,{
        status:'accepted',revision:latest.revision+1,acceptedAt:now.toISOString(),
        evidence
      });
      return 'accepted';
    });
  }
  return {get,claim};
}
export const STAGING_COLLECTION=COLLECTION;
