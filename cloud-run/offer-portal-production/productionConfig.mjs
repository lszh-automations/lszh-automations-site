// Explicit customer runtime configuration. Missing/invalid values fail closed.
// Uses existing business GCP project, but a distinct service identity and Firestore DB.
export const CUSTOMER_RUNTIME=Object.freeze({
  projectId:'lszh-automations',
  service:'lszh-offer-portal',
  serviceEmail:'lszh-offer-portal@lszh-automations.iam.gserviceaccount.com',
  databaseId:'lszh-offers',
  firestoreHost:'firestore.europe-west6.rep.googleapis.com',
  archiveFolderId:'10VD4xYIxfQBJ9Q5wpGq3iflK4MNJ1PHN',
  origin:'https://portal.lszh-automations.ch'
});
export function productionConfig(env={}){
  if(env.LSZH_PORTAL_PRODUCTION_ENABLED!=='true')return {enabled:false};
  const I=CUSTOMER_RUNTIME;
  if(env.K_SERVICE!==I.service||
     !/^lszh-offer-portal-\d{5}-[a-z0-9]+$/.test(String(env.K_REVISION||''))||
     (env.GOOGLE_CLOUD_PROJECT||env.GCLOUD_PROJECT)!==I.projectId||
     env.FIRESTORE_EMULATOR_HOST||
     env.GOOGLE_APPLICATION_CREDENTIALS||env.OFFER_DRIVE_SA_FILE||
     env.OFFER_DRIVE_SA_B64)
    throw Error('customer_runtime_identity_invalid');
  if(env.LSZH_PORTAL_DATABASE!==I.databaseId||
     env.LSZH_PORTAL_BUSINESS_ARCHIVE_FOLDER!==I.archiveFolderId||
     env.LSZH_PORTAL_ORIGIN!==I.origin)
    throw Error('customer_runtime_target_invalid');
  const version=String(env.LSZH_PORTAL_TERMS_VERSION||'');
  if(version.length<3||version.length>80||
     /test|draft|entwurf|rc/i.test(version))
    throw Error('customer_terms_not_final');
  const salt=String(env.LSZH_PORTAL_PROOF_SALT||'');
  const pat=String(env.LSZH_AIRTABLE_ACCESS_TOKEN||'');
  if(salt.length<32||salt.length>256||
     /test|fake|example|placeholder/i.test(salt)||
     pat.length<12||/[\r\n]/.test(pat))
    throw Error('customer_runtime_secrets_missing');
  return {enabled:true,termsVersion:version,origin:I.origin,
    proofSalt:salt,airtableAccessToken:pat};
}
