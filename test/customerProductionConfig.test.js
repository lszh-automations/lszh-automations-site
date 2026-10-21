'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
test('customer portal remains hard-disabled without explicit launch',async()=>{
 const {productionConfig}=await import('../cloud-run/offer-portal-production/productionConfig.mjs');
 assert.deepEqual(productionConfig({}),{enabled:false});
});
test('customer runtime checks service, business Drive, origin, approved version and secrets',async()=>{
 const {productionConfig,CUSTOMER_RUNTIME:I}=await import('../cloud-run/offer-portal-production/productionConfig.mjs');
 const valid={
  LSZH_PORTAL_PRODUCTION_ENABLED:'true',
  K_SERVICE:I.service,K_REVISION:'lszh-offer-portal-00001-a1b2',
  GOOGLE_CLOUD_PROJECT:I.projectId,
  LSZH_PORTAL_DATABASE:I.databaseId,
  LSZH_PORTAL_BUSINESS_ARCHIVE_FOLDER:I.archiveFolderId,
  LSZH_PORTAL_ORIGIN:I.origin,
  LSZH_PORTAL_TERMS_VERSION:'v1.0',
  LSZH_PORTAL_PROOF_SALT:'a'.repeat(48),
  LSZH_AIRTABLE_ACCESS_TOKEN:'synthetic-no-secret-token'
 };
 const ready=productionConfig(valid);
 assert.equal(ready.enabled,true);
 assert.equal(ready.acceptEnabled,true);
 assert.equal(ready.origin,'https://portal.lszh-automations.ch');
 for(const [key,value] of [
  ['K_SERVICE','lszh-offer-browser-staging'],
  ['LSZH_PORTAL_DATABASE','lszh-offers-staging'],
  ['LSZH_PORTAL_BUSINESS_ARCHIVE_FOLDER','10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko'],
  ['LSZH_PORTAL_ORIGIN','https://lszh-automations.ch'],
  ['LSZH_PORTAL_TERMS_VERSION','TEST_v1.0_RC1'],
  ['LSZH_PORTAL_PROOF_SALT','short'],
  ['LSZH_AIRTABLE_ACCESS_TOKEN','short']
 ])assert.throws(()=>productionConfig({...valid,[key]:value}));
 const preview=productionConfig({...valid,LSZH_PORTAL_PRODUCTION_ENABLED:'false',LSZH_PORTAL_PREVIEW_ENABLED:'true',LSZH_AIRTABLE_ACCESS_TOKEN:''});
 assert.equal(preview.enabled,true);
 assert.equal(preview.acceptEnabled,false);
 assert.equal(preview.airtableAccessToken,'');
});
