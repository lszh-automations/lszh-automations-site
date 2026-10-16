import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {run,FLAGS,ID,DOCUMENT_NAME,DRAFT}=require('./firestore-write-probe');
const {toFirestore}=require('./firestore-store');
const address='https://firestore.googleapis.com/v1/'+DOCUMENT_NAME;
const updateTime='2026-10-17T00:01:00.000000Z';
function fake({preexisting=false,failCreate=false,badFields=false,deleteStatus=200,denyGet=false}={}) {
  const calls=[],logs=[];
  let doc=preexisting?{name:DOCUMENT_NAME,fields:toFirestore(DRAFT).fields,updateTime}:null;
  let priorGet=true;
  const fetchImpl=async (url,init)=>{
    calls.push({url:String(url),method:init.method,headers:init.headers,body:init.body});
    if(String(url).startsWith('http://metadata.google.internal/')) {
      assert.equal(init.method,'GET');
      assert.equal(init.headers['Metadata-Flavor'],'Google');
      return {ok:true,json:async()=>({access_token:'SYNTHETIC_ACCESS_TOKEN_NOT_REAL',expires_in:3000})};
    }
    assert.ok(String(url).startsWith('https://firestore.googleapis.com/v1/projects/lszh-automations/databases/lszh-offers-staging/documents/lszh_onboarding_notification_drafts_staging'),String(url));
    assert.equal(init.headers.Authorization,'Bearer SYNTHETIC_ACCESS_TOKEN_NOT_REAL');
    if(init.method==='GET'){
      assert.equal(String(url),address);
      if(denyGet && priorGet)return {status:403,ok:false};
      priorGet=false;
      return doc?{status:200,ok:true,json:async()=>doc}:{status:404,ok:false};
    }
    if(init.method==='POST'){
      assert.ok(String(url).startsWith('https://firestore.googleapis.com/v1/projects/lszh-automations/databases/lszh-offers-staging/documents/lszh_onboarding_notification_drafts_staging?documentId='));
      assert.equal(new URL(String(url)).searchParams.get('documentId'),ID);
      assert.equal(init.headers['Content-Type'],'application/json');
      const body=JSON.parse(init.body);
      assert.deepEqual(body.fields,toFirestore(DRAFT).fields);
      if(failCreate)return {ok:false,status:403};
      if(doc)return {ok:false,status:409};
      doc={name:DOCUMENT_NAME,fields:badFields?{...body.fields,emailSent:{booleanValue:true}}:body.fields,updateTime};
      return {ok:true,status:200,json:async()=>({name:DOCUMENT_NAME})};
    }
    if(init.method==='DELETE'){
      const u=new URL(String(url));
      assert.equal(u.origin+u.pathname,address);
      assert.equal(u.searchParams.get('currentDocument.updateTime'),updateTime);
      if(deleteStatus!==200)return {ok:false,status:deleteStatus};
      doc=null;
      return {ok:true,status:200};
    }
    throw new Error('unexpected method '+init.method);
  };
  return {fetchImpl,calls,logs,log:(msg)=>logs.push(msg),fixture:()=>doc};
}
function methods(m){return m.calls.map(x=>x.method);}
test('explicit synthetic gate: all remote calls blocked if flag missing',async()=>{
  const m=fake();
  await assert.rejects(run({...m,env:{...FLAGS,LSZH_SYNTHETIC_WRITE_PROBE_ONLY:'false'}}),/disabled/);
  assert.equal(m.calls.length,0);
});
test('only named STAGING DB is allowed',async()=>{
  const m=fake();
  await assert.rejects(run({...m,env:{...FLAGS,FIRESTORE_DATABASE_ID:'(default)'}}),/disabled/);
  assert.equal(m.calls.length,0);
});
test('successful write checks exact source fields, deletes same version, confirms 404',async()=>{
  const m=fake();
  assert.equal(await run({...m,env:FLAGS}),true);
  assert.deepEqual(methods(m),['GET','GET','GET','POST','GET','DELETE','GET']);
  assert.equal(m.fixture(),null);
  assert.match(m.logs.join(' '),/WRITE\/READ\/DELETE cycle completed/);
  assert.doesNotMatch(m.logs.join(' '),/SYNTHETIC_ACCESS_TOKEN_NOT_REAL|recZZZZ|updateTime/);
});
test('existing fixture: never overwrite nor delete pre-existing document',async()=>{
  const m=fake({preexisting:true});
  await assert.rejects(run({...m,env:FLAGS}),/not_verified_absent/);
  assert.deepEqual(methods(m),['GET','GET']);
  assert.notEqual(m.fixture(),null);
});
test('403 on preflight never performs POST or DELETE',async()=>{
  const m=fake({denyGet:true});
  await assert.rejects(run({...m,env:FLAGS}),/not_verified_absent/);
  assert.deepEqual(methods(m),['GET','GET']);
});
test('Firestore write permission unavailable: never delete document',async()=>{
  const m=fake({failCreate:true});
  await assert.rejects(run({...m,env:FLAGS}),/draft_persistence_unavailable/);
  assert.ok(methods(m).includes('POST'));
  assert.ok(!methods(m).includes('DELETE'));
  assert.equal(m.fixture(),null);
});
test('unexpected test field mutation refuses DELETE for manual review',async()=>{
  const m=fake({badFields:true});
  await assert.rejects(run({...m,env:FLAGS}),/fields_mismatch/);
  assert.ok(!methods(m).includes('DELETE'));
  assert.notEqual(m.fixture(),null);
});
test('failed conditional delete is not reported as success; remains for review',async()=>{
  const m=fake({deleteStatus:412});
  await assert.rejects(run({...m,env:FLAGS}),/cleanup_unverified/);
  assert.equal(methods(m).filter(x=>x==='DELETE').length,1);
  assert.notEqual(m.fixture(),null);
});
