import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {planQuarantine,STATES}=require('./quarantine-plan');
const {STATUS}=require('./draft-review-gate');
const {eventId}=require('./outbox');
const {
 PROJECT,DATABASE,COLLECTION,buildQuarantineCommit,decodeSnapshot,
 verifyCommitAcknowledgement,verifyCommittedSnapshot
}=require('./firestore-quarantine-cas');

const ID=eventId('rec'+'A'.repeat(14));
const OTHER=eventId('rec'+'B'.repeat(14));
const NAME='projects/'+PROJECT+'/databases/'+DATABASE+'/documents/'+COLLECTION+'/'+ID;
const DATE='2026-10-17T12:00:00.000Z';
const review=(status,reason)=>({
 status,reason,quarantineRecommended:status!==STATUS.CURRENTLY_COMPLETE,
 deliveryAllowed:false,requiresManualApproval:true
});
const ok=review(STATUS.CURRENTLY_COMPLETE,'FRESH_COMPLETE_EVIDENCE');
const bad=review(STATUS.QUARANTINE,'ONBOARDING_NOT_COMPLETE');
const conflicting=review(STATUS.QUARANTINE,'AMBIGUOUS_ONBOARDING_STATE');
const make=(r,previous=null,at=DATE)=>planQuarantine({
 draftId:ID,review:r,previous,expectedRevision:previous?.revision??0,reviewedAt:at
});
function snapshotFromCommit(request,updateTime='2026-10-17T12:00:01.123456Z'){
 const w=request.body.writes[0];
 return {name:w.update.name,fields:structuredClone(w.update.fields),updateTime};
}
function assertPrivate(request){
 assert.equal(request.deliveryAllowed,false);
 assert.equal(request.method,'POST');
 assert.equal(request.url,'https://firestore.googleapis.com/v1/projects/lszh-automations/databases/lszh-quarantine-staging/documents:commit');
 assert.equal(request.body.writes.length,1);
 const text=JSON.stringify(request);
 for(const secret of ['@example','Bearer ','ob_','recAAAAAAAAAAAAAA','pat_','recipient','email','sendMail']) {
  assert.equal(text.includes(secret),false,secret);
 }
 assert.equal(text.includes('DRAFT_NOT_SENT'),false,'Preserve original outbox documents in a different collection');
}
test('new quarantine case uses exists:false and one atomic Firestore write in separate staging collection',()=>{
 const proposal=make(ok);
 const req=buildQuarantineCommit({proposal});
 assertPrivate(req);
 const w=req.body.writes[0];
 assert.deepEqual(w.currentDocument,{exists:false});
 assert.equal(w.update.name,NAME);
 assert.equal(w.update.fields.schemaVersion.integerValue,'1');
 assert.equal(w.update.fields.revision.integerValue,'1');
 assert.equal(w.update.fields.deliveryAllowed.booleanValue,false);
 assert.equal(w.update.fields.requiresManualApproval.booleanValue,true);
 assert.equal(w.update.fields.events.arrayValue.values.length,1);
 assert.equal(w.update.fields.events.arrayValue.values[0].mapValue.fields.reviewedAt.timestampValue,DATE);
 const decoded=decodeSnapshot(snapshotFromCommit(req),ID);
 assert.deepEqual(decoded.record,proposal.record);
 assert.equal(decoded.updateTime,'2026-10-17T12:00:01.123456Z');
 const receipt=verifyCommitAcknowledgement({
  writeResults:[{updateTime:decoded.updateTime}],commitTime:decoded.updateTime
 });
 assert.deepEqual(receipt,{acknowledged:true,persistedVerified:false});
 const checked=verifyCommittedSnapshot({proposal,document:snapshotFromCommit(req)});
 assert.equal(checked.persistedVerified,true);
 assert.equal(checked.deliveryAllowed,false);
 assert.equal(checked.revision,1);
});
test('update is conditional on EXACT prior Firestore updateTime, not only local revision',()=>{
 const initial=make(ok);
 const initReq=buildQuarantineCommit({proposal:initial});
 assert.throws(()=>decodeSnapshot(snapshotFromCommit(initReq,'2026-10-17T12:00:01.123456789Z'),ID),
  /quarantine_snapshot_identity_invalid/);
 const snapshot=decodeSnapshot(snapshotFromCommit(initReq,'2026-10-17T12:00:01.123456000Z'),ID);
 const next=make(bad,snapshot.record,'2026-10-17T12:00:02.000Z');
 const commit=buildQuarantineCommit({proposal:next,previousSnapshot:snapshot});
 assert.deepEqual(commit.body.writes[0].currentDocument,{updateTime:snapshot.updateTime});
 assert.equal(commit.body.writes[0].update.fields.revision.integerValue,'2');
 assertPrivate(commit);
});
test('two racing actors with same source snapshot: synthetic backend accepts exactly one',()=>{
 const start=make(ok);
 const firstReq=buildQuarantineCommit({proposal:start});
 let saved=snapshotFromCommit(firstReq,'2026-10-17T12:00:01.123456Z');
 const previous=decodeSnapshot(saved,ID);
 const p1=make(bad,previous.record,'2026-10-17T12:00:02.000Z');
 const p2=make(conflicting,previous.record,'2026-10-17T12:00:02.000Z');
 const req1=buildQuarantineCommit({proposal:p1,previousSnapshot:previous});
 const req2=buildQuarantineCommit({proposal:p2,previousSnapshot:previous});
 assert.deepEqual(req1.body.writes[0].currentDocument,{updateTime:previous.updateTime});
 assert.deepEqual(req2.body.writes[0].currentDocument,{updateTime:previous.updateTime});
 let version=2, accepted=0, denied=0;
 function fakeCommit(req) {
  const write=req.body.writes[0];
  if(write.currentDocument.updateTime!==saved.updateTime){denied++;return {ok:false,status:409};}
  saved=snapshotFromCommit(req,'2026-10-17T12:00:0'+version+'.000000Z');
  version++;accepted++;return {ok:true,status:200};
 }
 assert.equal(fakeCommit(req1).ok,true);
 assert.equal(fakeCommit(req2).status,409);
 assert.equal(accepted,1);assert.equal(denied,1);
 const finalSnapshot=decodeSnapshot(saved,ID);
 assert.equal(finalSnapshot.record.revision,2);
 assert.equal(finalSnapshot.record.state,STATES.QUARANTINED);
 assert.equal(finalSnapshot.record.lastReason,'ONBOARDING_NOT_COMPLETE');
 const fresh=make(conflicting,finalSnapshot.record,'2026-10-17T12:00:03.000Z');
 const third=buildQuarantineCommit({proposal:fresh,previousSnapshot:finalSnapshot});
 assert.equal(third.body.writes[0].currentDocument.updateTime,finalSnapshot.updateTime);
 assert.equal(fakeCommit(third).ok,true);
 assert.equal(accepted,2);
 assertPrivate(third);
});
test('no blind writes on missing snapshot, old revision, changed history or wrong identity',()=>{
 const existing=make(ok);
 const request=buildQuarantineCommit({proposal:existing});
 const previous=decodeSnapshot(snapshotFromCommit(request),ID);
 const next=make(bad,previous.record,'2026-10-17T12:00:02.000Z');
 const invalid=[
  {proposal:next},
  {proposal:next,previousSnapshot:{...previous,updateTime:'bad'}},
  {proposal:next,previousSnapshot:{...previous,record:{...previous.record,revision:123}}},
  {proposal:next,previousSnapshot:{...previous,record:{...previous.record,draftId:OTHER}}},
  {proposal:next,previousSnapshot:{...previous,record:{...previous.record,events:[]}}},
  {proposal:existing,previousSnapshot:previous},
  {proposal:{...next,expectedRevision:0},previousSnapshot:previous},
  {proposal:{...next,deliveryAllowed:true},previousSnapshot:previous},
  {proposal:{...next,outcome:'unchanged'},previousSnapshot:previous},
  {proposal:{...next,recipient:'person@example.invalid'},previousSnapshot:previous}
 ];
 for(const x of invalid)assert.throws(()=>buildQuarantineCommit(x),/quarantine_cas/);
 const altered=structuredClone(next);
 altered.record.events[0].reason='AMBIGUOUS_ONBOARDING_STATE';
 assert.throws(()=>buildQuarantineCommit({proposal:altered,previousSnapshot:previous}),/quarantine_cas/);
});
test('strict document decoding rejects mismatches, injected data, broken schemas and timestamps',()=>{
 const request=buildQuarantineCommit({proposal:make(bad)});
 const base=snapshotFromCommit(request);
 const badDocs=[
  {...base,name:base.name.replace(COLLECTION,'lszh_onboarding_notification_drafts_staging')},
  {...base,name:base.name.replace(ID,OTHER)},
  {...base,updateTime:'2026-10-17T12:00:01.123456789Z'},
  {...base,updateTime:'not-a-time'},
  {...base,updateTime:'2026-02-30T12:00:01.123456Z'},
  {...base,updateTime:'2026-10-17T25:00:01.123456Z'},
  {...base,fields:{...base.fields,recipient:{stringValue:'private@example.invalid'}}},
  {...base,fields:{...base.fields,deliveryAllowed:{booleanValue:true}}},
  {...base,fields:{...base.fields,revision:{integerValue:'abc'}}},
  {...base,fields:{...base.fields,revision:{integerValue:'999'}}},
  {...base,fields:{...base.fields,events:{arrayValue:{values:[]}}}},
  {...base,fields:{...base.fields,events:{arrayValue:{values:[{
    mapValue:{fields:{...base.fields.events.arrayValue.values[0].mapValue.fields,
     reason:{stringValue:'PII token secret'}}}
   }]}}}}
 ];
 for(const doc of badDocs)
  assert.throws(()=>decodeSnapshot(doc,ID),/quarantine_snapshot/);
 assert.throws(()=>decodeSnapshot(base,OTHER),/quarantine_snapshot_identity_invalid/);
});
test('ambiguous acknowledgement never proves saved; readback verifies exact revision and payload',()=>{
 const plan=make(bad);
 const request=buildQuarantineCommit({proposal:plan});
 for(const response of [
  null,{}, {writeResults:[]}, {writeResults:[{},{}]},
  {writeResults:[{}],commitTime:'2026-10-17T12:00:01Z'},
  {writeResults:[{updateTime:'bad'}],commitTime:'2026-10-17T12:00:01.000Z'}
 ])assert.throws(()=>verifyCommitAcknowledgement(response),/quarantine_commit_result_ambiguous/);
 const different=buildQuarantineCommit({proposal:make(ok)});
 const badDoc=snapshotFromCommit(different);
 assert.throws(()=>verifyCommittedSnapshot({proposal:plan,document:badDoc}),/quarantine_commit_readback_mismatch/);
 const confirmed=verifyCommittedSnapshot({proposal:plan,document:snapshotFromCommit(request)});
 assert.equal(confirmed.persistedVerified,true);
 assert.equal(confirmed.deliveryAllowed,false);
});
test('offline module does not expose any live transport, cloud credential or sender',()=>{
 const module=require('./firestore-quarantine-cas');
 assert.equal('persist' in module,false);
 assert.equal('fetch' in module,false);
 assert.equal('send' in module,false);
 assert.equal('claim' in module,false);
 const proposal=make(ok);
 const req=buildQuarantineCommit({proposal});
 assert.equal('headers' in req,false);
 assert.equal('Authorization' in req,false);
});
