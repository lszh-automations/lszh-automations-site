'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {audit,checks}=require('../scripts/audit-lszh-cloud-readonly');
const responses={
 namedFirestore:{name:'projects/lszh-automations/databases/lszh-offers-staging',locationId:'europe-west6'},
 existingPreflight:{metadata:{name:'lszh-offer-portal-staging'},
  spec:{template:{spec:{serviceAccountName:'preflight-reader@example.invalid'}}}},
 plannedService:{metadata:{name:'lszh-offer-acceptance-staging'},
  spec:{template:{spec:{serviceAccountName:'lszh-offer-reader@lszh-automations.iam.gserviceaccount.com'}}}},
 candidateServiceAccount:{email:'lszh-offer-reader@lszh-automations.iam.gserviceaccount.com'}
};
test('only four fixed read-only gcloud commands are used; no mutation or secrets requested',()=>{
 assert.equal(checks.length,4);
 const calls=[];
 const result=audit({invoke:args=>{
  calls.push(args);
  const id=checks.find(x=>JSON.stringify(x.args)===JSON.stringify(args))?.id;
  assert.ok(id,'no dynamic shell commands allowed');
  return JSON.stringify(responses[id]);
 }});
 assert.equal(calls.length,4);
 for(const args of calls){
  assert.equal(args[args.length-1],'--format=json');
  assert.ok(args.includes('--project=lszh-automations'));
  assert.ok(!args.some(x=>/create|update|add-iam|set-iam|deploy|delete|patch|enable|disable|login|token|secret/i.test(x)));
 }
 assert.equal(result.checks.namedFirestore,'PRESENT');
 assert.equal(result.checks.existingPreflight,'EXISTS_IDENTITY_PERMISSIONS_UNVERIFIED');
 assert.equal(result.checks.plannedService,'EXISTS_IDENTITY_PERMISSIONS_UNVERIFIED');
 assert.equal(result.checks.candidateServiceAccount,'EXISTS_PERMISSIONS_UNVERIFIED');
 assert.equal(result.authorizedToWrite,false);
 assert.equal(result.authorizedToModifyIAM,false);
 assert.equal(result.authorizedToDeploy,false);
 assert.equal(result.authorizedToLockRetention,false);
 assert.equal(result.resourcesModified,false);
});
test('absence, denied permission, timeout and malformed JSON can never imply a confirmed resource state',()=>{
 let index=0;
 const statuses=audit({invoke:()=>{
  index++;
  if(index===1)throw Error('PERMISSION_DENIED');
  if(index===2)return '{broken';
  if(index===3)return JSON.stringify({status:'NOT_FOUND'});
  return '';
 }});
 assert.equal(statuses.checks.namedFirestore,'NOT_VERIFIED');
 assert.equal(statuses.checks.existingPreflight,'NOT_VERIFIED');
 assert.equal(statuses.checks.plannedService,'INCONCLUSIVE');
 assert.equal(statuses.checks.candidateServiceAccount,'NOT_VERIFIED');
 assert.equal(statuses.authorizedToWrite,false);
});
test('resource identity must match exact project, region and service name',()=>{
 const changes={
  namedFirestore:{...responses.namedFirestore,locationId:'us-central1'},
  existingPreflight:{metadata:{name:'another-service'}},
  plannedService:{metadata:{name:'production-acceptance'}},
  candidateServiceAccount:{email:'admin@lszh-automations.iam.gserviceaccount.com'}
 };
 const result=audit({invoke:args=>{
  const id=checks.find(x=>JSON.stringify(x.args)===JSON.stringify(args)).id;
  return changes[id];
 }});
 assert.deepEqual(Object.values(result.checks),Array(4).fill('INCONCLUSIVE'));
 assert.equal(result.driveReaderPermission,'NOT_TESTED');
 assert.equal(result.airtableReaderPermission,'NOT_TESTED');
});
test('existing Cloud Run service does not mean a service account is bound',()=>{
 const result=audit({invoke:args=>{
  const id=checks.find(x=>JSON.stringify(x.args)===JSON.stringify(args)).id;
  return id==='plannedService'?{metadata:{name:'lszh-offer-acceptance-staging'}}:responses[id];
 }});
 assert.equal(result.checks.plannedService,'EXISTS_NO_IDENTITY_PROOF');
 assert.equal(result.namedDatabaseWritePermission,'NOT_TESTED');
 assert.equal(result.decision,'REQUIRES_SEPARATE_EXPLICIT_APPROVAL');
});
