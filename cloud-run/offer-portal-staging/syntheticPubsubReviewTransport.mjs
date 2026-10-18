// Pure OFFLINE contract between Make's existing Pub/Sub publish capability
// and a proposed IAM-authenticated Cloud Run internal review receiver.
// No publish method, no subscriber, no HTTP handler, no token verification.
// Only the real Google Cloud IAM boundary can authenticate Pub/Sub push.
// Pub/Sub PUSH is at-least-once; never treat a message ID as a business lock.
import {prepareSyntheticMakeReceiptReservation} from './receiptMakeReservationContract.mjs';

const CHANNEL='LSZH_MAKE_RECEIPT_REVIEW_STAGING_V1';
const TYPE='LSZH_G3_SYNTHETIC_REVIEW_ONLY';
const TOPIC='projects/demo-lszh-automations/topics/lszh-g3-review-demo';
const SUB='projects/demo-lszh-automations/subscriptions/lszh-g3-review-demo';
const RECORD=/^rec[A-Za-z0-9]{14}$/;
const SHA=/^[a-f0-9]{64}$/;
const ATTEMPT=/^TEST_ATTEMPT_[A-Za-z0-9_-]{12,64}$/;
const MAX_DATA_BYTES=1024;
const MAX_PUSH_BYTES=4096;
function exact(obj,keys){
  return obj!==null && typeof obj==='object' && !Array.isArray(obj) &&
    Object.getPrototypeOf(obj)===Object.prototype &&
    Object.keys(obj).sort().join('|')===keys.slice().sort().join('|');
}
const denied=(reason)=>({
  status:'NO_GO',reason,stopBeforeModule:5,manualReviewRequired:true,
  canPublish:false,canCreateGoogleDoc:false,canUpload:false,
  canWriteFirestore:false,canWriteAirtable:false,canSendEmail:false
});
function validRequest(p){
  return exact(p,['schemaVersion','channel','syntheticOnly','sourceRecordId',
    'receiptReviewKey','attemptId']) &&
    p.schemaVersion===1 && p.channel===CHANNEL && p.syntheticOnly===true &&
    typeof p.sourceRecordId==='string' && RECORD.test(p.sourceRecordId) &&
    typeof p.receiptReviewKey==='string' && SHA.test(p.receiptReviewKey) &&
    typeof p.attemptId==='string' && ATTEMPT.test(p.attemptId);
}
/** These are inert publishing instructions, not provider requests. */
export function buildSyntheticPubsubPublishPlan(payload){
  if(!validRequest(payload))return denied('invalid_synthetic_publish_request');
  const bytes=Buffer.from(JSON.stringify(payload),'utf8');
  if(bytes.length>MAX_DATA_BYTES)return denied('oversized_synthetic_publish_request');
  return {
    status:'PLAN_ONLY_DO_NOT_PUBLISH',
    // The following message.data is the Pub/Sub REST WIRE representation.
    // Make's native "Publish Messages" mapper may expect raw data and apply
    // Base64 itself. DO NOT paste this data into Make until verified.
    dataFormat:'PUBSUB_REST_BASE64_WIRE_ONLY',
    makeNativeDataEncodingVerified:false,
    topic:TOPIC,
    message:{
      data:bytes.toString('base64'),
      attributes:{lszhKind:TYPE,lszhSchema:'1'}
    },
    stopBeforeModule:5,
    manualReviewRequired:true,
    requiresPublisherTopicOnlyIam:true,
    requiresBusinessGoogleOAuthVerification:true,
    requiresIndependentCloudRunIamVerification:true,
    canPublish:false,canCreateGoogleDoc:false,canUpload:false,
    canWriteFirestore:false,canWriteAirtable:false,canSendEmail:false
  };
}
/**
 * A strict fake Google Pub/Sub push envelope:
 *   {subscription,message:{messageId,publishTime,data,attributes}}
 * The caller's identity is NOT authenticated by this parser; the future
 * Cloud Run invoker IAM, subscription configuration and runtime auth design
 * must enforce the Pub/Sub push service identity separately.
 */
export function inspectSyntheticPubsubPushOffline(push,canonicalOffer){
  try{
    if(!exact(push,['subscription','message']) ||
       push.subscription!==SUB ||
       !exact(push.message,['messageId','publishTime','data','attributes']) ||
       !/^[0-9]{4,25}$/.test(push.message.messageId||'') ||
       typeof push.message.publishTime!=='string' ||
       !/^\d{4}-\d{2}-\d{2}T/.test(push.message.publishTime) ||
       !Number.isFinite(Date.parse(push.message.publishTime)) ||
       !exact(push.message.attributes,['lszhKind','lszhSchema']) ||
       push.message.attributes.lszhKind!==TYPE ||
       push.message.attributes.lszhSchema!=='1' ||
       typeof push.message.data!=='string' ||
       push.message.data.length>MAX_PUSH_BYTES ||
       !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(push.message.data))
      return denied('invalid_synthetic_push_envelope');

    const bytes=Buffer.from(push.message.data,'base64');
    if(bytes.length===0||bytes.length>MAX_DATA_BYTES ||
       bytes.toString('base64')!==push.message.data)
      return denied('invalid_synthetic_push_bytes');
    const payload=JSON.parse(bytes.toString('utf8'));
    if(!validRequest(payload))
      return denied('invalid_synthetic_push_payload');
    const verified=prepareSyntheticMakeReceiptReservation(canonicalOffer,payload);
    if(verified.status!=='VALIDATED_OFFLINE_ONLY')
      return denied('canonical_offer_binding_mismatch');

    // This output is NOT an acknowledgment or a receipt-processing permit.
    // Redelivery and different Pub/Sub IDs for the same business request are
    // expected; only the source-index+Firestore transaction can deduplicate.
    return {
      status:'STOP_REVIEW_ONLY',
      sourceRecordId:payload.sourceRecordId,
      receiptReviewKey:payload.receiptReviewKey,
      attemptId:payload.attemptId,
      stopBeforeModule:5,
      manualReviewRequired:true,
      requiresCloudRunIamVerified:true,
      requiresAtomicFirestoreReviewLock:true,
      canPublish:false,canCreateGoogleDoc:false,canUpload:false,
      canWriteFirestore:false,canWriteAirtable:false,canSendEmail:false
    };
  }catch{return denied('invalid_synthetic_push_envelope');}
}
