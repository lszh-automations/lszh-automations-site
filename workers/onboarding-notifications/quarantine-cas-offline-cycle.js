'use strict';
// Pure, synthetic-only CAS transition protocol for one quarantine document.
// NO fetch, token, IAM, retry, scheduling, Cloud Run, Firestore write execution
// or mail transport. This deliberately models outcomes only for a future
// separately approved one-shot STAGING test.
const {planQuarantine}=require('./quarantine-plan');
const {
 PROJECT,DATABASE,COLLECTION,buildQuarantineCommit,decodeSnapshot,
 verifyCommitAcknowledgement,verifyCommittedSnapshot
}=require('./firestore-quarantine-cas');

const ID=/^[a-f0-9]{64}$/;
const ROOT='projects/'+PROJECT+'/databases/'+DATABASE+'/documents/'+COLLECTION+'/';
const API='https://firestore.googleapis.com/v1/';
const BLOCKED='BLOCKED_NO_RETRY';
const READY='READY_TO_COMMIT_ONCE';
const UNCHANGED='NO_CHANGE';
const VERIFIED='READBACK_VERIFIED';
function blocked(reason) {
 return Object.freeze({status:BLOCKED,reason,retryAllowed:false,
                      writesExecuted:false,deliveryAllowed:false});
}
function buildQuarantineRead(draftId) {
 if(typeof draftId!=='string' || !ID.test(draftId))
  throw Error('invalid_quarantine_draft_id');
 return Object.freeze({method:'GET',url:API+ROOT+draftId});
}
// The caller must obtain exactly one independent GET response. A 404 may
// justify a create with exists:false; a 200 must have a verified snapshot.
// Any other status or malformed/unexpected response stops with no mutation.
function prepareQuarantineCAS({draftId,review,reviewedAt,readStatus,document=null}={}) {
 if(typeof draftId!=='string' || !ID.test(draftId))
  return blocked('DRAFT_ID_INVALID');
 if(readStatus!==200 && readStatus!==404)
  return blocked('INITIAL_GET_NOT_VERIFIED');
 if((readStatus===404 && document!==null) ||
    (readStatus===200 && (!document || typeof document!=='object')))
  return blocked('INITIAL_GET_AMBIGUOUS');
 let snapshot=null;
 if(readStatus===200) {
  try {snapshot=decodeSnapshot(document,draftId);}
  catch {return blocked('INITIAL_SNAPSHOT_INVALID');}
 }
 let proposal;
 try {
  proposal=planQuarantine({
   draftId,review,previous:snapshot?.record??null,
   expectedRevision:snapshot?.record.revision??0,reviewedAt
  });
 }catch {return blocked('REVIEW_OR_HISTORY_INVALID');}
 if(proposal.outcome==='unchanged')
  return Object.freeze({status:UNCHANGED,revision:proposal.record.revision,
                        retryAllowed:false,writesExecuted:false,deliveryAllowed:false});
 try{
  const request=buildQuarantineCommit({proposal,previousSnapshot:snapshot});
  return Object.freeze({status:READY,proposal,request,
    retryAllowed:false,writesExecuted:false,deliveryAllowed:false});
 }catch{return blocked('COMMIT_PLAN_INVALID');}
}
function canonicalMicrosecond(t) {
 // A Firestore updateTime is 0/3/6/9 digits of microsecond-aligned UTC;
 // 2026-...Z and 2026-....000Z denote the same instant.
 if(typeof t!=='string')return null;
 const m=t.match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{3}|\d{6}|\d{9}))?Z$/);
 if(!m || (m[2]?.length===9 && !m[2].endsWith('000')))return null;
 const epoch=Date.parse(t);
 if(!Number.isFinite(epoch) || new Date(epoch).toISOString().slice(0,19)!==m[1])return null;
 return m[1]+'.'+(m[2]??'').padEnd(6,'0').slice(0,6)+'Z';
}
// A successful HTTP 200 is not sufficient. Require a typed Firestore ack AND
// an independent exact document GET. Any result ambiguity stops; never retry.
function assessQuarantineCommit({
 prepared,commitStatus,commitResponse,
 readbackStatus,readbackDocument=null
}={}) {
 if(prepared?.status!==READY || prepared.retryAllowed!==false ||
    !prepared.proposal || !prepared.request)
  return blocked('UNREVIEWED_COMMIT_PLAN');
 if(commitStatus!==200)return blocked('COMMIT_NOT_ACKNOWLEDGED');
 try {verifyCommitAcknowledgement(commitResponse);}
 catch{return blocked('COMMIT_ACK_AMBIGUOUS');}
 if(readbackStatus!==200 || !readbackDocument)
  return blocked('COMMIT_READBACK_NOT_VERIFIED');
 let checked;
 try{checked=verifyCommittedSnapshot({proposal:prepared.proposal,document:readbackDocument});}
 catch{return blocked('COMMIT_READBACK_MISMATCH');}
 const ackTime=canonicalMicrosecond(commitResponse.writeResults[0].updateTime);
 const actualTime=canonicalMicrosecond(checked.updateTime);
 if(!ackTime || !actualTime || ackTime!==actualTime)
  return blocked('COMMIT_VERSION_MISMATCH');
 return Object.freeze({status:VERIFIED,revision:checked.revision,
  retryAllowed:false,writesExecuted:false,persistedVerified:true,
  deliveryAllowed:false,requiresManualApproval:true});
}
module.exports=Object.freeze({
 PROJECT,DATABASE,COLLECTION,buildQuarantineRead,
 prepareQuarantineCAS,assessQuarantineCommit
});
