import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {eventId}=require('./outbox');
const {STATUS}=require('./draft-review-gate');
const {STATES}=require('./quarantine-plan');
const {PROJECT,DATABASE,COLLECTION,buildQuarantineRead,prepareQuarantineCAS,assessQuarantineCommit}=require('./quarantine-cas-offline-cycle');
const ID=eventId('rec'+'C'.repeat(14));
const OTHER=eventId('rec'+'D'.repeat(14));
const DOC='projects/'+PROJECT+'/databases/'+DATABASE+'/documents/'+COLLECTION+'/'+ID;
const AT='2026-10-17T15:00:00.000Z';
const DONE='2026-10-17T15:00:01.123456Z';
const review=(status=STATUS.QUARANTINE,reason='ONBOARDING_NOT_COMPLETE')=>({
 status,reason,quarantineRecommended:status!==STATUS.CURRENTLY_COMPLETE,
 deliveryAllowed:false,requiresManualApproval:true
});
const complete=()=>review(STATUS.CURRENTLY_COMPLETE,'FRESH_COMPLETE_EVIDENCE');
const make=(reviewValue=review(),extra={})=>prepareQuarantineCAS({
 draftId:ID,review:reviewValue,reviewedAt:AT,readStatus:404,...extra
});
const snapshot=(prepared,time=DONE)=>{
 const w=prepared.request.body.writes[0];
 return {name:w.update.name,fields:structuredClone(w.update.fields),updateTime:time};
};
const response=(time=DONE)=>({writeResults:[{updateTime:time}],commitTime:time});
function safeOutcome(x){
 assert.equal(x.deliveryAllowed,false);
 assert.equal(x.retryAllowed,false);
 assert.equal(x.networkCallsMade,false);
 assert.ok(!('send' in x) && !('token' in x));
}
test('only a fixed collection/document GET can be prepared; no headers or transport',()=>{
 const x=buildQuarantineRead(ID);
 assert.equal(x.method,'GET');
 assert.equal(x.url,'https://firestore.googleapis.com/v1/'+DOC);
 assert.equal(Object.isFrozen(x),true);
 assert.deepEqual(Object.keys(x).sort(),['method','url']);
 for(const id of [null,'bad','../secret',ID.toUpperCase(),'a'.repeat(63)])
  assert.throws(()=>buildQuarantineRead(id),/invalid_quarantine_draft_id/);
});
test('absent synthetic case leads to exactly one create-if-absent CAS, then independently verified readback',()=>{
 const x=make();
 assert.equal(x.status,'READY_TO_COMMIT_ONCE');
 assert.deepEqual(x.request.body.writes[0].currentDocument,{exists:false});
 assert.equal(x.request.body.writes[0].update.name,DOC);
 assert.equal(x.request.body.writes.length,1);
 safeOutcome(x);
 const y=assessQuarantineCommit({prepared:x,commitStatus:200,commitResponse:response(),
  readbackStatus:200,readbackDocument:snapshot(x)});
 assert.equal(y.status,'READBACK_VERIFIED');
 assert.equal(y.revision,1);
 assert.equal(y.persistedVerified,true);
 assert.equal(y.requiresManualApproval,true);
 safeOutcome(y);
});
test('existing valid case uses exact updateTime and full one-step audit append',()=>{
 const initial=make(complete());
 const old=snapshot(initial);
 const x=make(review(),{readStatus:200,document:old,reviewedAt:'2026-10-17T15:00:02.000Z'});
 assert.equal(x.status,'READY_TO_COMMIT_ONCE');
 assert.equal(x.proposal.record.revision,2);
 assert.equal(x.proposal.record.state,STATES.QUARANTINED);
 assert.deepEqual(x.request.body.writes[0].currentDocument,{updateTime:DONE});
 assert.equal(x.request.body.writes[0].update.fields.events.arrayValue.values.length,2);
 assert.equal(assessQuarantineCommit({prepared:x,commitStatus:200,
  commitResponse:response('2026-10-17T15:00:03.456000Z'),readbackStatus:200,
  readbackDocument:snapshot(x,'2026-10-17T15:00:03.456Z')}).status,'READBACK_VERIFIED');
 safeOutcome(x);
});
test('repeated complete review is a true no-op without a write proposal',()=>{
 const initial=make(complete());
 const x=make(complete(),{readStatus:200,document:snapshot(initial),
  reviewedAt:'2026-10-17T15:00:03.000Z'});
 assert.equal(x.status,'NO_CHANGE');
 assert.equal(x.revision,1);
 assert.ok(!('request' in x));
 assert.ok(!('proposal' in x));
 safeOutcome(x);
});
test('read errors, HTTP 403, missing document and malformed identity all block before CAS',()=>{
 const prepared=make();
 const read=snapshot(prepared);
 const cases=[
  {readStatus:403},{readStatus:500},{readStatus:401},{readStatus:408},
  {readStatus:404,document:read},{readStatus:200,document:null},
  {readStatus:200,document:{...read,name:read.name.replace(ID,OTHER)}},
  {readStatus:200,document:{...read,fields:{...read.fields,recipient:{stringValue:'private@example.invalid'}}}},
  {readStatus:200,document:{...read,updateTime:'2026-02-30T12:00:00.000Z'}}
 ];
 for(const input of cases){
  const x=make(review(),input);
  assert.equal(x.status,'BLOCKED_NO_RETRY',JSON.stringify(input));
  assert.ok(!('request' in x));
  safeOutcome(x);
 }
});
test('review injection, stale/malformed event and invalid time block with no commit',()=>{
 const first=make();
 const doc=snapshot(first);
 const variants=[
  make({...review(),reason:'Bearer pat_secret'}),
  make(review(),{draftId:'INVALID'}),
  make(review(),{reviewedAt:'yesterday'}),
  make(review(),{readStatus:200,document:doc,reviewedAt:'2026-10-17T14:00:00.000Z'}),
  make(review(),{readStatus:200,document:{...doc,fields:{
   ...doc.fields,deliveryAllowed:{booleanValue:true}
  }}})
 ];
 for(const x of variants){
  assert.equal(x.status,'BLOCKED_NO_RETRY');
  safeOutcome(x);
 }
});
test('parallel create-if-absent actors cannot both pass precondition in simulated atomic store',()=>{
 const actor1=make(review());
 const actor2=make(complete());
 const db=new Map();
 function simulate(req){
  const w=req.body.writes[0],name=w.update.name;
  if(w.currentDocument.exists===false && db.has(name))return 409;
  db.set(name,{name,fields:structuredClone(w.update.fields),updateTime:DONE});
  return 200;
 }
 assert.equal(simulate(actor1.request),200);
 assert.equal(simulate(actor2.request),409);
 const stale=assessQuarantineCommit({prepared:actor2,commitStatus:409});
 assert.equal(stale.status,'BLOCKED_NO_RETRY');
 assert.equal(stale.reason,'COMMIT_NOT_ACKNOWLEDGED');
 safeOutcome(stale);
});
test('parallel updated actor with stale updateTime blocks; no blind retry',()=>{
 const first=make(complete());
 let current=snapshot(first);
 const one=make(review(),{readStatus:200,document:current,reviewedAt:'2026-10-17T15:00:02.000Z'});
 const two=make(review(STATUS.QUARANTINE,'AMBIGUOUS_ONBOARDING_STATE'),
  {readStatus:200,document:current,reviewedAt:'2026-10-17T15:00:02.000Z'});
 function fakeCas(x){
  const cond=x.request.body.writes[0].currentDocument;
  if(cond.updateTime!==current.updateTime)return 412;
  current=snapshot(x,'2026-10-17T15:00:03.000Z');
  return 200;
 }
 assert.equal(fakeCas(one),200);
 assert.equal(fakeCas(two),412);
 assert.equal(assessQuarantineCommit({prepared:two,commitStatus:412}).status,'BLOCKED_NO_RETRY');
 assert.equal(current.fields.revision.integerValue,'2');
});
test('timeout, conflicts, missing acknowledgments or unsafe readback are never success',()=>{
 const x=make();
 const valid=snapshot(x);
 const conditions=[
  {commitStatus:undefined},
  {commitStatus:409},
  {commitStatus:412},
  {commitStatus:503},
  {commitStatus:200,commitResponse:null},
  {commitStatus:200,commitResponse:{writeResults:[]}},
  {commitStatus:200,commitResponse:response(),readbackStatus:404},
  {commitStatus:200,commitResponse:response(),readbackStatus:403},
  {commitStatus:200,commitResponse:response(),readbackStatus:200,readbackDocument:{...valid,name:valid.name+'x'}},
  {commitStatus:200,commitResponse:response(),readbackStatus:200,readbackDocument:{...valid,fields:{...valid.fields,deliveryAllowed:{booleanValue:true}}}},
  {commitStatus:200,commitResponse:response('2026-10-17T15:00:01.123457Z'),readbackStatus:200,readbackDocument:valid}
 ];
 for(const o of conditions){
  const result=assessQuarantineCommit({prepared:x,...o});
  assert.equal(result.status,'BLOCKED_NO_RETRY',JSON.stringify(o));
  safeOutcome(result);
 }
 assert.equal(assessQuarantineCommit({prepared:{status:'NO_CHANGE'},commitStatus:200,
   commitResponse:response(),readbackStatus:200,readbackDocument:valid}).status,'BLOCKED_NO_RETRY');
});
test('no network, credentials, sender or automatic persistence API can be exported',()=>{
 const mod=require('./quarantine-cas-offline-cycle');
 for(const k of ['fetch','persist','run','send','retry','impersonate','grant','create']) {
  assert.equal(k in mod,false);
 }
 const prepared=make();
 for(const s of ['Authorization','Bearer ','roles/datastore.user','lszh-offers-staging','smtp','pat_']){
  assert.equal(JSON.stringify(prepared).includes(s),false,s);
 }
});
