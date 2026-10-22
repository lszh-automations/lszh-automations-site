// OFFLINE, REVIEW-ONLY interface contract for a future private Make -> Firestore
// reservation service. This module exposes NO HTTP route, callable API, identity
// provider, Drive/Docs/Airtable/Gmail operation or execution permission.
// A future service MUST authenticate the internal caller, resolve the offer on
// the server by a trusted synthetic source index and re-check it transactionally.
import {inspectSyntheticReceiptRecovery} from './receiptRecoveryReview.mjs';

const RECORD=/^rec[A-Za-z0-9]{14}$/;
const KEY=/^[0-9a-f]{64}$/;
const ATTEMPT=/^TEST_ATTEMPT_[A-Za-z0-9_-]{12,64}$/;
const CHANNEL='LSZH_MAKE_RECEIPT_REVIEW_STAGING_V1';
const KNOWN=new Set([
  'RESERVED_REVIEW_ONLY',
  'ALREADY_RESERVED_REVIEW_ONLY',
  'LOCKED_BY_OTHER_ATTEMPT',
  'MANUAL_RECONCILIATION_REQUIRED',
  'NO_GO_INVALID_SYNTHETIC_REVIEW',
  'NO_GO_LOCK_STATE_INVALID'
]);

function exact(obj,keys){
  return obj!==null && typeof obj==='object' && !Array.isArray(obj) &&
    Object.getPrototypeOf(obj)===Object.prototype &&
    Object.keys(obj).sort().join(',')===keys.slice().sort().join(',');
}
function deny(reason){
  return {
    schemaVersion:1,channel:CHANNEL,status:'NO_GO',reason,
    stopBeforeModule:5,manualReviewRequired:true,
    canCreateGoogleDoc:false,canExportPdf:false,canUpload:false,
    canWriteFirestore:false,canWriteAirtable:false,canSendEmail:false
  };
}

/** Make supplies only opaque, non-customer test correlation; never an OAuth
 * token, raw offer token, Firestore document ID or a claimed permission flag.
 * The acceptedOffer is server-resolved trusted data, NOT payload content.
 */
export function prepareSyntheticMakeReceiptReservation(acceptedOffer,payload){
  if(!exact(payload,[
    'schemaVersion','channel','syntheticOnly','sourceRecordId',
    'receiptReviewKey','attemptId'
  ]) || payload.schemaVersion!==1 || payload.channel!==CHANNEL ||
      payload.syntheticOnly!==true ||
      !RECORD.test(payload.sourceRecordId||'') ||
      !KEY.test(payload.receiptReviewKey||'') ||
      !ATTEMPT.test(payload.attemptId||''))
    return deny('invalid_make_request');

  if(inspectSyntheticReceiptRecovery(acceptedOffer).status!=='REVIEW_ONLY' ||
     acceptedOffer.source.recordId!==payload.sourceRecordId ||
     acceptedOffer.receiptReview.idempotencyKey!==payload.receiptReviewKey)
    return deny('synthetic_offer_binding_mismatch');

  return {
    schemaVersion:1,channel:CHANNEL,status:'VALIDATED_OFFLINE_ONLY',
    sourceRecordId:payload.sourceRecordId,
    receiptReviewKey:payload.receiptReviewKey,
    attemptId:payload.attemptId,
    stopBeforeModule:5,
    requiresAuthenticatedInternalService:true,
    requiresTrustedFirestoreLookup:true,
    requiresEmulatorOnlyReservation:true,
    manualReviewRequired:true,
    canCreateGoogleDoc:false,canExportPdf:false,canUpload:false,
    canWriteFirestore:false,canWriteAirtable:false,canSendEmail:false
  };
}

/** Convert a Firestore reservation result to an inert Make-facing envelope.
 * Never interpret "RESERVED" as "proceed": a review lock is NOT a permit.
 */
export function describeSyntheticMakeReservationResult(acceptedOffer,payload,lockCode){
  const prepared=prepareSyntheticMakeReceiptReservation(acceptedOffer,payload);
  if(prepared.status!=='VALIDATED_OFFLINE_ONLY')return prepared;
  if(typeof lockCode!=='string'||!KNOWN.has(lockCode))
    return deny('unknown_or_missing_lock_result');
  return {
    schemaVersion:1,channel:CHANNEL,status:'STOP_REVIEW_ONLY',
    reservationResult:lockCode,
    sourceRecordId:prepared.sourceRecordId,
    stopBeforeModule:5,
    manualReviewRequired:true,
    canCreateGoogleDoc:false,canExportPdf:false,canUpload:false,
    canWriteFirestore:false,canWriteAirtable:false,canSendEmail:false
  };
}
