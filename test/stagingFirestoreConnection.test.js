'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createStagingFirestoreConnection,StagingConfigError,ALLOWED_SERVICE}=require('../stagingFirestoreConnection');
let calls=0;
class FakeFirestore { constructor(options){calls++;this.options=options;} }
const cloud={K_SERVICE:ALLOWED_SERVICE,GOOGLE_CLOUD_PROJECT:'lszh-automations',
  LSZH_FIRESTORE_PROJECT_ID:'lszh-automations',LSZH_FIRESTORE_DATABASE_ID:'lszh-offers-staging'};
const emulator={LSZH_FIRESTORE_PROJECT_ID:'lszh-automations',
  LSZH_FIRESTORE_DATABASE_ID:'lszh-offers-staging',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',
  LSZH_STAGING_EMULATOR_TEST:'yes'};
function rejects(options){
  const before=calls;
  assert.throws(()=>createStagingFirestoreConnection({Firestore:FakeFirestore,...options}),StagingConfigError);
  assert.equal(calls,before,'SDK must never be initialized with invalid config');
}
test('defaults shut: no Google Cloud configuration opens Firestore',()=>rejects({env:{}}));
test('service misidentification and wrong project/db reject before SDK construction',()=>{
  for(const patch of [{K_SERVICE:'lszh-offer-portal-staging'},
    {GOOGLE_CLOUD_PROJECT:'different-project'},
    {LSZH_FIRESTORE_PROJECT_ID:'lszh-offers-staging'},
    {LSZH_FIRESTORE_DATABASE_ID:'(default)'},
    {LSZH_FIRESTORE_DATABASE_ID:'lszh-automations'},
    {GOOGLE_APPLICATION_CREDENTIALS:'/tmp/key.json'},
    {GOOGLE_CLOUD_KEYFILE_JSON:'danger'},
    {FIRESTORE_EMULATOR_HOST:'evil:8080'},
    {LSZH_FIRESTORE_STAGING_WRITE_ENABLED:'true'}])
      rejects({env:{...cloud,...patch}});
});
test('cloud-run constructor selects exact named database; no IO and no writes',()=>{
  const {db,settings,connected}=createStagingFirestoreConnection({Firestore:FakeFirestore,env:cloud});
  assert.deepEqual(db.options,{projectId:'lszh-automations',databaseId:'lszh-offers-staging'});
  assert.equal(settings.collection,'stagingOfferFixtures');
  assert.equal(settings.writeAuthorized,false);assert.equal(connected,false);
});
test('emulator mode accepts only loopback, requires explicit simulation flag',()=>{
  for(const host of ['evil.com:8080','0.0.0.0:8080','10.0.0.10:8080','localhost:99999','local:8080'])
    rejects({mode:'emulator',env:{...emulator,FIRESTORE_EMULATOR_HOST:host}});
  rejects({mode:'emulator',env:{...emulator,LSZH_STAGING_EMULATOR_TEST:'no'}});
  rejects({mode:'emulator',env:{...emulator,K_SERVICE:'lszh-offer-acceptance-staging'}});
  const {db,settings}=createStagingFirestoreConnection({Firestore:FakeFirestore,mode:'emulator',env:emulator});
  assert.deepEqual(db.options,{projectId:'lszh-automations',databaseId:'lszh-offers-staging'});
  assert.equal(settings.mode,'emulator');assert.equal(settings.writeAuthorized,false);
});
test('no privileged method exposed by the connection wrapper',()=>{
  const c=createStagingFirestoreConnection({Firestore:FakeFirestore,env:cloud});
  assert.deepEqual(Object.keys(c).sort(),['connected','db','settings']);
  assert.equal(c.commit,undefined);
  assert.equal(c.createDocument,undefined);
});
