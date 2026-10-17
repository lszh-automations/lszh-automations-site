'use strict';
// Strictly offline review of *proposed* IAM metadata for the separate quarantine
// STAGING identity. Never grants IAM, obtains tokens, or executes Firestore.
const PROJECT='lszh-automations';
const DATABASE='lszh-quarantine-staging';
const REGION='europe-west6';
const SA='lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com';
const MEMBER='serviceAccount:'+SA;
const ROLE='projects/lszh-automations/roles/lszhQuarantineCasStaging';
const CONDITION=Object.freeze({
 title:'LSZHQuarantineCASStaging',
 expression:'resource.name=="projects/lszh-automations/databases/lszh-quarantine-staging"'
});
// Firestore Native REST: single-document GET + commit(create/update).
// No list/delete/exports, no database administration and no mail permissions.
// NOTE: these grants apply to the entire named database, NOT one collection.
const PERMISSIONS=Object.freeze([
 'datastore.entities.create','datastore.entities.get','datastore.entities.update'
]);
const VALID_DB_TYPES=new Set(['FIRESTORE_NATIVE','FIRESTORE_NATIVE_MODE']);

function assessQuarantineIam({serviceAccount,database,customRole,projectPolicy}={}) {
 const failed=[];
 if(!serviceAccount || serviceAccount.email!==SA ||
   serviceAccount.disabled!==false)
  failed.push('IDENTITY_NOT_VERIFIED');
 if(!database ||
   database.name!=='projects/'+PROJECT+'/databases/'+DATABASE ||
   database.locationId!==REGION || !VALID_DB_TYPES.has(database.type))
  failed.push('DATABASE_NOT_VERIFIED');
 if(!customRole || customRole.name!==ROLE ||
   customRole.deleted===true || customRole.stage==='DISABLED' ||
   !Array.isArray(customRole.includedPermissions) ||
   customRole.includedPermissions.length!==PERMISSIONS.length ||
   new Set(customRole.includedPermissions).size!==PERMISSIONS.length ||
   !PERMISSIONS.every(p=>customRole.includedPermissions.includes(p)))
  failed.push('MINIMAL_ROLE_NOT_VERIFIED');
 if(!projectPolicy || !Array.isArray(projectPolicy.bindings)) {
  failed.push('PROJECT_POLICY_NOT_VERIFIED');
 }else{
  let matched=0,extras=0;
  for(const b of projectPolicy.bindings){
   if(!b || !Array.isArray(b.members)) {
    failed.push('POLICY_BINDING_MALFORMED');
    continue;
   }
   if(!b.members.includes(MEMBER))continue;
   if(b.role===ROLE && b.condition?.title===CONDITION.title &&
     b.condition?.expression===CONDITION.expression &&
     Object.keys(b.condition).every(k=>['title','expression','description'].includes(k)) &&
     b.members.length===1)matched++;
   else extras++;
  }
  if(matched!==1)failed.push('EXACT_SCOPED_BINDING_NOT_VERIFIED');
  if(extras)failed.push('UNEXPECTED_IAM_GRANT');
 }
 return Object.freeze({
  status:failed.length?'BLOCKED_METADATA_REVIEW':'METADATA_MATCH_ONLY',
  findings:Object.freeze([...new Set(failed)]),
  permissionsScope:'NAMED_DATABASE_NOT_COLLECTION',
  effectiveAccessVerified:false,
  inheritedGrantsVerified:false,
  keylessIdentityVerified:false,
  activationApproved:false,
  firestoreWritesAllowed:false
 });
}
module.exports=Object.freeze({
 PROJECT,DATABASE,REGION,SA,MEMBER,ROLE,CONDITION,PERMISSIONS,assessQuarantineIam
});
