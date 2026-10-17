'use strict';
// Offline integration boundary: existing unsent outbox draft -> current Airtable
// review (read only) -> quarantine CAS planner (pure calculation). No Firestore
// transport, credentials minting, POST, email, Cloud Run route or deployment.
// Return only a non-executable summary; never expose POST payload or secrets.
const {listCandidateCodes}=require('./airtable-candidates');
const {reviewDraft,STATUS}=require('./draft-review-gate');
const {prepareQuarantineCAS}=require('./quarantine-cas-offline-cycle');
const {eventId}=require('./outbox');

const ID=/^[0-9a-f]{64}$/;
function stop(reason) {
 return Object.freeze({status:'BLOCKED_NO_PERSISTENCE',
  reason,retryAllowed:false,deliveryAllowed:false,
  requiresManualApproval:true,networkWriteAllowed:false});
}
function summary(status,details={}) {
 return Object.freeze({status,...details,retryAllowed:false,
  deliveryAllowed:false,requiresManualApproval:true,networkWriteAllowed:false});
}
/**
 * Only STAGING synthetic candidates selected by the existing fixture allowlist.
 * Airtable is verified by the EXISTING reviewDraft() read-only function.
 * Caller supplies a previously observed Firestore GET result for CAS planning;
 * no proof of that GET is implied and no write request is returned.
 * Future live execution will require separately reviewed, explicit storage adapter.
 */
async function reviewOnboardingForQuarantine({
 draft,documentId,projectCode,fixtureAllowlist,readToken,
 airtableFetchImpl,firestoreReadStatus,firestoreDocument=null,reviewedAt
}={}) {
 if(typeof documentId!=='string' || !ID.test(documentId) ||
    typeof draft?.recordId!=='string')
  return stop('DRAFT_ID_INVALID');
 try {
  if(eventId(draft.recordId)!==documentId)
   return stop('DRAFT_ID_MISMATCH');
 }catch{return stop('DRAFT_ID_INVALID');}
 let fixtures;
 try {fixtures=listCandidateCodes(fixtureAllowlist);}
 catch {return stop('FIXTURE_ALLOWLIST_INVALID');}
 if(typeof projectCode!=='string' || !fixtures.includes(projectCode))
  return stop('FIXTURE_NOT_APPROVED');
 if(typeof readToken!=='string' || !readToken ||
    typeof airtableFetchImpl!=='function')
  return stop('REVIEW_TRANSPORT_DISABLED');
 let review;
 try {
  review=await reviewDraft({
   draft,documentId,projectCode,readToken,fetchImpl:airtableFetchImpl
  });
 }catch {return stop('REVIEW_UNAVAILABLE');}
 // Even if status evidence is "completed" it cannot approve delivery.
 // Broken stored drafts and unavailable Airtable observations never plan writes.
 if(review.status===STATUS.INVALID)return stop('UNSAFE_STORED_DRAFT');
 if(review.status===STATUS.UNAVAILABLE)
  return summary('HOLD_NO_PERSISTENCE',{reason:review.reason});
 if(review.status!==STATUS.CURRENTLY_COMPLETE &&
    review.status!==STATUS.QUARANTINE)
  return stop('REVIEW_UNEXPECTED');
 const prepared=prepareQuarantineCAS({
  draftId:documentId,review,reviewedAt,
  readStatus:firestoreReadStatus,document:firestoreDocument
 });
 if(prepared.status==='BLOCKED_NO_RETRY')
  return stop('CAS_'+prepared.reason);
 if(prepared.status==='NO_CHANGE')
  return summary('NO_CHANGE',{revision:prepared.revision});
 if(prepared.status!=='READY_TO_COMMIT_ONCE' ||
    prepared.proposal?.deliveryAllowed!==false ||
    prepared.proposal?.requiresManualApproval!==true)
  return stop('CAS_PLAN_UNSAFE');
 // DO NOT return prepared.request, .proposal, payload, Firestore document
 // path, Airtable IDs, project code or readToken. These are control-plane facts
 // for a future separately authorised adapter, not an executable write.
 return summary('OFFLINE_CAS_REVIEW_REQUIRED',{
  operation:prepared.proposal.outcome,
  expectedRevision:prepared.proposal.expectedRevision,
  proposedRevision:prepared.proposal.record.revision,
  quarantineState:prepared.proposal.record.state
 });
}
module.exports=Object.freeze({reviewOnboardingForQuarantine});
