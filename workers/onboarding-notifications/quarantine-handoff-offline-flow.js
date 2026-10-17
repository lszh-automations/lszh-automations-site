'use strict';
// No executable transport or server route. Existing source and destination
// metadata-identity-bound GET readers, source Airtable revalidation, signed
// short-lived opaque attestation, fail-closed replay claim and destination
// CAS proposal are wired *only in this offline/test-only library*.
// No Firestore commit, no SMTP, no Cloud Run invocation/host configuration.
const {listCandidateCodes}=require('./airtable-candidates');
const {reviewDraft,STATUS}=require('./draft-review-gate');
const {createScopedReader}=require('./firestore-scoped-readers');
const {prepareQuarantineCAS}=require('./quarantine-cas-offline-cycle');
const {
 makeHandoffForVerifiedDraft,validateAndClaimOnce
}=require('./quarantine-handoff-protocol');

const ID=/^[0-9a-f]{64}$/;
function stop(reason) {
 return Object.freeze({status:'BLOCKED_NO_TRANSPORT',reason,
  writesAllowed:false,deliveryAllowed:false,retryAllowed:false,
  requiresManualApproval:true});
}
function result(status,detail={}) {
 return Object.freeze({...detail,status,writesAllowed:false,
  deliveryAllowed:false,retryAllowed:false,requiresManualApproval:true});
}
async function prepareSourceHandoff({
 documentId,projectCode,fixtureAllowlist,readToken,
 secret,sourceEnv,sourceFirestoreFetch,airtableFetch,
 nowMs=Date.now(),nonce
}={}) {
 if(typeof documentId!=='string' || !ID.test(documentId))
  return stop('DOCUMENT_ID_INVALID');
 try{
  if(!listCandidateCodes(fixtureAllowlist).includes(projectCode))
   return stop('FIXTURE_NOT_APPROVED');
 }catch{return stop('FIXTURE_ALLOWLIST_INVALID');}
 if(typeof readToken!=='string' || readToken.length<1 ||
    typeof airtableFetch!=='function' ||
    typeof sourceFirestoreFetch!=='function')
  return stop('SOURCE_TRANSPORT_NOT_CONFIGURED');
 let source;
 try{
  // Does not permit a caller-supplied unverified draft as source evidence.
  const reader=createScopedReader({
   scope:'outbox',env:sourceEnv,fetchImpl:sourceFirestoreFetch
  });
  source=await reader.read(documentId);
 }catch{return stop('SOURCE_READ_NOT_VERIFIED');}
 if(source?.status!=='VERIFIED_DRAFT' || !source.draft)
  return stop('SOURCE_READ_NOT_VERIFIED');
 let review;
 try{
  review=await reviewDraft({draft:source.draft,
   documentId,projectCode,readToken,fetchImpl:airtableFetch});
 }catch{return stop('SOURCE_REVALIDATION_FAILED');}
 if(review.status===STATUS.UNAVAILABLE)
  return result('HOLD_NO_TRANSPORT',{reason:'CURRENT_STATUS_UNAVAILABLE'});
 if(review.status===STATUS.INVALID)return stop('DRAFT_INVALID');
 if(review.status!==STATUS.CURRENTLY_COMPLETE &&
    review.status!==STATUS.QUARANTINE)
  return stop('REVIEW_UNEXPECTED');
 try {
  const envelope=makeHandoffForVerifiedDraft({
   draft:source.draft,documentId,review,secret,nowMs,nonce
  });
  return result('SIGNED_NOT_SENT',{envelope});
 }catch{return stop('ATTESTATION_NOT_CREATED');}
}
async function inspectDestinationHandoff({
 envelope,secret,nowMs=Date.now(),claimOnce,
 destinationEnv,destinationFirestoreFetch
}={}) {
 const verified=await validateAndClaimOnce({
  envelope,secret,nowMs,claimOnce
 });
 if(verified.status!=='REVIEW_CLAIMED_NOT_PERSISTED')
  return stop(verified.reason||'ATTESTATION_NOT_CLAIMED');
 if(typeof destinationFirestoreFetch!=='function')
  return stop('DESTINATION_TRANSPORT_NOT_CONFIGURED');
 let dest;
 try{
  const reader=createScopedReader({scope:'quarantine',
   env:destinationEnv,fetchImpl:destinationFirestoreFetch
  });
  dest=await reader.read(verified.documentId);
 }catch{return stop('DESTINATION_READ_NOT_VERIFIED');}
 if(![200,404].includes(dest?.readStatus))
  return stop('DESTINATION_READ_NOT_VERIFIED');
 const prepared=prepareQuarantineCAS({
  draftId:verified.documentId,review:verified.review,
  readStatus:dest.readStatus,document:dest.document,
  reviewedAt:new Date(nowMs).toISOString()
 });
 if(prepared.status==='BLOCKED_NO_RETRY')
  return stop('CAS_'+prepared.reason);
 if(prepared.status==='NO_CHANGE')
  return result('NO_CHANGE',{revision:prepared.revision});
 if(prepared.status!=='READY_TO_COMMIT_ONCE' ||
    prepared.proposal?.deliveryAllowed!==false)
  return stop('CAS_PLAN_UNSAFE');
 return result('OFFLINE_CAS_REVIEW_REQUIRED',{
  operation:prepared.proposal.outcome,
  expectedRevision:prepared.proposal.expectedRevision,
  proposedRevision:prepared.proposal.record.revision,
  quarantineState:prepared.proposal.record.state
 });
}
module.exports=Object.freeze({prepareSourceHandoff,inspectDestinationHandoff});
