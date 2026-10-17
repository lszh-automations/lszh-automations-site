'use strict';
// Strict offline classification of read-only GCP metadata. This never confers
// authorization for billable resources, IAM changes, data writes or deployment.
const PROJECT='lszh-automations';
const EXISTING='lszh-offers-staging';
const TARGET='lszh-quarantine-staging';
const REGION='europe-west6';
const PERMS=Object.freeze([
 'datastore.entities.create','datastore.entities.get','datastore.entities.update'
]);
function assessReadiness({billing,services,databases,permissions}={}) {
 const errors=[];
 if(!billing || billing.billingEnabled!==true ||
    typeof billing.billingAccountName!=='string' || !billing.billingAccountName.startsWith('billingAccounts/'))
   errors.push('BILLING_NOT_VERIFIED');
 if(!Array.isArray(services) ||
    !services.some(x=>x && (x.config?.name==='firestore.googleapis.com' || x.name==='firestore.googleapis.com')))
   errors.push('FIRESTORE_API_NOT_VERIFIED');
 if(!Array.isArray(databases)){
   errors.push('DATABASE_LIST_NOT_VERIFIED');
 }else{
   const names=databases.map(x=>x?.name);
   if(databases.length>=100)errors.push('FIRESTORE_DATABASE_LIMIT_REACHED');
   if(new Set(names).size!==names.length)errors.push('DATABASE_LIST_AMBIGUOUS');
   if(!databases.some(x=>x?.name==='projects/'+PROJECT+'/databases/'+EXISTING &&
      x.locationId===REGION &&
      ['FIRESTORE_NATIVE','FIRESTORE_NATIVE_MODE'].includes(x.type)))
     errors.push('EXISTING_STAGING_NOT_VERIFIED');
   if(databases.some(x=>x?.name==='projects/'+PROJECT+'/databases/'+TARGET))
     errors.push('QUARANTINE_DATABASE_ALREADY_EXISTS');
 }
 if(!Array.isArray(permissions)){
  errors.push('CUSTOM_ROLE_PERMISSIONS_NOT_VERIFIED');
 }else{
  for(const name of PERMS){
   const matches=permissions.filter(x=>x?.name===name);
   if(matches.length!==1 || matches[0].customRolesSupportLevel==='NOT_SUPPORTED' ||
      matches[0].customRolesSupportLevel==='TESTING' ||
      ![undefined,'SUPPORTED'].includes(matches[0].customRolesSupportLevel) ||
      matches[0].apiDisabled===true ||
      matches[0].stage!=='GA' ||
      matches[0].onlyInPredefinedRoles===true)
     errors.push('CUSTOM_ROLE_PERMISSION_UNVERIFIED_'+name.split('.').at(-1).toUpperCase());
  }
 }
 return Object.freeze({
  status:errors.length?'BLOCKED':'METADATA_PREREQUISITES_PASS_ONLY',
  findings:Object.freeze([...new Set(errors)]),
  targetDatabase:TARGET,
  namedDatabaseHasFreeTier:false,
  chargesMayApply:true,
  firestoreRolePermissionsVerified:!errors.some(x=>x.startsWith('CUSTOM_ROLE_PERMISSION')),
  effectiveCreationPermissionVerified:false,
  effectiveIamBindingVerified:false,
  projectBillingCostApproved:false,
  databaseCreationApproved:false,
  serviceAccountCreationApproved:false,
  customRoleCreationApproved:false,
  liveFirestoreWritesApproved:false
 });
}
module.exports={PROJECT,EXISTING,TARGET,REGION,PERMS,assessReadiness};
