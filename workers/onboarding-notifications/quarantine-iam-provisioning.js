'use strict';
// Pure plan-stage gate for ONE new quarantine IAM identity/role/binding.
// Only checks returned metadata; it does not grant permissions or call GCP.
const {PROJECT,DATABASE,REGION,SA,MEMBER,ROLE,PERMISSIONS,CONDITION,assessQuarantineIam}=
  require('./quarantine-iam-plan');
const DBNAME='projects/'+PROJECT+'/databases/'+DATABASE;
function assessBefore({database,serviceAccounts,customRoles,projectPolicy}={}) {
 const findings=[];
 if(!database || database.name!==DBNAME || database.locationId!==REGION ||
    !['FIRESTORE_NATIVE','FIRESTORE_NATIVE_MODE'].includes(database.type) ||
    database.deleteProtectionState!=='DELETE_PROTECTION_ENABLED')
   findings.push('DATABASE_OR_DELETION_PROTECTION_INVALID');
 if(!Array.isArray(serviceAccounts))
   findings.push('SERVICE_IDENTITY_INVENTORY_UNVERIFIED');
 else if(serviceAccounts.some(x=>x?.email===SA || x?.name==='projects/'+PROJECT+'/serviceAccounts/'+SA))
   findings.push('QUARANTINE_SERVICE_IDENTITY_ALREADY_PRESENT');
 if(!Array.isArray(customRoles))
   findings.push('CUSTOM_ROLE_INVENTORY_UNVERIFIED');
 else if(customRoles.some(x=>x?.name===ROLE))
   findings.push('QUARANTINE_CUSTOM_ROLE_ALREADY_PRESENT');
 if(!projectPolicy || !Array.isArray(projectPolicy.bindings))
   findings.push('PROJECT_IAM_POLICY_UNVERIFIED');
 else {
  for(const b of projectPolicy.bindings){
   if(!b || !Array.isArray(b.members)) {findings.push('POLICY_BINDING_MALFORMED');continue;}
   if(b.members.includes(MEMBER))findings.push('EXISTING_QUARANTINE_IAM_GRANT');
  }
 }
 return Object.freeze({
  status:findings.length?'BLOCKED':'CREATE_METADATA_PRECONDITIONS_PASS_ONLY',
  findings:Object.freeze([...new Set(findings)]),
  createAuthorized:false,writeTestAuthorized:false,verifiedEffectivePermissions:false
 });
}
function assessAfter({database,serviceAccount,customRole,projectPolicy,userManagedKeyNames}={}) {
 const outcome=assessQuarantineIam({database,serviceAccount,customRole,projectPolicy});
 const findings=[...outcome.findings];
 if(database?.deleteProtectionState!=='DELETE_PROTECTION_ENABLED')
   findings.push('DATABASE_DELETION_PROTECTION_UNVERIFIED');
 if(!Array.isArray(userManagedKeyNames) || userManagedKeyNames.length!==0)
   findings.push('SERVICE_IDENTITY_KEYLESS_UNVERIFIED');
 return Object.freeze({
  status:findings.length?'IAM_METADATA_VERIFICATION_FAILED':'IAM_METADATA_VERIFIED',
  findings:Object.freeze([...new Set(findings)]),
  db: DATABASE,
  rolePermissions:Object.freeze([...PERMISSIONS]),
  conditionExpression:CONDITION.expression,
  liveWriteAllowed:false,
  transportDeployed:false,
  inheritedGrantsVerified:false,
  effectiveFirestoreAccessVerified:false
 });
}
module.exports={assessBefore,assessAfter,DBNAME};
