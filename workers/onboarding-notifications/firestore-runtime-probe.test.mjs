import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {run}=require('./firestore-runtime-probe');
const env={
  LSZH_FIRESTORE_READ_PROBE_ONLY:'true',
  FIRESTORE_PROJECT_ID:'lszh-automations',
  FIRESTORE_DATABASE_ID:'lszh-offers-staging'
};
const base='https://firestore.googleapis.com/v1/projects/lszh-automations/databases/lszh-offers-staging';
const absent=base+'/documents/lszh_onboarding_notification_drafts_staging/lszh_readonly_probe_no_document_created_20261016';
function mock({metadataCode=200,dbCode=200,docCode=404}={}) {
  const urls=[],logs=[];
  const fetchImpl=async (address,options)=>{
    urls.push({address,method:options.method});
    assert.equal(options.method,'GET');
    if(address.startsWith('http://metadata.google.internal/')){
      assert.equal(options.headers['Metadata-Flavor'],'Google');
      return {ok:metadataCode===200,status:metadataCode,json:async()=>({access_token:'synthetic-token-has-no-value'})};
    }
    assert.equal(options.headers.Authorization,'Bearer synthetic-token-has-no-value');
    if(address===base)return {status:dbCode};
    if(address===absent)return {status:docCode};
    throw Error('unexpected address');
  };
  return {fetchImpl,urls,logs,log:(m)=>logs.push(m)};
}
test('explicit, read-only job makes exactly 3 GETs including metadata identity',async()=>{
  const m=mock();
  assert.equal(await run({...m,env}),true);
  assert.deepEqual(m.urls.map(x=>x.address),[
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    base,absent
  ]);
  assert.deepEqual(m.urls.map(x=>x.method),['GET','GET','GET']);
  assert.doesNotMatch(m.logs.join(' '),/synthetic-token-has-no-value/);
});
test('without approval flag, performs no network calls',async()=>{
  const m=mock();
  await assert.rejects(run({...m,env:{...env,LSZH_FIRESTORE_READ_PROBE_ONLY:'false'}}),/disabled/);
  assert.equal(m.urls.length,0);
});
test('unexpected Firestore database is blocked before any credential request',async()=>{
  const m=mock();
  await assert.rejects(run({...m,env:{...env,FIRESTORE_DATABASE_ID:'(default)'}}),/disabled/);
  assert.equal(m.urls.length,0);
});
test('metadata identity failure does not call Firestore',async()=>{
  const m=mock({metadataCode:503});
  await assert.rejects(run({...m,env}),/metadata_identity_unavailable/);
  assert.equal(m.urls.length,1);
});
test('Firestore IAM error fails closed without document GET',async()=>{
  const m=mock({dbCode:403});
  await assert.rejects(run({...m,env}),/metadata_read_denied/);
  assert.equal(m.urls.length,2);
});
test('existing probe-document is not accepted as success',async()=>{
  const m=mock({docCode:200});
  await assert.rejects(run({...m,env}),/absent_document_get_unverified/);
  assert.equal(m.urls.length,3);
});
test('document-level permission rejection fails closed',async()=>{
  const m=mock({docCode:403});
  await assert.rejects(run({...m,env}),/absent_document_get_unverified/);
});
