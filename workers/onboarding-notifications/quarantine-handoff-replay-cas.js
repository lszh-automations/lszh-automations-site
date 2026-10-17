'use strict';
// OFFLINE-ONLY durable replay claim contract. This module DOES NOT send any
// Firestore HTTP requests, mint identity tokens, grant IAM roles or execute
// writes. The future recipient (separately approved) would execute a single
// Firestore documents:commit with currentDocument.exists=false, independently
// read back the exact claim, and ONLY THEN return claimOnce(key) === true.
// No automatic retry, no deletion and no TTL that could reopen a replay.
const {isDeepStrictEqual}=require('node:util');
const {PROJECT,DATABASE}=require('./firestore-quarantine-cas');

const COLLECTION='lszh_quarantine_handoff_replay_staging';
const ID=/^[a-f0-9]{64}$/;
const ROOT='projects/'+PROJECT+'/databases/'+DATABASE+'/documents/'+COLLECTION+'/';
const API='https://firestore.googleapis.com/v1/';
const COMMIT=API+'projects/'+PROJECT+'/databases/'+DATABASE+'/documents:commit';
const FIELDS=['schemaVersion','purpose','replayKey','state','claimedAt'];
function exact(x,keys) {
 return !!x && typeof x==='object' && !Array.isArray(x) &&
   Object.keys(x).length===keys.length && keys.every(k=>Object.hasOwn(x,k));
}
function timestamp(time) {
 if(typeof time!=='string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(time) ||
    !Number.isFinite(Date.parse(time)) ||
    new Date(Date.parse(time)).toISOString()!==time)
  throw Error('replay_claim_time_invalid');
 return time;
}
// Generated claims are immutable all the way down: mutable nested Firestore
// fields could otherwise diverge from the independently audited write plan.
function deepFreeze(value) {
 if(value && typeof value==='object') {
  for(const child of Object.values(value))deepFreeze(child);
  Object.freeze(value);
 }
 return value;
}
function blocked(reason) {
 return Object.freeze({status:'BLOCKED_NO_REPLAY_CLAIM',reason,
  retryAllowed:false,writeAllowed:false,deliveryAllowed:false});
}
function planReplayClaim({replayKey,claimedAt}={}) {
 if(typeof replayKey!=='string' || !ID.test(replayKey))
  throw Error('replay_claim_key_invalid');
 const at=timestamp(claimedAt);
 const name=ROOT+replayKey;
 const fields={
  schemaVersion:{integerValue:'1'},
  purpose:{stringValue:'LSZH_QUARANTINE_HANDOFF_REPLAY_V1'},
  replayKey:{stringValue:replayKey},
  state:{stringValue:'CLAIMED_PENDING_MANUAL_REVIEW'},
  claimedAt:{timestampValue:at}
 };
 const request=Object.freeze({
  method:'POST',url:COMMIT,
  body:Object.freeze({writes:Object.freeze([
   Object.freeze({update:{name,fields},currentDocument:{exists:false}})
  ])})
 });
 return deepFreeze({
  status:'OFFLINE_CLAIM_PLAN_ONLY',request,
  name,replayKey,claimedAt:at,
  retryAllowed:false,writeAllowed:false,deliveryAllowed:false
 });
}
function canonicalMicrosecond(value) {
 if(typeof value!=='string')return null;
 const m=value.match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{3}|\d{6}|\d{9}))?Z$/);
 if(!m || (m[2]?.length===9 && !m[2].endsWith('000')))return null;
 const ms=Date.parse(value);
 if(!Number.isFinite(ms) || new Date(ms).toISOString().slice(0,19)!==m[1])return null;
 return m[1]+'.'+(m[2]??'').padEnd(6,'0').slice(0,6)+'Z';
}
function equivalentMillisecond(a,b) {
 const aUs=canonicalMicrosecond(a), bUs=canonicalMicrosecond(b);
 return !!aUs && !!bUs && aUs===bUs;
}
function exactClaimDocument(plan,document) {
 if(plan?.status!=='OFFLINE_CLAIM_PLAN_ONLY' ||
    !ID.test(plan.replayKey) || document?.name!==plan.name ||
    !exact(document?.fields,FIELDS))
  return false;
 const expected=plan.request.body.writes[0].update.fields;
 for(const key of FIELDS) {
  const field=document.fields[key], want=expected[key];
  if(!exact(field,Object.keys(want)))return false;
  const type=Object.keys(want)[0];
  if(key==='claimedAt') {
   if(!equivalentMillisecond(field[type],want[type]))return false;
  }else if(field[type]!==want[type])return false;
 }
 return true;
}
function verifiedReplayClaim({
 plan,commitStatus,commitResponse,readStatus,document
}={}) {
 // Never trust a caller-supplied plan as proof of which document and fields
 // were intended. Reconstruct the canonical plan independently and compare
 // every field before assessing any Firestore acknowledgement or readback.
 let canonicalPlan;
 try {
  canonicalPlan=planReplayClaim({
   replayKey:plan?.replayKey,claimedAt:plan?.claimedAt
  });
 }catch{return blocked('UNREVIEWED_REPLAY_PLAN');}
 if(!isDeepStrictEqual(plan,canonicalPlan) ||
    plan?.status!=='OFFLINE_CLAIM_PLAN_ONLY' ||
    plan.request?.method!=='POST' ||
    plan.request.url!==COMMIT ||
    plan.request.body?.writes?.length!==1 ||
    plan.request.body.writes[0].currentDocument?.exists!==false)
  return blocked('UNREVIEWED_REPLAY_PLAN');
 // 409/412 means already claimed; 5xx or timeout may mean uncertain commit.
 // All uncertain results permanently fail closed from this attempt.
 if(commitStatus!==200)return blocked('CLAIM_FAILED_OR_UNCERTAIN');
 const wr=commitResponse?.writeResults;
 if(!Array.isArray(wr) || wr.length!==1 ||
    !canonicalMicrosecond(wr[0]?.updateTime) ||
    !canonicalMicrosecond(commitResponse.commitTime))
  return blocked('CLAIM_ACK_AMBIGUOUS');
 if(readStatus!==200 || !exactClaimDocument(plan,document))
  return blocked('CLAIM_READBACK_NOT_VERIFIED');
 if(!canonicalMicrosecond(document.updateTime) ||
    canonicalMicrosecond(document.updateTime)!==canonicalMicrosecond(wr[0].updateTime))
  return blocked('CLAIM_VERSION_NOT_VERIFIED');
 // Verifies a single synthetic claim acknowledgement + matching readback only.
 // NOT a claim write/execution by this module.
 return Object.freeze({
  status:'CLAIM_READBACK_VERIFIED',
  durableReadbackVerified:true,retryAllowed:false,
  writeAllowed:false,deliveryAllowed:false
 });
}
module.exports=Object.freeze({
 COLLECTION,planReplayClaim,verifiedReplayClaim
});
