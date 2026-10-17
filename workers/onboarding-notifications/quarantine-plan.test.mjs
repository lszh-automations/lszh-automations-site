import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {planQuarantine,STATES}=require('./quarantine-plan');
const {STATUS}=require('./draft-review-gate');
const {eventId}=require('./outbox');

const DRAFT_ID=eventId('rec'+'A'.repeat(14));
const OTHER_ID=eventId('rec'+'B'.repeat(14));
const complete={status:STATUS.CURRENTLY_COMPLETE,reason:'FRESH_COMPLETE_EVIDENCE',
 quarantineRecommended:false,deliveryAllowed:false,requiresManualApproval:true};
const pending={status:STATUS.QUARANTINE,reason:'ONBOARDING_NOT_COMPLETE',
 quarantineRecommended:true,deliveryAllowed:false,requiresManualApproval:true};
const ambiguous={status:STATUS.QUARANTINE,reason:'AMBIGUOUS_ONBOARDING_STATE',
 quarantineRecommended:true,deliveryAllowed:false,requiresManualApproval:true};
const unavailable={status:STATUS.UNAVAILABLE,reason:'STATUS_CHECK_FAILED',
 quarantineRecommended:true,deliveryAllowed:false,requiresManualApproval:true};
const invalid={status:STATUS.INVALID,reason:'INVALID_STORED_DRAFT',
 quarantineRecommended:true,deliveryAllowed:false,requiresManualApproval:true};
function plan(review,previous=null,expectedRevision=previous?.revision??0,extra={}) {
 return planQuarantine({draftId:DRAFT_ID,review,previous,expectedRevision,...extra});
}
function safe(x) {
 assert.equal(x.deliveryAllowed,false);
 assert.equal(x.requiresManualApproval,true);
 assert.equal(x.record.deliveryAllowed,false);
 assert.equal(x.record.requiresManualApproval,true);
 assert.equal(Object.isFrozen(x),true);
 assert.equal(Object.isFrozen(x.record),true);
 assert.equal(Object.isFrozen(x.record.events),true);
 assert.ok(x.record.events.every(Object.isFrozen));
 assert.ok(!('send' in x) && !('recipient' in x) && !('approvalToken' in x));
}
test('complete review creates manual-only audit without any send capability',()=>{
 const x=plan(complete,null,0,{reviewedAt:'2026-10-17T11:00:00.000Z'});
 assert.equal(x.outcome,'created');
 assert.equal(x.expectedRevision,0);
 assert.equal(x.record.revision,1);
 assert.equal(x.record.state,STATES.REVIEW);
 assert.deepEqual(x.record.events,[{
  seq:1,status:complete.status,reason:complete.reason,resultingState:STATES.REVIEW,
  reviewedAt:'2026-10-17T11:00:00.000Z'
 }]);
 safe(x);
});
test('quarantine remains sticky after successful revalidation and repeated attempts',()=>{
 const first=plan(pending);
 assert.equal(first.record.state,STATES.QUARANTINED);
 const repeat=plan(pending,first.record);
 assert.equal(repeat.outcome,'unchanged');
 assert.strictEqual(repeat.record,first.record);
 const after=plan(complete,repeat.record);
 assert.equal(after.outcome,'updated');
 assert.equal(after.record.state,STATES.QUARANTINED);
 assert.equal(after.record.revision,2);
 assert.equal(after.record.events[0].reason,'ONBOARDING_NOT_COMPLETE');
 assert.equal(after.record.events[1].reason,'FRESH_COMPLETE_EVIDENCE');
 assert.equal(after.record.deliveryAllowed,false);
 safe(after);
});
test('unavailable review sets hold, recovery never clears hold automatically',()=>{
 const first=plan(unavailable);
 assert.equal(first.record.state,STATES.HOLD);
 const second=plan(complete,first.record);
 assert.equal(second.record.state,STATES.HOLD);
 const third=plan(ambiguous,second.record);
 assert.equal(third.record.state,STATES.QUARANTINED);
 const fourth=plan(unavailable,third.record);
 assert.equal(fourth.record.state,STATES.QUARANTINED);
 const fifth=plan(invalid,fourth.record);
 assert.equal(fifth.record.state,STATES.QUARANTINED);
 for(const x of [first,second,third,fourth,fifth])safe(x);
});
test('event version controls stale parallel actors; only a CAS persistence adapter can commit one',()=>{
 const baseline=plan(complete).record;
 const actor1=plan(pending,baseline,1);
 const actor2=plan(ambiguous,baseline,1);
 assert.equal(actor1.expectedRevision,1);
 assert.equal(actor2.expectedRevision,1);
 let saved=baseline;
 // Offline simulation of a compare-and-swap transaction, NOT real Firestore.
 function simulatedAtomicCAS(proposal) {
  if(saved.revision!==proposal.expectedRevision)return false;
  saved=proposal.record;return true;
 }
 assert.equal(simulatedAtomicCAS(actor1),true);
 assert.equal(simulatedAtomicCAS(actor2),false);
 assert.equal(saved.revision,2);
 assert.equal(saved.lastReason,'ONBOARDING_NOT_COMPLETE');
 assert.throws(()=>plan(ambiguous,saved,1),/stale_quarantine_revision/);
 const refreshed=plan(ambiguous,saved,2);
 assert.equal(simulatedAtomicCAS(refreshed),true);
 assert.equal(saved.revision,3);
 safe(refreshed);
});
test('different draft identity, modified audit or delivery flags are rejected',()=>{
 const original=plan(complete).record;
 for(const previous of [
  {...original,draftId:OTHER_ID},
  {...original,revision:99},
  {...original,deliveryAllowed:true},
  {...original,requiresManualApproval:false},
  {...original,state:STATES.QUARANTINED},
  {...original,events:[{...original.events[0],seq:42}]},
  {...original,events:[{...original.events[0],reason:'PRIVATE_PII'}]},
  {...original,events:[{...original.events[0],reviewedAt:'not-a-date'}]},
  {...original,recipient:'someone@example.invalid'}
 ]){
  assert.throws(()=>plan(pending,previous,previous.revision),/invalid_existing_quarantine_case/);
 }
 assert.throws(()=>plan(pending,original,0),/stale_quarantine_revision/);
});
test('no untrusted review results, typed IDs or leaked exception strings in audit',()=>{
 const threats=[
  {...complete,deliveryAllowed:true},{...complete,requiresManualApproval:false},
  {...complete,quarantineRecommended:true},
  {...pending,status:'QUARANTINE_RECEIVED',reason:'PRIVATE_EMAIL'},
  {...pending,reason:'Bearer pat_SUPERSECRET'},
  {...unavailable,status:'constructor'},
  {},null,undefined,[]
 ];
 for(const review of threats) {
  assert.throws(()=>plan(review),/unsafe_review_result/);
 }
 for(const draftId of ['ob_00000000-0000-4000-8000-000000000000',
   OTHER_ID.toUpperCase(),123,null,'a'.repeat(64)+'suffix']){
  assert.throws(()=>plan(pending,null,0,{draftId}),/invalid_quarantine_draft_id/);
 }
 const x=plan(pending);
 assert.ok(!JSON.stringify(x).includes('recAAAA'));
 assert.ok(!JSON.stringify(x).includes('@'));
 assert.ok(!JSON.stringify(x).includes('pat_'));
});
test('audit limit stops without truncating existing evidence or reducing quarantine level',()=>{
 let current=plan(pending).record;
 for(let n=1;n<32;n++){
  // Alternate fresh review codes so each append represents new evidence.
  const next=n%2===1?complete:pending;
  current=plan(next,current).record;
 }
 assert.equal(current.events.length,32);
 assert.equal(current.revision,32);
 assert.equal(current.state,STATES.QUARANTINED);
 assert.throws(()=>plan(ambiguous,current),/quarantine_audit_limit_requires_manual_review/);
 const unchanged=plan(complete,current);
 assert.equal(unchanged.record.revision,32);
 assert.equal(unchanged.record.state,STATES.QUARANTINED);
});

test('audit timestamps must be strict UTC, chronological and never leak arbitrary metadata',()=>{
 const start='2026-10-17T10:00:00.000Z';
 const first=plan(complete,null,0,{reviewedAt:start});
 assert.equal(first.record.events[0].reviewedAt,start);
 assert.throws(()=>plan(pending,first.record,1,{reviewedAt:'2026-10-17T09:59:59.999Z'}),
  /quarantine_time_regression/);
 for(const reviewedAt of ['2026-10-17T12:00:00+02:00','invalid','2026-13-77T00:00:00.000Z',0]){
  assert.throws(()=>plan(pending,first.record,1,{reviewedAt}),/invalid_quarantine_review_time/);
 }
 const next=plan(pending,first.record,1,{reviewedAt:start});
 assert.equal(next.record.revision,2);
 assert.equal(next.record.state,STATES.QUARANTINED);
 safe(next);
});
