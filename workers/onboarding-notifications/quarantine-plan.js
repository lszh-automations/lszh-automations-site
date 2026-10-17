'use strict';
// Pure quarantine state planning. No Firestore connector, HTTP endpoint, delivery,
// mail client, permissions, or state mutation. All changes require a future
// reviewed atomic compare-and-swap persistence adapter and explicit approval.
const {STATUS}=require('./draft-review-gate');

const CASE_SCHEMA=1;
const RECORD=/^[0-9a-f]{64}$/;
const STATES=Object.freeze({
 REVIEW:'MANUAL_REVIEW_ONLY',
 HOLD:'HOLD_REVALIDATION_UNAVAILABLE',
 QUARANTINED:'QUARANTINED_REQUIRES_MANUAL_RESOLUTION'
});
const REASONS=Object.freeze({
 [STATUS.CURRENTLY_COMPLETE]:['FRESH_COMPLETE_EVIDENCE'],
 [STATUS.QUARANTINE]:[
  'RECORD_ID_MISMATCH','AMBIGUOUS_ONBOARDING_STATE','ONBOARDING_NOT_COMPLETE'
 ],
 [STATUS.INVALID]:['INVALID_STORED_DRAFT'],
 [STATUS.UNAVAILABLE]:[
  'MISSING_VERIFICATION_INPUT','STATUS_CHECK_FAILED','UNKNOWN_ONBOARDING_STATE'
 ]
});
const RANK={[STATES.REVIEW]:0,[STATES.HOLD]:1,[STATES.QUARANTINED]:2};
const EXACT_CASE_KEYS=[
 'schemaVersion','draftId','revision','state','lastReviewStatus',
 'lastReason','events','deliveryAllowed','requiresManualApproval'
];

function permittedReview(review) {
 if(!review || typeof review!=='object' || Array.isArray(review))return false;
 if(typeof review.status!=='string' || !Object.hasOwn(REASONS,review.status))return false;
 const allowed=REASONS[review.status];
 if(!allowed || !allowed.includes(review.reason))return false;
 return review.deliveryAllowed===false && review.requiresManualApproval===true &&
        review.quarantineRecommended===(review.status!==STATUS.CURRENTLY_COMPLETE);
}
function target(review) {
 if(review.status===STATUS.CURRENTLY_COMPLETE)return STATES.REVIEW;
 if(review.status===STATUS.UNAVAILABLE)return STATES.HOLD;
 return STATES.QUARANTINED;
}
function validCase(record,draftId) {
 if(!record || typeof record!=='object' || Array.isArray(record) ||
    Object.keys(record).length!==EXACT_CASE_KEYS.length ||
    !EXACT_CASE_KEYS.every(k=>Object.hasOwn(record,k)) ||
    record.schemaVersion!==CASE_SCHEMA || record.draftId!==draftId ||
    !Number.isSafeInteger(record.revision) || record.revision<1 ||
    !Object.hasOwn(RANK,record.state) ||
    record.deliveryAllowed!==false || record.requiresManualApproval!==true ||
    !Array.isArray(record.events) || record.events.length!==record.revision ||
    record.events.length>32)return false;
 const last=record.events.at(-1);
 if(!last || last.status!==record.lastReviewStatus ||
    last.reason!==record.lastReason ||
    last.resultingState!==record.state)return false;
 return record.events.every((e,i)=>{
  if(!e || typeof e!=='object' || Array.isArray(e) ||
     Object.keys(e).length!==4 || !['seq','status','reason','resultingState'].every(k=>Object.hasOwn(e,k)) ||
     e.seq!==i+1 || !Object.hasOwn(RANK,e.resultingState))return false;
  const reasons=REASONS[e.status];
  if(!reasons || !reasons.includes(e.reason))return false;
  if(i>0 && RANK[e.resultingState]<RANK[record.events[i-1].resultingState])return false;
  const prior=i?record.events[i-1].resultingState:STATES.REVIEW;
  return e.resultingState === (RANK[target({status:e.status})]>RANK[prior]
    ? target({status:e.status}) : prior);
 });
}
function immutable(record) {
 record.events.forEach(Object.freeze);
 Object.freeze(record.events);
 return Object.freeze(record);
}

/**
 * Calculate a CAS proposal, NEVER execute it. Only opaque draft IDs and
 * allowlisted review codes enter the audit trail; no PII, tokens or raw errors.
 * The returned next state is not a transaction: any future persistence MUST
 * compare the stored revision atomically and never use a blind overwrite.
 */
function planQuarantine({draftId,review,previous=null,expectedRevision=0}={}) {
 if(typeof draftId!=='string' || !RECORD.test(draftId))
  throw Error('invalid_quarantine_draft_id');
 if(!permittedReview(review))throw Error('unsafe_review_result');
 if(previous===null) {
  if(expectedRevision!==0)throw Error('stale_quarantine_revision');
 }else {
  if(!validCase(previous,draftId))throw Error('invalid_existing_quarantine_case');
  if(expectedRevision!==previous.revision)throw Error('stale_quarantine_revision');
 }
 const priorState=previous?.state??STATES.REVIEW;
 const proposed=target(review);
 const state=RANK[proposed]>RANK[priorState]?proposed:priorState;
 const repeated=previous && previous.state===state &&
   previous.lastReviewStatus===review.status && previous.lastReason===review.reason;
 if(repeated) return Object.freeze({
  outcome:'unchanged',expectedRevision,record:previous,
  deliveryAllowed:false,requiresManualApproval:true
 });
 const rev=expectedRevision+1;
 if(rev>32)throw Error('quarantine_audit_limit_requires_manual_review');
 const events=[
  ...(previous?.events??[]),
  {seq:rev,status:review.status,reason:review.reason,resultingState:state}
 ];
 const record=immutable({
  schemaVersion:CASE_SCHEMA,draftId,revision:rev,state,
  lastReviewStatus:review.status,lastReason:review.reason,
  events,deliveryAllowed:false,requiresManualApproval:true
 });
 return Object.freeze({
  outcome:previous?'updated':'created',
  expectedRevision,record,deliveryAllowed:false,requiresManualApproval:true
 });
}
module.exports={planQuarantine,STATES};
