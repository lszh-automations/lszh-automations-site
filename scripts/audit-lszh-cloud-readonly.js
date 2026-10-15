'use strict';
/*
 * LSZH read-only Cloud Shell audit. NEVER creates, deploys, grants, writes,
 * edits Drive retention or accesses customer offers.
 * Run explicitly: node scripts/audit-lszh-cloud-readonly.js --read-only
 * All gcloud invocations below are constant commands using execFileSync.
 */
const {execFileSync}=require('node:child_process');
const PROJECT='lszh-automations';
const REGION='europe-west6';
const DB='lszh-offers-staging';
const PREFLIGHT='lszh-offer-portal-staging';
const NEW_SERVICE='lszh-offer-acceptance-staging';
const CANDIDATE_SA='lszh-offer-reader@lszh-automations.iam.gserviceaccount.com';
const checks=Object.freeze([
 Object.freeze({id:'namedFirestore',args:['firestore','databases','describe',
  '--database='+DB,'--project='+PROJECT,'--format=json']}),
 Object.freeze({id:'existingPreflight',args:['run','services','describe',PREFLIGHT,
  '--region='+REGION,'--project='+PROJECT,'--format=json']}),
 Object.freeze({id:'plannedService',args:['run','services','describe',NEW_SERVICE,
  '--region='+REGION,'--project='+PROJECT,'--format=json']}),
 Object.freeze({id:'candidateServiceAccount',args:['iam','service-accounts','describe',
  CANDIDATE_SA,'--project='+PROJECT,'--format=json']})
]);
function realGcloud(args){
 return execFileSync('gcloud',args,{encoding:'utf8',timeout:15000,
  maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});
}
function classify(id,raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return 'INCONCLUSIVE';
 if(id==='namedFirestore'){
  const n=String(raw.name||'');
  const match=n.endsWith('/databases/'+DB);
  return match&&raw.locationId===REGION?'PRESENT':'INCONCLUSIVE';
 }
 if(id==='candidateServiceAccount'){
  return raw.email===CANDIDATE_SA?'EXISTS_PERMISSIONS_UNVERIFIED':'INCONCLUSIVE';
 }
 if(id==='existingPreflight'||id==='plannedService'){
  const n=String(raw.metadata?.name||raw.name||'');
  const expected=id==='existingPreflight'?PREFLIGHT:NEW_SERVICE;
  if(n!==expected&&!n.endsWith('/services/'+expected))return 'INCONCLUSIVE';
  const sa=raw.spec?.template?.spec?.serviceAccountName||
   raw.template?.serviceAccount||null;
  // Existence alone never establishes the resource's runtime IAM capabilities.
  return sa?'EXISTS_IDENTITY_PERMISSIONS_UNVERIFIED':'EXISTS_NO_IDENTITY_PROOF';
 }
 return 'INCONCLUSIVE';
}
function audit({invoke=realGcloud}={}){
 if(typeof invoke!=='function')throw Error('invalid_audit_transport');
 const results={};
 for(const check of checks){
  try{
   const result=invoke([...check.args]);
   const raw=typeof result==='string'?JSON.parse(result):result;
   results[check.id]=classify(check.id,raw);
  }catch{
   // 404, insufficient permissions, no gcloud CLI, invalid JSON, timeout:
   // never treat an error as a missing resource or a passed permission check.
   results[check.id]='NOT_VERIFIED';
  }
 }
 return Object.freeze({
  audit:'LSZH_CLOUD_READONLY_PREFLIGHT_V1',
  project:PROJECT,region:REGION,database:DB,
  checks:Object.freeze(results),
  // Cloud Shell never knows the actual Drive/Airtable API permission posture.
  driveReaderPermission:'NOT_TESTED',
  airtableReaderPermission:'NOT_TESTED',
  namedDatabaseWritePermission:'NOT_TESTED',
  acceptedRealContract:false,
  archiveRetentionChanged:false,
  resourcesModified:false,
  deployPerformed:false,
  authorizedToDeploy:false,
  authorizedToWrite:false,
  authorizedToModifyIAM:false,
  authorizedToLockRetention:false,
  decision:'REQUIRES_SEPARATE_EXPLICIT_APPROVAL'
 });
}
if(require.main===module){
 if(process.argv.length!==3||process.argv[2]!=='--read-only'){
  process.stderr.write('Only read-only audit supported. Usage: node scripts/audit-lszh-cloud-readonly.js --read-only\n');
  process.exitCode=2;
 }else{
  process.stdout.write(JSON.stringify(audit(),null,2)+'\n');
 }
}
module.exports={audit,checks,classify};
