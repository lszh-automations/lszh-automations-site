import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {COLLECTION,planReplayClaim,verifiedReplayClaim}=require('./quarantine-handoff-replay-cas');
const KEY='a'.repeat(64);
const TIME='2026-10-17T16:30:00.000Z';
const UPDATE='2026-10-17T16:30:01.123456Z';
const ROOT='projects/lszh-automations/databases/lszh-quarantine-staging/documents/';
function receipt(update=UPDATE){
 return {writeResults:[{updateTime:update}],commitTime:update};
}
function saved(plan,{updateTime=UPDATE,claimTime=TIME}={}){
 const w=plan.request.body.writes[0].update;
 return {name:w.name,fields:{
  ...structuredClone(w.fields),claimedAt:{timestampValue:claimTime}
 },updateTime};
}
const make=()=>planReplayClaim({replayKey:KEY,claimedAt:TIME});
function safe(result){
 assert.equal(result.retryAllowed,false);
 assert.equal(result.writeAllowed,false);
 assert.equal(result.deliveryAllowed,false);
 assert.equal(Object.isFrozen(result),true);
}
test('single replay claim uses dedicated quarantine DB/collection and atomic exists:false precondition',()=>{
 const p=make();
 assert.equal(COLLECTION,'lszh_quarantine_handoff_replay_staging');
 assert.equal(p.status,'OFFLINE_CLAIM_PLAN_ONLY');
 assert.equal(p.request.method,'POST');
 assert.equal(p.request.url,'https://firestore.googleapis.com/v1/projects/lszh-automations/databases/lszh-quarantine-staging/documents:commit');
 assert.equal(p.request.body.writes.length,1);
 const w=p.request.body.writes[0];
 assert.equal(w.update.name,ROOT+COLLECTION+'/'+KEY);
 assert.deepEqual(w.currentDocument,{exists:false});
 assert.equal(w.update.fields.replayKey.stringValue,KEY);
 assert.equal(w.update.fields.state.stringValue,'CLAIMED_PENDING_MANUAL_REVIEW');
 assert.equal(w.update.fields.claimedAt.timestampValue,TIME);
 assert.equal('email' in w.update.fields,false);
 assert.equal('recipient' in w.update.fields,false);
 assert.equal('reviewStatus' in w.update.fields,false);
 safe(p);
});
test('valid ack alone is never success, independent document readback and updateTime required',()=>{
 const p=make();
 for(const partial of [
  {commitStatus:200,commitResponse:receipt(),readStatus:undefined},
  {commitStatus:200,commitResponse:receipt(),readStatus:404},
  {commitStatus:200,commitResponse:receipt(),readStatus:403},
  {commitStatus:200,commitResponse:receipt(),readStatus:200,document:null}
 ]){
  const result=verifiedReplayClaim({plan:p,...partial});
  assert.equal(result.status,'BLOCKED_NO_REPLAY_CLAIM');
  safe(result);
 }
 const verified=verifiedReplayClaim({
  plan:p,commitStatus:200,commitResponse:receipt(),readStatus:200,document:saved(p)
 });
 assert.equal(verified.status,'CLAIM_READBACK_VERIFIED');
 assert.equal(verified.durableReadbackVerified,true);
 safe(verified);
});
test('Firestore fractional timestamp canonicalization allows equivalent versions and milliseconds',()=>{
 const p=make();
 const good=verifiedReplayClaim({
  plan:p,commitStatus:200,commitResponse:receipt('2026-10-17T16:30:01.123456000Z'),
  readStatus:200,document:saved(p,{updateTime:UPDATE,claimTime:'2026-10-17T16:30:00Z'})
 });
 assert.equal(good.status,'CLAIM_READBACK_VERIFIED');
});
test('duplicate create and ambiguous commit are blocked permanently without retry',()=>{
 const p=make();
 for(const status of [0,401,403,409,412,429,500,503,undefined]){
  const r=verifiedReplayClaim({plan:p,commitStatus:status,readStatus:200,
   commitResponse:receipt(),document:saved(p)});
  assert.equal(r.status,'BLOCKED_NO_REPLAY_CLAIM');
  assert.equal(r.reason,'CLAIM_FAILED_OR_UNCERTAIN');
  safe(r);
 }
});
test('tampered name, schema, nonce hash, flags and extra fields fail independent verification',()=>{
 const p=make(),valid=saved(p);
 const examples=[
  {...valid,name:valid.name.replace('lszh-quarantine-staging','lszh-offers-staging')},
  {...valid,name:valid.name+'-other'},
  {...valid,fields:{...valid.fields,replayKey:{stringValue:'f'.repeat(64)}}},
  {...valid,fields:{...valid.fields,recipient:{stringValue:'user@example.invalid'}}},
  {...valid,fields:{...valid.fields,state:{stringValue:'DONE'}}},
  {...valid,fields:{...valid.fields,schemaVersion:{integerValue:'2'}}},
  {...valid,fields:{...valid.fields,claimedAt:{timestampValue:'2026-10-17T16:30:00.001Z'}}}
 ];
 for(const doc of examples){
  const r=verifiedReplayClaim({plan:p,commitStatus:200,
   commitResponse:receipt(),readStatus:200,document:doc});
  assert.equal(r.status,'BLOCKED_NO_REPLAY_CLAIM');
  safe(r);
 }
});
test('different microsecond version or malformed acknowledgment cannot be treated as same claim',()=>{
 const p=make();
 for(const receiptData of [
  null,{},{writeResults:[]},{writeResults:[{}],commitTime:UPDATE},
  {writeResults:[{updateTime:'2026-02-30T12:00:00Z'}],commitTime:UPDATE},
  {writeResults:[{updateTime:UPDATE},{updateTime:UPDATE}],commitTime:UPDATE}
 ]){
  const result=verifiedReplayClaim({plan:p,commitStatus:200,
   commitResponse:receiptData,readStatus:200,document:saved(p)});
  assert.equal(result.status,'BLOCKED_NO_REPLAY_CLAIM');
  safe(result);
 }
 for(const update of ['2026-10-17T16:30:01.123457Z','2026-10-17T16:30:01.123456789Z']){
  const result=verifiedReplayClaim({plan:p,commitStatus:200,
   commitResponse:receipt(),readStatus:200,
   document:saved(p,{updateTime:update})});
  assert.equal(result.status,'BLOCKED_NO_REPLAY_CLAIM');
 }
});
test('calendar-invalid claim timestamp and IDs cannot create a plan',()=>{
 for(const time of ['2026-02-30T16:00:00.000Z',
   '2026-10-17T25:30:00.000Z','2026-10-17T16:30:00Z',
   '2026-10-17T16:30:00.123456Z',null]){
  assert.throws(()=>planReplayClaim({replayKey:KEY,claimedAt:time}),
   /replay_claim_time_invalid/);
 }
 for(const replayKey of [null,'bad','../',KEY.toUpperCase(),'f'.repeat(63)]){
  assert.throws(()=>planReplayClaim({replayKey,claimedAt:TIME}),
   /replay_claim_key_invalid/);
 }
});
test('synthetic atomic two-actor race permits only one create and no overwrite',()=>{
 const p=make(), db=new Map();
 const attempt=()=> {
  const write=p.request.body.writes[0];
  if(write.currentDocument.exists===false&&db.has(write.update.name))return 409;
  db.set(write.update.name,saved(p));
  return 200;
 };
 assert.equal(attempt(),200);
 assert.equal(attempt(),409);
 assert.equal(db.size,1);
 assert.equal(verifiedReplayClaim({plan:p,commitStatus:409}).status,'BLOCKED_NO_REPLAY_CLAIM');
});
test('no TTL auto-expiration, broad IAM, DELETE or executable Firestore transport',()=>{
 const m=require('./quarantine-handoff-replay-cas');
 assert.deepEqual(Object.keys(m).sort(),[
  'COLLECTION','planReplayClaim','verifiedReplayClaim'
 ]);
 const p=make();
 const blob=JSON.stringify(p);
 for(const text of ['expiresAt','ttl','DELETE','roles/datastore.user',
  'lszh-offers-staging','Bearer ','email','recipient','@']){
  assert.equal(blob.includes(text),false,text);
 }
 for(const name of ['claimOnce','fetch','run','server','commit','delete','send','write']){
  assert.equal(name in m,false);
 }
});
