'use strict';
// OFFLINE-ONLY Firestore REST CAS contract. No fetch, credentials, live transport,
// sender, HTTP route, or automatic retry. This file BUILDS an atomic request,
// it does not execute it. A future caller requires separate reviewed approval.
const {isDeepStrictEqual}=require('node:util');
const {validCase}=require('./quarantine-plan');

const PROJECT='lszh-automations';
const DATABASE='lszh-quarantine-staging';
const COLLECTION='lszh_onboarding_quarantine_cases_staging';
const ROOT='projects/'+PROJECT+'/databases/'+DATABASE;
const COMMIT_URL='https://firestore.googleapis.com/v1/'+ROOT+'/documents:commit';
const DOC_ROOT=ROOT+'/documents/'+COLLECTION+'/';
const ID=/^[a-f0-9]{64}$/;
const CASE_KEYS=[
 'schemaVersion','draftId','revision','state','lastReviewStatus',
 'lastReason','events','deliveryAllowed','requiresManualApproval'
];
const EVENT_KEYS=['seq','status','reason','resultingState','reviewedAt'];
const EXACT_PROPOSAL=['outcome','expectedRevision','record','deliveryAllowed','requiresManualApproval'];
function hasKeys(x,keys) {
 return !!x && typeof x==='object' && !Array.isArray(x) &&
  Object.keys(x).length===keys.length && keys.every(k=>Object.hasOwn(x,k));
}
function firestoreTime(x) {
 // Firestore updateTime is RFC3339, microsecond aligned; preserve its
 // original precision for currentDocument.updateTime. Never round it in JS.
 if(typeof x!=='string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3}|\.\d{6}|\.\d{9})?Z$/.test(x) ||
    !Number.isFinite(Date.parse(x)))return false;
 const parts=x.match(/\.(\d{9})Z$/);
 return !parts || parts[1].endsWith('000');
}
const str=s=>({stringValue:s});
const num=n=>({integerValue:String(n)});
const bool=b=>({booleanValue:b});
function encodeCase(record) {
 if(!validCase(record,record?.draftId))throw Error('invalid_quarantine_case');
 const fields={
  schemaVersion:num(record.schemaVersion),
  draftId:str(record.draftId),
  revision:num(record.revision),
  state:str(record.state),
  lastReviewStatus:str(record.lastReviewStatus),
  lastReason:str(record.lastReason),
  events:{arrayValue:{values:record.events.map(e=>({
   mapValue:{fields:{
    seq:num(e.seq),status:str(e.status),reason:str(e.reason),
    resultingState:str(e.resultingState),reviewedAt:{timestampValue:e.reviewedAt}
   }}
  }))}},
  deliveryAllowed:bool(false),
  requiresManualApproval:bool(true)
 };
 return fields;
}
function readFields(doc,draftId) {
 const fields=doc?.fields;
 if(!hasKeys(fields,CASE_KEYS))throw Error('quarantine_snapshot_fields_invalid');
 function typed(key,type) {
  const v=fields[key];
  if(!hasKeys(v,[type]))throw Error('quarantine_snapshot_fields_invalid');
  return v[type];
 }
 function int(v) {
  if(typeof v!=='string' || !/^(0|[1-9]\d*)$/.test(v))throw Error('quarantine_snapshot_fields_invalid');
  const n=Number(v);
  if(!Number.isSafeInteger(n))throw Error('quarantine_snapshot_fields_invalid');
  return n;
 }
 const raw=typed('events','arrayValue');
 if(!hasKeys(raw,['values']) || !Array.isArray(raw.values) || raw.values.length>32)
  throw Error('quarantine_snapshot_fields_invalid');
 const events=raw.values.map(item=>{
  if(!hasKeys(item,['mapValue']) || !hasKeys(item.mapValue,['fields']) ||
     !hasKeys(item.mapValue.fields,EVENT_KEYS))
    throw Error('quarantine_snapshot_fields_invalid');
  const f=item.mapValue.fields;
  const field=(key,type)=>{
   if(!hasKeys(f[key],[type]))throw Error('quarantine_snapshot_fields_invalid');
   return f[key][type];
  };
  return {
   seq:int(field('seq','integerValue')),
   status:field('status','stringValue'),
   reason:field('reason','stringValue'),
   resultingState:field('resultingState','stringValue'),
   reviewedAt:field('reviewedAt','timestampValue')
  };
 });
 const record={
  schemaVersion:int(typed('schemaVersion','integerValue')),
  draftId:typed('draftId','stringValue'),
  revision:int(typed('revision','integerValue')),
  state:typed('state','stringValue'),
  lastReviewStatus:typed('lastReviewStatus','stringValue'),
  lastReason:typed('lastReason','stringValue'),
  events,
  deliveryAllowed:typed('deliveryAllowed','booleanValue'),
  requiresManualApproval:typed('requiresManualApproval','booleanValue')
 };
 if(!validCase(record,draftId))throw Error('quarantine_snapshot_fields_invalid');
 return record;
}
function decodeSnapshot(doc,draftId) {
 if(typeof draftId!=='string' || !ID.test(draftId))
  throw Error('invalid_quarantine_draft_id');
 if(!doc || doc.name!==DOC_ROOT+draftId || !firestoreTime(doc.updateTime))
  throw Error('quarantine_snapshot_identity_invalid');
 return Object.freeze({record:readFields(doc,draftId),updateTime:doc.updateTime});
}
/**
 * One exact Firestore Write, never a batchWrite or blind PATCH:
 * new case: currentDocument.exists=false;
 * updated case: currentDocument.updateTime from the previously VERIFIED read.
 * The backend enforces these preconditions atomically. This function does no I/O.
 */
function buildQuarantineCommit({proposal,previousSnapshot=null}={}) {
 if(!hasKeys(proposal,EXACT_PROPOSAL) ||
    !['created','updated'].includes(proposal.outcome) ||
    proposal.deliveryAllowed!==false || proposal.requiresManualApproval!==true ||
    !proposal.record || !validCase(proposal.record,proposal.record.draftId) ||
    typeof proposal.record.draftId!=='string' || !ID.test(proposal.record.draftId) ||
    !Number.isSafeInteger(proposal.expectedRevision) || proposal.expectedRevision<0 ||
    proposal.record.revision!==proposal.expectedRevision+1)
  throw Error('invalid_quarantine_cas_proposal');
 const {record}=proposal;
 let precondition;
 if(proposal.outcome==='created') {
  if(previousSnapshot!==null || proposal.expectedRevision!==0)
   throw Error('quarantine_cas_snapshot_mismatch');
  precondition={exists:false};
 }else {
  if(!previousSnapshot ||
     !hasKeys(previousSnapshot,['record','updateTime']) ||
     !validCase(previousSnapshot.record,record.draftId) ||
     !firestoreTime(previousSnapshot.updateTime) ||
     previousSnapshot.record.revision!==proposal.expectedRevision ||
     !isDeepStrictEqual(record.events.slice(0,-1),previousSnapshot.record.events))
   throw Error('quarantine_cas_snapshot_mismatch');
  precondition={updateTime:previousSnapshot.updateTime};
 }
 const name=DOC_ROOT+record.draftId;
 const write={update:{name,fields:encodeCase(record)},currentDocument:precondition};
 return Object.freeze({
  method:'POST',url:COMMIT_URL,
  body:Object.freeze({writes:Object.freeze([write])}),
  deliveryAllowed:false
 });
}
// A commit acknowledgement is not a verified saved document, especially if
// the remote reply was lost. Caller must do a separate identity-checked read.
function verifyCommitAcknowledgement(response) {
 if(!response || !Array.isArray(response.writeResults) ||
    response.writeResults.length!==1 ||
    !firestoreTime(response.writeResults[0]?.updateTime) ||
    !firestoreTime(response.commitTime))
  throw Error('quarantine_commit_result_ambiguous');
 return Object.freeze({acknowledged:true,persistedVerified:false});
}
function verifyCommittedSnapshot({proposal,document}={}) {
 if(!proposal || !proposal.record || !validCase(proposal.record,proposal.record.draftId))
  throw Error('invalid_quarantine_cas_proposal');
 const snapshot=decodeSnapshot(document,proposal.record.draftId);
 if(!isDeepStrictEqual(snapshot.record,proposal.record))
  throw Error('quarantine_commit_readback_mismatch');
 return Object.freeze({persistedVerified:true,deliveryAllowed:false,
  revision:snapshot.record.revision,updateTime:snapshot.updateTime});
}
module.exports={
 PROJECT,DATABASE,COLLECTION,buildQuarantineCommit,decodeSnapshot,
 verifyCommitAcknowledgement,verifyCommittedSnapshot
};
