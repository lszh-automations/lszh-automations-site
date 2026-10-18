// Local Firestore emulator ONLY: atomic synthetic Airtable source -> offer
// mapping. No external access, public HTTP endpoint, secrets or customer data.
// The token SHA is a private internal lookup pointer; NEVER return it to Make.
import {createHash} from 'node:crypto';
import {STAGING_COLLECTION} from './firestoreOfferStore.mjs';
import {offerFingerprint} from './portalCore.mjs';
import {prepareSyntheticMakeReceiptReservation,
  describeSyntheticMakeReservationResult} from './receiptMakeReservationContract.mjs';
import {decideSyntheticReceiptReviewLock} from './receiptProcessingLock.mjs';

export const SYNTHETIC_SOURCE_INDEX='lszh_staging_source_index_v1';
const BASE='appzJiskpAdaR1HEv';
const TABLE='tbljeIUoD7wwKuSmS';
const RECORD=/^rec[A-Za-z0-9]{14}$/;
const SHA=/^[0-9a-f]{64}$/;
const INDEX_PURPOSE='LSZH_SYNTHETIC_LOCAL_SOURCE_INDEX_V1';

function reject(reason){throw Error(reason);}
function checkEmulator(db){
  if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8088' ||
     process.env.GCLOUD_PROJECT!=='demo-lszh-automations' ||
     process.env.K_SERVICE || process.env.GOOGLE_APPLICATION_CREDENTIALS ||
     !db || typeof db.runTransaction!=='function' ||
     typeof db.collection!=='function' ||
     db.projectId!=='demo-lszh-automations' ||
     db.databaseId!=='lszh-offers-staging')
    reject('local_emulator_required');
}
export function syntheticSourceIndexId(recordId){
  if(typeof recordId!=='string'||!RECORD.test(recordId))
    reject('synthetic_source_invalid');
  return createHash('sha256').update([
    INDEX_PURPOSE,BASE,TABLE,recordId
  ].join('\u0000')).digest('hex');
}
function exact(obj,expected){
  return obj!==null && typeof obj==='object' && !Array.isArray(obj) &&
    Object.getPrototypeOf(obj)===Object.prototype &&
    Object.keys(obj).sort().join(',')===expected.slice().sort().join(',');
}
function verifiedSource(item,recordId){
  return item && typeof item==='object' &&
    item.source?.kind==='LSZH_SYNTHETIC_ONLY' &&
    item.source.baseId===BASE && item.source.tableId===TABLE &&
    item.source.recordId===recordId &&
    SHA.test(item.tokenHash||'') &&
    item.downstream?.airtable==='disabled' &&
    item.downstream?.proofPdf==='disabled' &&
    item.downstream?.email==='disabled';
}
function indexDoc(item){
  return {
    schemaVersion:1,purpose:INDEX_PURPOSE,
    sourceBaseId:BASE,sourceTableId:TABLE,
    sourceRecordId:item.source.recordId,
    tokenHash:item.tokenHash
  };
}
function matchesIndex(index,recordId){
  return exact(index,['schemaVersion','purpose','sourceBaseId',
    'sourceTableId','sourceRecordId','tokenHash']) &&
    index.schemaVersion===1 && index.purpose===INDEX_PURPOSE &&
    index.sourceBaseId===BASE && index.sourceTableId===TABLE &&
    index.sourceRecordId===recordId && SHA.test(index.tokenHash);
}
function matchesOffer(item,expect){
  return verifiedSource(item,expect.source.recordId) &&
    item.tokenHash===expect.tokenHash &&
    item.status==='sent' && item.revision===1 && item.approved===true &&
    offerFingerprint(item)===offerFingerprint(expect) &&
    JSON.stringify(item.source)===JSON.stringify(expect.source) &&
    JSON.stringify(item.downstream)===JSON.stringify(expect.downstream);
}
const noGo=reason=>({
  schemaVersion:1,channel:'LSZH_MAKE_RECEIPT_REVIEW_STAGING_V1',
  status:'NO_GO',reason,stopBeforeModule:5,manualReviewRequired:true,
  canCreateGoogleDoc:false,canExportPdf:false,canUpload:false,
  canWriteFirestore:false,canWriteAirtable:false,canSendEmail:false
});

/**
 * Called ONLY after mapSyntheticAirtableOffer has fully rejected customer
 * records. Both the index and the offer are created in the same transaction;
 * Firestore contention retries cannot create two mappings for one source ID.
 * Pre-existing offers without an index are deliberately NOT backfilled.
 */
export async function registerSyntheticSourceLocalEmulator(db,item){
  checkEmulator(db);
  if(!verifiedSource(item,item?.source?.recordId) ||
     item.status!=='sent' || item.revision!==1 || item.approved!==true)
    reject('synthetic_source_invalid');
  const srcId=item.source.recordId;
  const idxRef=db.collection(SYNTHETIC_SOURCE_INDEX)
    .doc(syntheticSourceIndexId(srcId));
  const offerRef=db.collection(STAGING_COLLECTION).doc(item.tokenHash);
  return db.runTransaction(async tx=>{
    // Every read must precede every write inside a Firestore transaction.
    const [idxSnap,offerSnap]=await Promise.all([
      tx.get(idxRef),tx.get(offerRef)
    ]);
    if(idxSnap.exists){
      const index=idxSnap.data();
      if(!matchesIndex(index,srcId) || index.tokenHash!==item.tokenHash ||
         !offerSnap.exists || !matchesOffer(offerSnap.data(),item))
        reject('seed_conflict');
      return {result:'already_identical',sourceRecordId:srcId};
    }
    if(offerSnap.exists)reject('seed_conflict');
    tx.create(idxRef,indexDoc(item));
    tx.create(offerRef,item);
    return {result:'created',sourceRecordId:srcId};
  });
}

/**
 * Atomic trusted lookup + lock reservation. Payload never contains tokenHash;
 * the internal offer key comes only from the verified index.
 * This is NOT a public Make endpoint and NEVER returns a create/dispatch GO.
 */
export async function resolveAndReserveSyntheticMakeLocalEmulator(db,payload,now){
  checkEmulator(db);
  const recordId=payload?.sourceRecordId;
  if(typeof recordId!=='string'||!RECORD.test(recordId))
    return noGo('invalid_make_source_id');
  const idxRef=db.collection(SYNTHETIC_SOURCE_INDEX)
    .doc(syntheticSourceIndexId(recordId));
  return db.runTransaction(async tx=>{
    const idxSnap=await tx.get(idxRef);
    if(!idxSnap.exists || !matchesIndex(idxSnap.data(),recordId))
      return noGo('source_index_missing_or_invalid');
    const tokenHash=idxSnap.data().tokenHash;
    const offerRef=db.collection(STAGING_COLLECTION).doc(tokenHash);
    const offerSnap=await tx.get(offerRef);
    if(!offerSnap.exists)return noGo('source_offer_missing_or_invalid');
    const offer=offerSnap.data();
    if(!verifiedSource(offer,recordId) || offer.tokenHash!==tokenHash)
      return noGo('source_offer_missing_or_invalid');

    const prepared=prepareSyntheticMakeReceiptReservation(offer,payload);
    if(prepared.status!=='VALIDATED_OFFLINE_ONLY')
      return noGo('source_binding_or_request_invalid');
    const decision=decideSyntheticReceiptReviewLock(offer,{
      expectedReviewKey:prepared.receiptReviewKey,
      attemptId:prepared.attemptId,now
    });
    if(decision.code==='RESERVED_REVIEW_ONLY')
      tx.update(offerRef,decision.patch);
    // Never leak tokenHash / Firestore doc ref or raw offer data to Make.
    return describeSyntheticMakeReservationResult(offer,payload,decision.code);
  });
}
