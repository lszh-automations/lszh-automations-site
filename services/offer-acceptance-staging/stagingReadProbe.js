'use strict';
// Experimental read-only, internal Cloud Run STAGING connectivity proof.
// No public customer API; no writes, no transactions, no secrets or key files.
// Not deployed. Only explicitly activated on the dedicated approved service.
const {createStagingFirestoreConnection,ALLOWED_SERVICE}=
  require('../../stagingFirestoreConnection');
const {TARGET}=require('../../stagingOfferSchema');
const PROBE_PATH='/__internal/staging/firestore-read';
const PROBE_FIXTURE_ID='LSZH-STAGING-20261015-001';
const READER_SERVICE_ACCOUNT=
  'lszh-offer-reader@lszh-automations.iam.gserviceaccount.com';

function isReadProbeRuntime(env=process.env){
 return env.NODE_ENV==='production'&&
   env.K_SERVICE===ALLOWED_SERVICE&&
   typeof env.K_REVISION==='string'&&
   env.K_REVISION.startsWith(ALLOWED_SERVICE+'-')&&
   env.GOOGLE_CLOUD_PROJECT===TARGET.projectId&&
   env.LSZH_FIRESTORE_PROJECT_ID===TARGET.projectId&&
   env.LSZH_FIRESTORE_DATABASE_ID===TARGET.databaseId&&
   env.LSZH_STAGING_READ_PROBE_ENABLED==='yes'&&
   env.LSZH_FIRESTORE_STAGING_WRITE_ENABLED!=='true'&&
   !env.FIRESTORE_EMULATOR_HOST&&
   !env.GOOGLE_APPLICATION_CREDENTIALS&&
   !env.GOOGLE_CLOUD_KEYFILE_JSON;
}
function createStagingReadProbe({Firestore,env=process.env}={}){
 if(!isReadProbeRuntime(env))throw Error('staging_read_probe_disabled');
 const reader=createStagingFirestoreConnection({Firestore,env,mode:'cloud-run'});
 // A GET of one fixed synthetic fixture path can succeed even when the
 // collection is empty. Never return document content or arbitrary record IDs.
 return async function stagingReadProbe(){
  const snapshot=await reader.readFixture(PROBE_FIXTURE_ID);
  return Object.freeze({reachable:true,fixtureExists:snapshot.exists===true});
 };
}
module.exports={PROBE_PATH,PROBE_FIXTURE_ID,READER_SERVICE_ACCOUNT,
 isReadProbeRuntime,createStagingReadProbe};
