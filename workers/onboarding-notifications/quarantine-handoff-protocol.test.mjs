import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {buildHandoff,makeHandoffForVerifiedDraft,verifyHandoff,validateAndClaimOnce}=
 require('./quarantine-handoff-protocol');
const {makeDraft,eventId}=require('./outbox');
const {STATUS}=require('./draft-review-gate');

const secret=Buffer.alloc(32,0xa3);
const incorrect=Buffer.alloc(32,0xb4);
const docId=eventId('rec'+'A'.repeat(14));
const draft=makeDraft('rec'+'A'.repeat(14),new Date('2026-10-17T13:00:00.000Z'));
const now=Date.parse('2026-10-17T15:00:00.000Z');
const nonce='2'.repeat(32);
const ok=Object.freeze({
 status:STATUS.CURRENTLY_COMPLETE,reason:'FRESH_COMPLETE_EVIDENCE',
 quarantineRecommended:false,deliveryAllowed:false,requiresManualApproval:true
});
const hold=Object.freeze({
 status:STATUS.QUARANTINE,reason:'AMBIGUOUS_ONBOARDING_STATE',
 quarantineRecommended:true,deliveryAllowed:false,requiresManualApproval:true
});
const signed=(review=ok,extra={})=>makeHandoffForVerifiedDraft({
 draft,documentId:docId,review,secret,nowMs:now,nonce,...extra
});
const asVerified=(envelope,options={})=>verifyHandoff({
 envelope,secret,nowMs:now+3000,...options
});
function safe(result){
 assert.equal(result.retryAllowed,false);
 assert.equal(result.writeAllowed,false);
 assert.equal(result.deliveryAllowed,false);
 assert.equal(result.requiresManualApproval,true);
 assert.equal(Object.isFrozen(result),true);
 assert.equal('token' in result,false);
 assert.equal('projectCode' in result,false);
 assert.equal('commit' in result,false);
 assert.equal('send' in result,false);
}
test('fresh source attestation signs only an opaque document ID, exact review reason and 2-minute timestamp',()=>{
 const envelope=signed();
 assert.equal(envelope.payload.documentId,docId);
 assert.equal(envelope.payload.issuer,'lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com');
 assert.equal(envelope.payload.audience,'lszh-quarantine-handoff-staging');
 assert.equal(envelope.payload.expiresAtMs-envelope.payload.issuedAtMs,120000);
 assert.ok(Object.isFrozen(envelope));
 assert.ok(Object.isFrozen(envelope.payload));
 assert.match(envelope.signature,/^[A-Za-z0-9_-]{43}$/);
 const text=JSON.stringify(envelope);
 for(const secretValue of ['recAAAAAAAAAAAAAA','ob_','@example.invalid','Bearer','recipient','createdAt','emailSent','Rechnungs-','/documents:commit','pat_']){
  assert.equal(text.includes(secretValue),false,secretValue);
 }
 const checked=asVerified(envelope);
 assert.equal(checked.status,'AUTHENTICATED_REVIEW_NOT_PERSISTED');
 assert.equal(checked.documentId,docId);
 assert.equal(checked.review.status,STATUS.CURRENTLY_COMPLETE);
 assert.equal(checked.review.reason,'FRESH_COMPLETE_EVIDENCE');
 safe(checked);
});
test('processing/conflicting source review can only sign sticky quarantine and never authorize delivery',()=>{
 const e=signed(hold);
 const check=asVerified(e);
 assert.equal(check.status,'AUTHENTICATED_REVIEW_NOT_PERSISTED');
 assert.equal(check.review.quarantineRecommended,true);
 assert.equal(check.review.reason,'AMBIGUOUS_ONBOARDING_STATE');
 safe(check);
});
test('HMAC modification of revision/status, ID, time, audience or nonce is refused',()=>{
 const e=signed();
 const tamper=[
  {documentId:'a'.repeat(64)},
  {reviewReason:'ONBOARDING_NOT_COMPLETE'},
  {reviewStatus:STATUS.QUARANTINE},
  {issuer:'unknown'},
  {audience:'lszh-offers-staging'},
  {issuedAtMs:now-60000},
  {expiresAtMs:now+500000},
  {nonce:'e'.repeat(32)}
 ];
 for(const v of tamper){
  const r=asVerified({...e,payload:{...e.payload,...v}});
  assert.equal(r.status,'BLOCKED_NO_HANDOFF',JSON.stringify(v));
  safe(r);
 }
});
test('unapproved status/reason, tainted draft, malformed ID and weak secret rejected before signature',()=>{
 for(const review of [
  {...ok,deliveryAllowed:true},
  {...ok,reason:'RECORD_ID_MISMATCH'},
  {...hold,quarantineRecommended:false},
  {...hold,reason:'synthetic@example.invalid'},
  {status:STATUS.UNAVAILABLE,reason:'STATUS_CHECK_FAILED',
   quarantineRecommended:true,deliveryAllowed:false,requiresManualApproval:true},
 ]){
  assert.throws(()=>signed(review),/handoff_source_evidence_invalid/);
 }
 for(const unsafe of [
  {...draft,emailSent:true},
  {...draft,recordId:'rec'+'Z'.repeat(14)},
  {...draft,createdAt:'yesterday'},
  {...draft,recipient:'synthetic@example.invalid'}
 ])assert.throws(()=>makeHandoffForVerifiedDraft({
  draft:unsafe,documentId:docId,review:ok,secret,nowMs:now,nonce
 }),/handoff_draft_invalid/);
 assert.throws(()=>signed(ok,{documentId:'../wrong'}),/handoff_draft_invalid/);
 assert.throws(()=>signed(ok,{secret:Buffer.from('short')}),/handoff_secret_invalid/);
});
test('expired, far-future, wrong-secret and malformed envelopes block deterministically',()=>{
 const e=signed();
 for(const [envelope,opt] of [
  [e,{nowMs:now+120001}],
  [e,{nowMs:now-10001}],
  [e,{secret:incorrect}],
  [e,{secret:null}],
  [{...e,unknown:true},{}],
  [{...e,signature:'invalid'},{}],
  [{...e,payload:{...e.payload,recipient:'synthetic@example.invalid'}},{}],
  [null,{}]
 ]){
  const r=asVerified(envelope,opt);
  assert.equal(r.status,'BLOCKED_NO_HANDOFF');
  safe(r);
 }
});
test('clock boundary accepts exact 120 seconds and 10 second skew only',()=>{
 const e=signed();
 assert.equal(asVerified(e,{nowMs:now+120000}).status,'AUTHENTICATED_REVIEW_NOT_PERSISTED');
 assert.equal(asVerified(e,{nowMs:now-10000}).status,'AUTHENTICATED_REVIEW_NOT_PERSISTED');
 assert.equal(asVerified(e,{nowMs:now+120001}).status,'BLOCKED_NO_HANDOFF');
 assert.equal(asVerified(e,{nowMs:now-10001}).status,'BLOCKED_NO_HANDOFF');
});
test('destination requires a durable atomic replay claim; without implementation it blocks',async()=>{
 const e=signed();
 const r=await validateAndClaimOnce({envelope:e,secret,nowMs:now+3000});
 assert.equal(r.status,'BLOCKED_NO_HANDOFF');
 assert.equal(r.reason,'DURABLE_REPLAY_CLAIM_NOT_CONFIGURED');
 safe(r);
});
test('atomic fake replay claim can be consumed only once; same signed envelope cannot trigger second action',async()=>{
 const set=new Set();
 const claimOnce=async k=>{
  if(set.has(k))return false;
  set.add(k);
  return true;
 };
 const e=signed();
 const one=await validateAndClaimOnce({envelope:e,secret,nowMs:now+3000,claimOnce});
 const two=await validateAndClaimOnce({envelope:e,secret,nowMs:now+3001,claimOnce});
 assert.equal(one.status,'REVIEW_CLAIMED_NOT_PERSISTED');
 assert.equal(one.replayClaimed,true);
 assert.equal(two.status,'BLOCKED_NO_HANDOFF');
 assert.equal(two.reason,'REPLAY_OR_CLAIM_UNCERTAIN');
 assert.equal(set.size,1);
 safe(one);safe(two);
});
test('simultaneous claims for same envelope have one winner in synthetic atomic store',async()=>{
 const claims=new Set();
 const claimOnce=async k=>{
  if(claims.has(k))return false;
  claims.add(k);
  return true;
 };
 const e=signed();
 const results=await Promise.all(Array.from({length:8},()=>validateAndClaimOnce({
  envelope:e,secret,nowMs:now+2000,claimOnce
 })));
 assert.equal(results.filter(x=>x.status==='REVIEW_CLAIMED_NOT_PERSISTED').length,1);
 assert.equal(results.filter(x=>x.status==='BLOCKED_NO_HANDOFF').length,7);
 assert.ok(results.every(x=>x.deliveryAllowed===false&&x.writeAllowed===false));
});
test('ambiguous claim, exception or invalid claim return blocks without retry',async()=>{
 const e=signed();
 for(const claimOnce of [()=>undefined,()=>({claimed:true}),async()=>{throw Error('PAT_PRIVATE');}]){
  const r=await validateAndClaimOnce({envelope:e,secret,nowMs:now,claimOnce});
  assert.equal(r.status,'BLOCKED_NO_HANDOFF');
  assert.equal(r.reason,'REPLAY_OR_CLAIM_UNCERTAIN');
  assert.doesNotMatch(JSON.stringify(r),/PAT_PRIVATE/);
  safe(r);
 }
});
test('no replay claim is made when signature, issuer or freshness invalid',async()=>{
 let calls=0;
 const e=signed();
 for(const envelope of [
  {...e,signature:'X'.repeat(43)},
  {...e,payload:{...e.payload,audience:'wrong'}}
 ]){
  const r=await validateAndClaimOnce({
   envelope,secret,nowMs:now,claimOnce:async()=>{calls++;return true;}
  });
  assert.equal(r.status,'BLOCKED_NO_HANDOFF');
 }
 const expired=await validateAndClaimOnce({
  envelope:e,secret,nowMs:now+130000,claimOnce:async()=>{calls++;return true;}
 });
 assert.equal(expired.status,'BLOCKED_NO_HANDOFF');
 assert.equal(calls,0);
});
test('verified claimed evidence still grants no Firestore write or email permission',async()=>{
 const e=signed();
 const r=await validateAndClaimOnce({
  envelope:e,secret,nowMs:now,claimOnce:async()=>true
 });
 assert.equal(r.status,'REVIEW_CLAIMED_NOT_PERSISTED');
 assert.equal('request' in r,false);
 assert.equal('authorization' in r,false);
 assert.equal('claimOnce' in r,false);
 safe(r);
});
test('module exports only pure signing and verification; no transports/activation',()=>{
 const mod=require('./quarantine-handoff-protocol');
 assert.deepEqual(Object.keys(mod).sort(),[
  'buildHandoff','makeHandoffForVerifiedDraft','validateAndClaimOnce','verifyHandoff'
 ]);
 for(const k of ['fetch','startServer','transport','deploy','send','write','persist',
  'getAccessToken','getIdToken','grantRole','updateIam','retry']){
  assert.equal(k in mod,false);
 }
});
