'use strict';

// Read-only, offline-testable review for existing UNSENT notification drafts.
// An earlier completed state is not a delivery authorization.
// NO Firestore writes, transport, recipient resolution, approvals or mail APIs.
const {verifyOnboardingState}=require('../../onboarding/confirmation');
const {eventId, TYPE}=require('./outbox');

const VALID_RECORD=/^rec[A-Za-z0-9]{14}$/;
const VALID_CODE=/^ob_[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/;
const DRAFT_FIELDS=[
  'schemaVersion','eventType','recordId','state',
  'testOnly','deliveryEnabled','emailSent','createdAt'
];
const STATUS=Object.freeze({
  CURRENTLY_COMPLETE:'CURRENTLY_COMPLETE_MANUAL_REVIEW_ONLY',
  QUARANTINE:'QUARANTINE_RECOMMENDED',
  INVALID:'INVALID_DRAFT_QUARANTINE_RECOMMENDED',
  UNAVAILABLE:'REVALIDATION_UNAVAILABLE_HOLD'
});

function outcome(status, reason, quarantineRecommended) {
  // Never produce a "ready to send" object, approval token, recipient or
  // positive delivery permission, even when current Airtable state is complete.
  return Object.freeze({
    status, reason, quarantineRecommended,
    deliveryAllowed:false, requiresManualApproval:true
  });
}
function validDraft(draft, documentId) {
  if(!draft || typeof draft!=='object' || Array.isArray(draft) ||
      typeof draft.recordId!=='string' || !VALID_RECORD.test(draft.recordId) ||
      typeof documentId!=='string' || eventId(draft.recordId)!==documentId ||
      Object.keys(draft).length!==DRAFT_FIELDS.length ||
      !DRAFT_FIELDS.every(field=>Object.prototype.hasOwnProperty.call(draft,field)) ||
      draft.schemaVersion!==1 || draft.eventType!==TYPE ||
      draft.state!=='DRAFT_NOT_SENT' ||
      draft.testOnly!==true || draft.deliveryEnabled!==false ||
      draft.emailSent!==false ||
      typeof draft.createdAt!=='string')return false;
  const parsed=new Date(draft.createdAt);
  return !Number.isNaN(parsed.valueOf()) &&
         parsed.toISOString()===draft.createdAt;
}

// projectCode is a transient bearer credential, never stored in the draft.
// No sender exists in this module. A review result MUST NOT be used as a
// transferable send capability: state can change between review and delivery.
async function reviewDraft({draft,documentId,projectCode,readToken,fetchImpl=fetch}={}) {
  if(!validDraft(draft,documentId))
    return outcome(STATUS.INVALID,'INVALID_STORED_DRAFT',true);
  if(typeof projectCode!=='string' || !VALID_CODE.test(projectCode) ||
     typeof readToken!=='string' || !readToken)
    return outcome(STATUS.UNAVAILABLE,'MISSING_VERIFICATION_INPUT',true);

  let current;
  try {
    current=await verifyOnboardingState(projectCode,readToken,fetchImpl);
  } catch {
    // Airtable timeouts, errors, malformed responses and missing scopes are
    // never mistaken for completion. No raw error/request/token is returned.
    return outcome(STATUS.UNAVAILABLE,'STATUS_CHECK_FAILED',true);
  }
  if(current?.state==='completed') {
    if(current.recordId===draft.recordId)
      return outcome(STATUS.CURRENTLY_COMPLETE,'FRESH_COMPLETE_EVIDENCE',false);
    return outcome(STATUS.QUARANTINE,'RECORD_ID_MISMATCH',true);
  }
  if(current?.state==='requires_review')
    return outcome(STATUS.QUARANTINE,'AMBIGUOUS_ONBOARDING_STATE',true);
  if(current?.state==='processing')
    return outcome(STATUS.QUARANTINE,'ONBOARDING_NOT_COMPLETE',true);
  return outcome(STATUS.UNAVAILABLE,'UNKNOWN_ONBOARDING_STATE',true);
}
module.exports={reviewDraft,STATUS};
