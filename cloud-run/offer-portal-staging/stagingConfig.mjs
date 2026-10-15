// Configuration is intentionally pinned to a separate staging Cloud Run
// identity + named Firestore database. No implicit (default) database fallback.
export const STAGING={
  projectId:'lszh-automations',
  service:'lszh-offer-portal-staging',
  serviceEmail:'lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com',
  databaseId:'lszh-offers-staging',
  region:'europe-west6',
  firestoreHost:'firestore.europe-west6.rep.googleapis.com',
  archiveFolderId:'1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in',
  termsVersion:'TEST_v1.0_RC1'
};
const IS_URL=/^https:\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::443)?$/;
export function stagingConfig(env={}){
  if(env.LSZH_PORTAL_STAGING_ENABLED!=='true')return {enabled:false};
  // A copied config must not accidentally enable this code on Render, local
  // developer machines, the LSZH marketing site or another Cloud Run service.
  if(env.K_SERVICE!==STAGING.service ||
     !/^lszh-offer-portal-staging-\d{5}-[a-z0-9]+$/.test(String(env.K_REVISION||'')) ||
     String(env.GOOGLE_CLOUD_PROJECT||env.GCLOUD_PROJECT||'')!==STAGING.projectId ||
     env.FIRESTORE_EMULATOR_HOST || env.GOOGLE_APPLICATION_CREDENTIALS ||
     env.OFFER_DRIVE_SA_B64 || env.OFFER_DRIVE_SA_FILE)
    throw Error('staging_runtime_mismatch');
  if(env.LSZH_PORTAL_DATABASE!==STAGING.databaseId ||
     env.LSZH_PORTAL_ARCHIVE_FOLDER!==STAGING.archiveFolderId ||
     env.LSZH_PORTAL_TERMS_VERSION!==STAGING.termsVersion)
    throw Error('staging_configuration_mismatch');
  const u=String(env.LSZH_PORTAL_ORIGIN||'');
  if(!IS_URL.test(u))throw Error('staging_origin_invalid');
  const url=new URL(u);
  if(url.username||url.password||url.pathname!=='/'||url.search||url.hash ||
     (url.hostname!=='lszh-offer-portal-staging-'+
       '470613067122.europe-west6.run.app' &&
      url.hostname!=='portal-staging.lszh-automations.ch'))
    throw Error('staging_origin_invalid');
  // Explicit single secret, never check into GitHub.
  const salt=String(env.LSZH_PORTAL_PROOF_SALT||'');
  if(salt.length<32 || salt.length>256 || /test|fake|example|placeholder/i.test(salt))
    throw Error('staging_salt_invalid');
  return {enabled:true,origin:u,proofSalt:salt};
}
