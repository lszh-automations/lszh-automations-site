'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const good={
 LSZH_PORTAL_STAGING_ENABLED:'true',
 K_SERVICE:'lszh-offer-portal-staging',K_REVISION:'lszh-offer-portal-staging-00001-syn',
 GOOGLE_CLOUD_PROJECT:'lszh-automations',LSZH_PORTAL_DATABASE:'lszh-offers-staging',
 LSZH_PORTAL_ARCHIVE_FOLDER:'1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in',
 LSZH_PORTAL_TERMS_VERSION:'TEST_v1.0_RC1',
 LSZH_PORTAL_ORIGIN:'https://portal-staging.lszh-automations.ch',
 LSZH_PORTAL_PROOF_SALT:'1234567890ABCDEFRANDOMSTAGING0987654321ABCDE'
};
test('portal is off by default, independent of runtime',async()=>{
 const {stagingConfig}=await import('../cloud-run/offer-portal-staging/stagingConfig.mjs');
 assert.deepEqual(stagingConfig({}),{enabled:false});
 assert.deepEqual(stagingConfig({...good,LSZH_PORTAL_STAGING_ENABLED:'false'}),{enabled:false});
});
test('valid isolated portal staging runtime may be explicitly configured',async()=>{
 const {stagingConfig,STAGING}=await import('../cloud-run/offer-portal-staging/stagingConfig.mjs');
 assert.equal(stagingConfig(good).enabled,true);
 assert.equal(STAGING.projectId,'lszh-automations');
 assert.equal(STAGING.databaseId,'lszh-offers-staging');
 assert.equal(STAGING.region,'europe-west6');
 assert.equal(STAGING.firestoreHost,'firestore.europe-west6.rep.googleapis.com');
 assert.notEqual(STAGING.databaseId,'(default)');
});
test('strict service, project, revision and named-db settings always fail closed',async()=>{
 const {stagingConfig}=await import('../cloud-run/offer-portal-staging/stagingConfig.mjs');
 for(const key of ['K_SERVICE','K_REVISION','GOOGLE_CLOUD_PROJECT','LSZH_PORTAL_DATABASE','LSZH_PORTAL_ARCHIVE_FOLDER','LSZH_PORTAL_TERMS_VERSION']){
  assert.throws(()=>stagingConfig({...good,[key]:'wrong'}),/mismatch/);
  assert.throws(()=>stagingConfig({...good,[key]:undefined}),/mismatch/);
 }
 for(const key of ['GOOGLE_APPLICATION_CREDENTIALS','FIRESTORE_EMULATOR_HOST','OFFER_DRIVE_SA_B64','OFFER_DRIVE_SA_FILE'])
  assert.throws(()=>stagingConfig({...good,[key]:'unsafe'}),/mismatch/);
});
test('origin and proof-salt validation protects staging from accidental enabling',async()=>{
 const {stagingConfig}=await import('../cloud-run/offer-portal-staging/stagingConfig.mjs');
 for(const origin of ['http://portal-staging.lszh-automations.ch','https://evil.invalid',
   'https://portal-staging.lszh-automations.ch/a',
   'https://portal-staging.lszh-automations.ch?code=test',
   'https://person:secret@portal-staging.lszh-automations.ch'])
   assert.throws(()=>stagingConfig({...good,LSZH_PORTAL_ORIGIN:origin}),/origin_invalid/);
 for(const salt of ['','TEST_SALT_ABCDEF12345678901234567890','tiny'])
   assert.throws(()=>stagingConfig({...good,LSZH_PORTAL_PROOF_SALT:salt}),/salt_invalid/);
});
