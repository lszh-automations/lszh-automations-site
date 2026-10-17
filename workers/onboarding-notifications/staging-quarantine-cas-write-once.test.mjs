import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {run,FLAG}=require('./staging-quarantine-cas-write-once');
const {PROJECT,DATABASE,COLLECTION}=require('./quarantine-cas-offline-cycle');
const ID='d'.repeat(64),SECRET='SYNTHETIC_TOKEN_NOT_FOR_LIVE_ONLY_'.repeat(3);
const CONFIG=Object.freeze({[FLAG]:'true',LSZH_OUTBOX_STAGE_ENABLED:'false'});
const DOC='projects/'+PROJECT+'/databases/'+DATABASE+'/documents/'+COLLECTION+'/'+ID;
const URL='https://firestore.googleapis.com/v1/'+DOC;
const COMMIT='https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/'+DATABASE+'/documents:commit';
const BASE='2026-10-17T15:30:00.000Z';
function response(status,body={}) {
 return {status,text:async()=>JSON.stringify(body)};
}
function harness({initialOccupied=false,failAt=null,finalMismatch=false,
                    statusOverride=null}={}){
 const calls=[],logs=[],times=[
   '2026-10-17T15:30:02.123456Z','2026-10-17T15:30:03.456789Z'
 ];
 let doc=initialOccupied?{name:DOC,fields:{invalid:true},
    updateTime:'2026-10-17T15:29:00.000Z'}:null;
 let commits=0,gets=0;
 const fetchImpl=async(url,o)=>{
  const method=o.method;calls.push({url,method,body:o.body,headers:o.headers,redirect:o.redirect});
  assert.equal(o.redirect,'manual');
  assert.equal(o.headers.Authorization,'Bearer '+SECRET);
  assert.ok(url===URL || url===COMMIT);
  if(statusOverride && calls.length===statusOverride.at)
   return response(statusOverride.status);
  if(failAt===calls.length)throw Error('network timeout secret_not_printed');
  if(method==='GET'){
   assert.equal(url,URL);
   gets++;
   if(!doc)return response(404);
   if(finalMismatch && gets===3)return response(200,{
    ...doc,fields:{...doc.fields,deliveryAllowed:{booleanValue:true}}
   });
   const read=structuredClone(doc);
   if(read.fields?.events?.arrayValue?.values){
    for(const item of read.fields.events.arrayValue.values){
     const field=item.mapValue.fields.reviewedAt;
     if(field.timestampValue.endsWith('.000Z'))
      field.timestampValue=field.timestampValue.replace('.000Z','Z');
    }
   }
   return response(200,read);
  }
  assert.equal(method,'POST');
  assert.equal(url,COMMIT);
  const value=JSON.parse(o.body);
  assert.equal(value.writes.length,1);
  const w=value.writes[0];
  assert.equal(w.update.name,DOC);
  assert.equal(w.update.fields.deliveryAllowed.booleanValue,false);
  assert.equal(w.update.fields.requiresManualApproval.booleanValue,true);
  if(w.currentDocument.exists===false && doc)return response(409);
  if(w.currentDocument.updateTime && (!doc ||
     w.currentDocument.updateTime!==doc.updateTime))return response(412);
  const updateTime=times[commits]??'2026-10-17T15:30:04.000Z';
  commits++;
  doc={name:DOC,fields:structuredClone(w.update.fields),updateTime};
  return response(200,{writeResults:[{updateTime}],commitTime:updateTime});
 };
 const state={
 env:CONFIG,fetchImpl,tokenProvider:()=>SECRET,nonceFactory:()=>ID,
 now:(()=>{let n=0;return ()=>n++===0?BASE:'2026-10-17T15:30:01.000Z';})(),
 log:x=>logs.push(x)
 };
 return {state,calls,logs,read:()=>structuredClone(doc),getCounts:()=>({commits,gets})};
}
test('disabled without both exact staging flags makes no credential or network calls',async()=>{
 let called=0;
 const x=harness();
 await assert.rejects(run({...x.state,env:{[FLAG]:'true'},
  tokenProvider:()=>{called++;throw Error('unexpected token');}}),
 /synthetic_cas_write_disabled/);
 assert.equal(called,0);assert.equal(x.calls.length,0);
});
test('exact two preconditioned Firestore CAS commits and three GETs; retained revision 2',async()=>{
 const x=harness();
 const result=await run(x.state);
 assert.equal(result.completed,true);
 assert.equal(result.revision,2);
 assert.equal(result.deliveryAllowed,false);
 assert.equal(result.draftId,ID);
 assert.deepEqual(x.calls.map(c=>c.method),['GET','POST','GET','POST','GET']);
 assert.deepEqual(x.calls.map(c=>c.url),[URL,COMMIT,URL,COMMIT,URL]);
 assert.equal(x.getCounts().commits,2);
 assert.equal(x.getCounts().gets,3);
 const first=JSON.parse(x.calls[1].body).writes[0];
 const second=JSON.parse(x.calls[3].body).writes[0];
 assert.deepEqual(first.currentDocument,{exists:false});
 assert.deepEqual(second.currentDocument,{updateTime:'2026-10-17T15:30:02.123456Z'});
 assert.equal(first.update.fields.revision.integerValue,'1');
 assert.equal(second.update.fields.revision.integerValue,'2');
 assert.equal(x.read().fields.state.stringValue,'QUARANTINED_REQUIRES_MANUAL_RESOLUTION');
 assert.equal(x.read().fields.deliveryAllowed.booleanValue,false);
 assert.equal(x.read().fields.requiresManualApproval.booleanValue,true);
 assert.equal(x.logs.filter(s=>s.includes('PASS:')).length,3);
 assert.ok(x.logs.some(s=>s.includes('FIXTURE_ID: '+ID)));
 assert.ok(x.logs.some(s=>s.includes('No automatic deletion')));
 assert.doesNotMatch(x.logs.join(' '),new RegExp(SECRET));
});
test('if random document already exists, never overwrite',async()=>{
 const x=harness({initialOccupied:true});
 await assert.rejects(run(x.state),/initial_absence_not_verified/);
 assert.deepEqual(x.calls.map(c=>c.method),['GET']);
 assert.equal(x.getCounts().commits,0);
});
test('bad HTTP GET 403 fails closed before any commit',async()=>{
 const x=harness({statusOverride:{at:1,status:403}});
 await assert.rejects(run(x.state),/initial_absence_not_verified/);
 assert.equal(x.getCounts().commits,0);
});
test('failed first commit is not retried or mistaken for successful persistence',async()=>{
 const x=harness({statusOverride:{at:2,status:409}});
 await assert.rejects(run(x.state),/create_commit_not_acknowledged/);
 assert.deepEqual(x.calls.map(c=>c.method),['GET','POST']);
});
test('lost create acknowledgement leaves possibly persisted synthetic case and stops',async()=>{
 const x=harness({failAt:2});
 await assert.rejects(run(x.state),/network timeout/);
 assert.deepEqual(x.calls.map(c=>c.method),['GET','POST']);
 assert.equal(x.getCounts().commits,0);
});
test('failed first readback prevents update and never retries',async()=>{
 const x=harness({statusOverride:{at:3,status:503}});
 await assert.rejects(run(x.state),/create_readback_not_verified/);
 assert.deepEqual(x.calls.map(c=>c.method),['GET','POST','GET']);
 assert.equal(x.getCounts().commits,1);
});
test('failed update commit is never retried',async()=>{
 const x=harness({statusOverride:{at:4,status:412}});
 await assert.rejects(run(x.state),/update_commit_not_acknowledged/);
 assert.deepEqual(x.calls.map(c=>c.method),['GET','POST','GET','POST']);
 assert.equal(x.getCounts().commits,1);
});
test('tampered final readback cannot report success and never attempts DELETE',async()=>{
 const x=harness({finalMismatch:true});
 await assert.rejects(run(x.state),/update_readback_not_verified/);
 assert.deepEqual(x.calls.map(c=>c.method),['GET','POST','GET','POST','GET']);
 assert.equal(x.getCounts().commits,2);
 assert.equal(x.calls.some(c=>c.method==='DELETE'),false);
});
test('wrong synthetic nonce fails before credential mint',async()=>{
 let tokenCalls=0;
 const x=harness();
 await assert.rejects(run({...x.state,nonceFactory:()=>ID.toUpperCase(),
  tokenProvider:()=>{tokenCalls++;return SECRET;}}),/synthetic_fixture_id_invalid/);
 assert.equal(tokenCalls,0);
 assert.equal(x.calls.length,0);
});
test('no external transport or customer data connected to static test payload',async()=>{
 const x=harness();
 await run(x.state);
 for(const call of x.calls){
  assert.equal(call.headers.Authorization,'Bearer '+SECRET);
  assert.equal(call.url.includes('lszh-offers-staging'),false);
  assert.equal(call.url.includes('lszh-quarantine-staging'),true);
  assert.equal(call.method==='DELETE',false);
  if(call.body)for(const banned of ['email','recipient','@','pat_','Bearer','approvalToken'])
   assert.equal(call.body.includes(banned),false,banned);
 }
});
