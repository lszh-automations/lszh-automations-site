// Customer-offer index and acceptance transaction. No side effects at import.
// This module is not wired to an active Cloud Run service until reviewed.
import {offerFingerprint} from '../offer-portal-staging/portalCore.mjs';

export const CUSTOMER_OFFERS_COLLECTION='lszh_customer_offers_v1';
export const CUSTOMER_SOURCE_INDEX='lszh_customer_source_index_v1';
const HASH=/^[a-f0-9]{64}$/;
const REC=/^rec[A-Za-z0-9]{14}$/;
function fail(code){const e=Error('customer_firestore_'+code);e.code=code;throw e;}
function approved(item){
  const src=item?.source;
  return src?.kind==='LSZH_CUSTOMER_APPROVED_V1' &&
    src.legalApproved===true && src.liveApproved===true &&
    src.baseId==='appzJiskpAdaR1HEv'&&
    src.tableId==='tbljeIUoD7wwKuSmS'&&
    REC.test(src.recordId||'')&&
    HASH.test(item?.tokenHash||'')&&item?.status==='sent'&&
    item.approved===true&&item.revision===1&&
    item?.downstream?.airtable==='pending'&&
    item?.downstream?.proofPdf==='pending'&&
    item?.downstream?.email==='pending';
}
export function createCustomerOfferStore(db){
  if(!db||typeof db.collection!=='function'||typeof db.runTransaction!=='function')
    fail('database_missing');
  const offers=db.collection(CUSTOMER_OFFERS_COLLECTION);
  const indexes=db.collection(CUSTOMER_SOURCE_INDEX);
  const ref=hash=>{
    if(typeof hash!=='string'||!HASH.test(hash))fail('token_hash_invalid');
    return offers.doc(hash);
  };
  async function get(tokenHash){
    const snap=await ref(tokenHash).get();
    if(!snap.exists)return null;
    const item=snap.data();
    return item?.tokenHash===tokenHash?item:null;
  }
  async function register(item){
    if(!approved(item)||typeof item?.expiresAt!=='string'||
       Number.isNaN(Date.parse(item.expiresAt)))fail('source_not_approved');
    const iref=indexes.doc(item.source.recordId);
    const oref=ref(item.tokenHash);
    const finger=offerFingerprint(item);
    return db.runTransaction(async tx=>{
      // All reads before writes; transaction is safe under competing callers.
      const [i,o]=await Promise.all([tx.get(iref),tx.get(oref)]);
      if(i.exists){
        const idx=i.data();
        if(idx?.tokenHash!==item.tokenHash || idx?.fingerprint!==finger ||
           idx?.recordId!==item.source.recordId ||!o.exists)
          fail('source_conflict');
        const current=o.data();
        if(current?.status==='accepted'&&current.tokenHash===item.tokenHash &&
           current.source?.recordId===item.source.recordId)
          return {result:'already_accepted',recordId:item.source.recordId};
        if(!approved(current)||offerFingerprint(current)!==finger)
          fail('source_conflict');
        return {result:'already_registered',recordId:item.source.recordId};
      }
      if(o.exists)fail('token_conflict');
      tx.create(iref,{recordId:item.source.recordId,tokenHash:item.tokenHash,
        fingerprint:finger,schemaVersion:1});
      tx.create(oref,item);
      return {result:'registered',recordId:item.source.recordId};
    });
  }
  async function claim(tokenHash,expectedFingerprint,evidence,now){
    if(!HASH.test(expectedFingerprint||'')||!evidence||
       typeof evidence!=='object'||!(now instanceof Date)||Number.isNaN(now.valueOf()))
      fail('claim_invalid');
    return db.runTransaction(async tx=>{
      const offerRef=ref(tokenHash);
      const snap=await tx.get(offerRef);
      if(!snap.exists)return 'offer_changed';
      const item=snap.data();
      if(item?.status==='accepted')return 'already_accepted';
      if(!approved(item)||Date.parse(item.expiresAt)<now.getTime()||
         offerFingerprint(item)!==expectedFingerprint)
        return 'offer_changed';
      // Firestore is authoritative for the decision. Airtable and Make
      // are post-commit steps with explicit recovery on uncertain results.
      tx.update(offerRef,{
        status:'accepted',revision:item.revision+1,
        acceptedAt:now.toISOString(),evidence,
        downstream:{airtable:'pending',proofPdf:'pending',email:'pending'}
      });
      return 'accepted';
    });
  }
  return {get,register,claim};
}
