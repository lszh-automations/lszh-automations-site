'use strict';
// OFFLINE protocol only, not imported by any Cloud Run entrypoint.
// Destination Cloud Run MUST independently enforce Google-signed OIDC with
// exact service URL audience and roles/run.invoker limited to source SA.
// HMAC provides content integrity; it DOES NOT replace verified Cloud Run IAM.
// No fetch, persistence implementation, credential access, mail or retry.
const {createHmac,timingSafeEqual,randomBytes}=require('node:crypto');
const {planQuarantine}=require('./quarantine-plan');
const {STATUS}=require('./draft-review-gate');
const {eventId}=require('./outbox');

const SOURCE='lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com';
const DESTINATION='lszh-quarantine-handoff-staging';
const FORMAT='LSZH_STAGING_QUARANTINE_HANDOFF_V1';
const LIMIT_MS=120000, ALLOWED_SKEW_MS=10000;
const SHA=/^[a-f0-9]{64}$/;
const NONCE=/^[a-f0-9]{32}$/;
const SIG=/^[A-Za-z0-9_-]{43}$/;
const CONTENT_KEYS=['version','issuer','audience','documentId','reviewStatus',
 'reviewReason','issuedAtMs','expiresAtMs','nonce'];
const WRAPPER_KEYS=['payload','signature'];
function exact(x,keys) {
 return !!x && typeof x==='object' && !Array.isArray(x) &&
  Object.keys(x).length===keys.length && keys.every(k=>Object.hasOwn(x,k));
}
function blocked(reason) {
 return Object.freeze({status:'BLOCKED_NO_HANDOFF',reason,retryAllowed:false,
  writeAllowed:false,deliveryAllowed:false,requiresManualApproval:true});
}
function validSecret(secret) {
 return Buffer.isBuffer(secret) && secret.length>=32 && secret.length<=128;
}
function validatedReview(documentId,reviewStatus,reviewReason,issuedAtMs) {
 if(!SHA.test(documentId) ||
    ![STATUS.CURRENTLY_COMPLETE,STATUS.QUARANTINE].includes(reviewStatus) ||
    typeof reviewReason!=='string' ||
    !Number.isSafeInteger(issuedAtMs) || issuedAtMs<0)
  return false;
 const review={
  status:reviewStatus,reason:reviewReason,
  quarantineRecommended:reviewStatus!==STATUS.CURRENTLY_COMPLETE,
  deliveryAllowed:false,requiresManualApproval:true
 };
 try{
  const p=planQuarantine({
   draftId:documentId,review,reviewedAt:new Date(issuedAtMs).toISOString()
  });
  return p?.deliveryAllowed===false && p?.requiresManualApproval===true;
 }catch{return false;}
}
function sign(secret,payload) {
 return createHmac('sha256',secret).update(JSON.stringify(payload),'utf8').digest('base64url');
}
function buildHandoff({
 documentId,review,secret,issuedAtMs,nonce
}={}) {
 if(!validSecret(secret))throw Error('handoff_secret_invalid');
 if(!Number.isSafeInteger(issuedAtMs) || issuedAtMs<0 ||
    issuedAtMs>8640000000000000-LIMIT_MS ||
    !NONCE.test(nonce) ||
    !validatedReview(documentId,review?.status,review?.reason,issuedAtMs) ||
    review.deliveryAllowed!==false || review.requiresManualApproval!==true ||
    review.quarantineRecommended!==(review.status!==STATUS.CURRENTLY_COMPLETE))
  throw Error('handoff_source_evidence_invalid');
 const payload=Object.freeze({
  version:FORMAT,issuer:SOURCE,audience:DESTINATION,
  documentId,reviewStatus:review.status,reviewReason:review.reason,
  issuedAtMs,expiresAtMs:issuedAtMs+LIMIT_MS,nonce
 });
 return Object.freeze({payload,signature:sign(secret,payload)});
}
function makeHandoffForVerifiedDraft({
 draft,documentId,review,secret,nowMs=Date.now(),
 nonce=randomBytes(16).toString('hex')
}={}) {
 if(!exact(draft,['schemaVersion','eventType','recordId','state','testOnly',
   'deliveryEnabled','emailSent','createdAt']))
  throw Error('handoff_draft_invalid');
 let identity;
 try{identity=eventId(draft.recordId);}catch{throw Error('handoff_draft_invalid');}
 if(identity!==documentId || draft.schemaVersion!==1 ||
    draft.eventType!=='ONBOARDING_INPUT_PROCESSED_V1' ||
    draft.state!=='DRAFT_NOT_SENT' || draft.testOnly!==true ||
    draft.deliveryEnabled!==false || draft.emailSent!==false ||
    typeof draft.createdAt!=='string' ||
    !Number.isFinite(Date.parse(draft.createdAt)) ||
    new Date(draft.createdAt).toISOString()!==draft.createdAt)
  throw Error('handoff_draft_invalid');
 return buildHandoff({documentId,review,secret,issuedAtMs:nowMs,nonce});
}
function verifyHandoff({envelope,secret,nowMs=Date.now()}={}) {
 if(!validSecret(secret))return blocked('SECRET_NOT_CONFIGURED');
 if(!exact(envelope,WRAPPER_KEYS) || !exact(envelope.payload,CONTENT_KEYS) ||
    typeof envelope.signature!=='string' || !SIG.test(envelope.signature))
  return blocked('ENVELOPE_INVALID');
 const p=envelope.payload;
 if(p.version!==FORMAT || p.issuer!==SOURCE || p.audience!==DESTINATION ||
    typeof p.documentId!=='string' || !SHA.test(p.documentId) ||
    typeof p.nonce!=='string' || !NONCE.test(p.nonce) ||
    !Number.isSafeInteger(p.issuedAtMs) || !Number.isSafeInteger(p.expiresAtMs) ||
    p.issuedAtMs<0 || p.expiresAtMs-p.issuedAtMs!==LIMIT_MS ||
    !Number.isSafeInteger(nowMs) || nowMs<0)
  return blocked('ENVELOPE_INVALID');
 // Canonical order is a protocol requirement: signed JSON values are rebuilt
 // from the exact defined fields. Unknown fields have already been rejected.
 const canonical={};
 for(const k of CONTENT_KEYS)canonical[k]=p[k];
 const expected=Buffer.from(sign(secret,canonical),'ascii');
 const received=Buffer.from(envelope.signature,'ascii');
 if(!timingSafeEqual(expected,received))
  return blocked('SIGNATURE_INVALID');
 if(nowMs<p.issuedAtMs-ALLOWED_SKEW_MS || nowMs>p.expiresAtMs)
  return blocked('ENVELOPE_EXPIRED_OR_FUTURE');
 if(!validatedReview(p.documentId,p.reviewStatus,p.reviewReason,p.issuedAtMs))
  return blocked('REVIEW_INVALID');
 return Object.freeze({
  status:'AUTHENTICATED_REVIEW_NOT_PERSISTED',
  // These opaque values are internal to the recipient, not a response/log.
  documentId:p.documentId,nonce:p.nonce,
  review:Object.freeze({
   status:p.reviewStatus,reason:p.reviewReason,
   quarantineRecommended:p.reviewStatus!==STATUS.CURRENTLY_COMPLETE,
   deliveryAllowed:false,requiresManualApproval:true
  }),
  retryAllowed:false,writeAllowed:false,deliveryAllowed:false,
  requiresManualApproval:true
 });
}
// A *real* recipient must pass an atomic, DURABLE, exact destination-side
// claimOnce (not a process-local Set/Map). Claim collision, failure or
// uncertainty MUST stop. No claim store is instantiated by this module.
// Firestore create(exists:false) in a dedicated replay collection is a possible
// later separate approved solution; read/claim isn't implemented here.
async function validateAndClaimOnce({
 envelope,secret,nowMs=Date.now(),claimOnce
}={}) {
 const verified=verifyHandoff({envelope,secret,nowMs});
 if(verified.status!=='AUTHENTICATED_REVIEW_NOT_PERSISTED')return verified;
 if(typeof claimOnce!=='function')return blocked('DURABLE_REPLAY_CLAIM_NOT_CONFIGURED');
 const key=createHmac('sha256',secret).update(
  'lszh-handoff-replay:v1:'+verified.nonce,'utf8'
 ).digest('hex');
 try{
  const claimed=await claimOnce(key);
  if(claimed!==true)return blocked('REPLAY_OR_CLAIM_UNCERTAIN');
 }catch{return blocked('REPLAY_OR_CLAIM_UNCERTAIN');}
 return Object.freeze({
  ...verified,status:'REVIEW_CLAIMED_NOT_PERSISTED',
  replayClaimed:true,retryAllowed:false,writeAllowed:false,
  deliveryAllowed:false,requiresManualApproval:true
 });
}
module.exports=Object.freeze({
 buildHandoff,makeHandoffForVerifiedDraft,verifyHandoff,validateAndClaimOnce
});
