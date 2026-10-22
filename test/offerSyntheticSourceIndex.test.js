'use strict';
// Offline-only checks; new index cannot connect to real Firestore or Make.
const test=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../cloud-run/offer-portal-staging/syntheticSourceIndex.mjs');
const RECORD='rec12345678901234';
test('synthetic source index identity is stable and scoped to the pinned base/table',async()=>{
  const {syntheticSourceIndexId,SYNTHETIC_SOURCE_INDEX}=await load();
  assert.equal(SYNTHETIC_SOURCE_INDEX,'lszh_staging_source_index_v1');
  const one=syntheticSourceIndexId(RECORD);
  assert.match(one,/^[a-f0-9]{64}$/);
  assert.equal(one,syntheticSourceIndexId(RECORD));
  assert.notEqual(one,syntheticSourceIndexId('rec00000000000000'));
  assert.equal(one.includes(RECORD),false);
  for(const id of [undefined,null,RECORD+'X','rec123','real-customer',{}])
    assert.throws(()=>syntheticSourceIndexId(id),/synthetic_source_invalid/);
});
test('indexed seed and Make lookup cannot contact live Google Cloud',async()=>{
  const {registerSyntheticSourceLocalEmulator,
    resolveAndReserveSyntheticMakeLocalEmulator}=await load();
  let access=0;
  const db={
    projectId:'lszh-automations',databaseId:'lszh-offers-staging',
    collection(){access++;throw Error('must not touch collection');},
    runTransaction(){access++;throw Error('must not transact');}
  };
  await assert.rejects(()=>registerSyntheticSourceLocalEmulator(db,{
    source:{recordId:RECORD}
  }),/local_emulator_required/);
  await assert.rejects(()=>resolveAndReserveSyntheticMakeLocalEmulator(
    db,{sourceRecordId:RECORD},new Date()),/local_emulator_required/);
  assert.equal(access,0);
});
test('bad or missing indexed source cannot accidentally derive token ID',async()=>{
  const {resolveAndReserveSyntheticMakeLocalEmulator}=await load();
  const out=String(resolveAndReserveSyntheticMakeLocalEmulator);
  assert.ok(!out.includes('getDocuments('));
  assert.ok(!out.includes('where('));
  assert.ok(!out.includes('Bearer '));
});
