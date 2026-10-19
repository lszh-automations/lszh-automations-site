// Configuration is intentionally pinned to a separate staging Cloud Run
// identity + named Firestore database. No implicit (default) database fallback.
export const STAGING={
  projectId:'lszh-automations',
  service:'lszh-offer-portal-staging',
  serviceEmail:'lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com',
  databaseId:'lszh-offers-staging',
  region:'europe-west6',
  firestoreHost:'firestore.europe-west6.rep.googleapis.com',
  // The four verified TEST_ONLY PDFs are direct children of this business subfolder.
  // Do not point the staging verifier at their parent archive folder.
  archiveFolderId:'10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko',
  termsVersion:'TEST_v1.0_RC1'
};
export const BROWSER_PILOT={
  service:'lszh-offer-browser-staging',
  sourceRecordId:'recensIiczNGsoPeR',
  avvSourceRecordId:'recktLXj5wUxLmHFQ',
  origins:[
    'https://lszh-offer-browser-staging-ozx7mp2bka-oa.a.run.app',
    'https://cloud-e2e---lszh-offer-browser-staging-ozx7mp2bka-oa.a.run.app'
  ]
};
const IS_URL=/^https:\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::443)?$/;
export function stagingConfig(env={}){
  if(env.LSZH_PORTAL_STAGING_ENABLED!=='true')return {enabled:false};
  // A copied config must not accidentally enable this code on Render, local
  // developer machines, the LSZH marketing site or another Cloud Run service.
  const browserPilot=env.LSZH_PORTAL_BROWSER_PILOT_ENABLED==='true';
  const expectedService=browserPilot?BROWSER_PILOT.service:STAGING.service;
  const revisionPattern=browserPilot?
    /^lszh-offer-browser-staging-\d{5}-[a-z0-9]+$/:
    /^lszh-offer-portal-staging-\d{5}-[a-z0-9]+$/;
  if(env.K_SERVICE!==expectedService ||
     !revisionPattern.test(String(env.K_REVISION||'')) ||
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
     (browserPilot?!BROWSER_PILOT.origins.includes(u):
     (url.hostname!=='lszh-offer-portal-staging-'+
       '470613067122.europe-west6.run.app' &&
      url.hostname!=='lszh-offer-portal-staging-ozx7mp2bka-oa.a.run.app' &&
      url.hostname!=='portal-staging.lszh-automations.ch')))
    throw Error('staging_origin_invalid');
  // Explicit single secret, never check into GitHub.
  const salt=String(env.LSZH_PORTAL_PROOF_SALT||'');
  if(salt.length<32 || salt.length>256 || /test|fake|example|placeholder/i.test(salt))
    throw Error('staging_salt_invalid');
  // Single-offer staging pilot is opt-in; default and static demo stay off.
  const acceptEnabled=env.LSZH_PORTAL_SYNTHETIC_ACCEPT_ENABLED==='true';
  let sourceRecordId;
  if(acceptEnabled){
    sourceRecordId=String(env.LSZH_PORTAL_SYNTHETIC_SOURCE_RECORD_ID||'');
    if(!/^rec[A-Za-z0-9]{14}$/.test(sourceRecordId) ||
       env.LSZH_SYNTHETIC_AIRTABLE_WRITEBACK_ENABLED!=='true')
      throw Error('staging_synthetic_accept_config_invalid');
  }
  const internalPilot=env.LSZH_INTERNAL_TEST_PILOT_ENABLED==='true';
  if(internalPilot && (!browserPilot || !acceptEnabled ||
     [BROWSER_PILOT.sourceRecordId,BROWSER_PILOT.avvSourceRecordId].includes(sourceRecordId)))
    throw Error('staging_internal_pilot_invalid');
  if(browserPilot && (!acceptEnabled ||
     (!internalPilot && ![BROWSER_PILOT.sourceRecordId,BROWSER_PILOT.avvSourceRecordId].includes(sourceRecordId)) ||
     env.LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED==='true' ||
     env.LSZH_OFFER_TEMP_DRIVE_PROBE_ENABLED==='true'))
    throw Error('staging_browser_pilot_invalid');
  return {enabled:true,origin:u,proofSalt:salt,
    ...(browserPilot?{browserPilot:true}:{}),
    ...(internalPilot?{internalPilotRecordId:sourceRecordId}:{}),
    acceptEnabled, ...(acceptEnabled?{sourceRecordId}:{})};
}
