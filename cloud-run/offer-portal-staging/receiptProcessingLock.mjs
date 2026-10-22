// Inert single-writer reservation for synthetic receipt REVIEW, never a Drive
// upload permit. All decisions are pure; Firestore callers run in a transaction.
// Reservations NEVER expire into an automatic retry or second PDF creation.
import {inspectSyntheticReceiptRecovery} from './receiptRecoveryReview.mjs';

const SHA=/^[a-f0-9]{64}$/;
const ATTEMPT=/^TEST_ATTEMPT_[A-Za-z0-9_-]{12,64}$/;
const REVIEW_MS=15*60*1000;
const PURPOSE='LSZH_SYNTHETIC_SINGLE_WRITER_REVIEW_ONLY';
const DOWNSTREAM={airtable:'disabled',proofPdf:'disabled',email:'disabled'};
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
const sameKeys=(obj,keys)=>obj && typeof obj==='object' && !Array.isArray(obj) &&
  Object.getPrototypeOf(obj)===Object.prototype &&
  Object.keys(obj).sort().join('|')===keys.slice().sort().join('|');

const response=(code,patch=null)=>({
  code,
  ...(patch?{patch}:{}),
  canGenerateProof:false,canUpload:false,
  canWriteAirtable:false,canSendEmail:false,
  requiresManualReview:true
});

function validSavedLock(lock,key,acceptedAt){
  if(!sameKeys(lock,['schemaVersion','purpose','state','attemptId',
    'idempotencyKey','createdAt','reviewDeadlineAt','downstream']) ||
    lock.schemaVersion!==1||lock.purpose!==PURPOSE||
    lock.state!=='HELD_FOR_REVIEW'||
    !ATTEMPT.test(lock.attemptId||'')||lock.idempotencyKey!==key||
    !sameKeys(lock.downstream,['airtable','proofPdf','email'])||
    Object.keys(DOWNSTREAM).some(k=>lock.downstream[k]!==DOWNSTREAM[k]))
    return false;
  const started=Date.parse(lock.createdAt),deadline=Date.parse(lock.reviewDeadlineAt);
  return Number.isFinite(started)&&Number.isFinite(deadline)&&
    started>=Date.parse(acceptedAt)&&deadline-started===REVIEW_MS &&
    lock.createdAt===new Date(started).toISOString()&&
    lock.reviewDeadlineAt===new Date(deadline).toISOString();
}

// Only this pure function is used inside a Firestore transaction.
// Never call external APIs inside transaction callbacks: Firestore may retry.
export function decideSyntheticReceiptReviewLock(acceptedOffer,{
  expectedReviewKey,attemptId,now
}={}){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    !SHA.test(expectedReviewKey||'')||!ATTEMPT.test(attemptId||'')||
    inspectSyntheticReceiptRecovery(acceptedOffer).status!=='REVIEW_ONLY'||
    acceptedOffer.receiptReview.idempotencyKey!==expectedReviewKey||
    now.getTime()<Date.parse(acceptedOffer.acceptedAt))
    return response('NO_GO_INVALID_SYNTHETIC_REVIEW');

  if(own(acceptedOffer,'receiptReviewLock')){
    const saved=acceptedOffer.receiptReviewLock;
    if(!validSavedLock(saved,expectedReviewKey,acceptedOffer.acceptedAt))
      return response('NO_GO_LOCK_STATE_INVALID');
    if(now.getTime()>=Date.parse(saved.reviewDeadlineAt))
      return response('MANUAL_RECONCILIATION_REQUIRED');
    return response(saved.attemptId===attemptId?
      'ALREADY_RESERVED_REVIEW_ONLY':'LOCKED_BY_OTHER_ATTEMPT');
  }

  const createdAt=now.toISOString();
  const reviewDeadlineAt=new Date(now.getTime()+REVIEW_MS).toISOString();
  return response('RESERVED_REVIEW_ONLY',{
    receiptReviewLock:{
      schemaVersion:1,purpose:PURPOSE,state:'HELD_FOR_REVIEW',
      attemptId,idempotencyKey:expectedReviewKey,createdAt,reviewDeadlineAt,
      downstream:{...DOWNSTREAM}
    }
  });
}
