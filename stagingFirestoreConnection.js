'use strict';
// Isolated SDK constructor; NOT imported by the website or active Cloud Run services.
// No network, reads, writes, IAM changes or Firestore documents at module load.
const {TARGET,COLLECTION}=require('./stagingOfferSchema');
const ALLOWED_SERVICE='lszh-offer-acceptance-staging'; // planned NEW service, not existing preflight
const HOST_RE=/^(localhost|127\.0\.0\.1|\[::1\]):([1-9][0-9]{1,4})$/;
class StagingConfigError extends Error {
  constructor(){super('staging_connection_not_configured');this.name='StagingConfigError';}
}
function ensure(ok){if(!ok)throw new StagingConfigError();}
function validateSettings(env,mode){
  ensure(mode==='cloud-run'||mode==='emulator');
  ensure(env.LSZH_FIRESTORE_PROJECT_ID===TARGET.projectId);
  ensure(env.LSZH_FIRESTORE_DATABASE_ID===TARGET.databaseId);
  // No private-key files or credentials embedded in the deployment.
  ensure(!env.GOOGLE_APPLICATION_CREDENTIALS&&!env.GOOGLE_CLOUD_KEYFILE_JSON);
  if(mode==='cloud-run'){
    ensure(env.K_SERVICE===ALLOWED_SERVICE&&env.GOOGLE_CLOUD_PROJECT===TARGET.projectId);
    ensure(!env.FIRESTORE_EMULATOR_HOST);
    // Deliberate 'disabled' gate: this module cannot authorize writes.
    ensure(env.LSZH_FIRESTORE_STAGING_WRITE_ENABLED!=='true');
  }else{
    // Emulator runs only on loopback, not public or remote host.
    const m=HOST_RE.exec(env.FIRESTORE_EMULATOR_HOST||'');
    ensure(m && Number(m[2])<=65535);
    ensure(env.LSZH_STAGING_EMULATOR_TEST==='yes');
    ensure(!env.K_SERVICE);
  }
  return Object.freeze({projectId:TARGET.projectId,databaseId:TARGET.databaseId,
    collection:COLLECTION,mode,writeAuthorized:false});
}
function createStagingFirestoreConnection({Firestore,env=process.env,mode='cloud-run'}={}){
  // Preconditions are evaluated BEFORE requiring an SDK or creating the client.
  const settings=validateSettings(env,mode);
  const Ctor=Firestore||require('@google-cloud/firestore').Firestore;
  ensure(typeof Ctor==='function');
  const db=new Ctor({projectId:settings.projectId,databaseId:settings.databaseId});
  // The SDK constructor alone does not verify remote IAM or actual connectivity.
  return {db,settings,connected:false};
}
module.exports={ALLOWED_SERVICE,StagingConfigError,validateSettings,createStagingFirestoreConnection};
