import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {SA,MEMBER,ROLE,CONDITION,PERMISSIONS,assessQuarantineIam}=
 require('./quarantine-iam-plan');
function fixture() {
 return {
  serviceAccount:{email:SA,disabled:false},
  database:{name:'projects/lszh-automations/databases/lszh-quarantine-staging',
            locationId:'europe-west6',type:'FIRESTORE_NATIVE'},
  customRole:{name:ROLE,stage:'GA',includedPermissions:[...PERMISSIONS]},
  projectPolicy:{bindings:[{
   role:ROLE,members:[MEMBER],
   condition:{...CONDITION}
  }]}
 };
}
const check=x=>assessQuarantineIam(x);
function noAuthorization(x) {
 assert.equal(x.activationApproved,false);
 assert.equal(x.firestoreWritesAllowed,false);
 assert.equal(x.effectiveAccessVerified,false);
 assert.equal(x.inheritedGrantsVerified,false);
 assert.equal(x.keylessIdentityVerified,false);
 assert.equal(x.permissionsScope,'NAMED_DATABASE_NOT_COLLECTION');
 assert.equal(Object.isFrozen(x),true);
 assert.equal(Object.isFrozen(x.findings),true);
}
test('exact narrow custom role and database condition pass metadata only, NOT permission to write',()=>{
 const result=check(fixture());
 assert.equal(result.status,'METADATA_MATCH_ONLY');
 assert.deepEqual(result.findings,[]);
 noAuthorization(result);
 assert.deepEqual([...PERMISSIONS].sort(),[
  'datastore.entities.create','datastore.entities.get','datastore.entities.update'
 ]);
});
test('broad, missing and extra roles are explicitly blocked',()=>{
 for(const permissions of [
  ['datastore.entities.get'],
  [...PERMISSIONS,'datastore.entities.delete'],
  [...PERMISSIONS,'datastore.entities.list'],
  ['datastore.entities.*'],
  [...PERMISSIONS,'datastore.entities.get']
 ]) {
  const x=fixture();x.customRole.includedPermissions=permissions;
  const result=check(x);
  assert.equal(result.status,'BLOCKED_METADATA_REVIEW');
  assert.ok(result.findings.includes('MINIMAL_ROLE_NOT_VERIFIED'));
  noAuthorization(result);
 }
});
test('incorrect or absent database IAM condition, broad project role and multiple grants block',()=>{
 const cases=[
  {role:'roles/datastore.user'},
  {role:ROLE,condition:{title:CONDITION.title,expression:'resource.name!="projects/lszh-automations/databases/lszh-quarantine-staging"'}},
  {role:ROLE,condition:{title:CONDITION.title,expression:'resource.name.startsWith("projects/lszh-automations")'}},
  {role:ROLE,condition:{...CONDITION},members:[MEMBER,'user:other@example.invalid']}
 ];
 for(const binding of cases){
  const x=fixture();x.projectPolicy.bindings=[{members:[MEMBER],...binding}];
  const y=check(x);
  assert.equal(y.status,'BLOCKED_METADATA_REVIEW');
  noAuthorization(y);
 }
 const x=fixture();
 x.projectPolicy.bindings.push({role:'roles/owner',members:[MEMBER]});
 assert.ok(check(x).findings.includes('UNEXPECTED_IAM_GRANT'));
 x.projectPolicy.bindings=[x.projectPolicy.bindings[0],x.projectPolicy.bindings[0]];
 assert.ok(check(x).findings.includes('EXACT_SCOPED_BINDING_NOT_VERIFIED'));
});
test('wrong service identity, wrong database and disabled role each block',()=>{
 for(const change of [
  x=>{x.serviceAccount.email='untrusted@example.invalid';},
  x=>{x.serviceAccount.disabled=true;},
  x=>{x.database.locationId='europe-west1';},
  x=>{x.database.name='projects/lszh-automations/databases/(default)';},
  x=>{x.customRole.stage='DISABLED';},
  x=>{x.customRole.deleted=true;}
 ]) {
  const x=fixture();change(x);
  assert.equal(check(x).status,'BLOCKED_METADATA_REVIEW');
 }
});
test('missing, malformed and unrelated IAM metadata fail closed',()=>{
 assert.equal(check({}).status,'BLOCKED_METADATA_REVIEW');
 for(const policy of [
  {},{bindings:null},{bindings:'not array'},
  {bindings:[{role:ROLE,members:'not array'}]},
  {bindings:[]},
  {bindings:[{role:ROLE,members:[MEMBER]}]}
 ]) {
  const x=fixture();x.projectPolicy=policy;
  assert.equal(check(x).status,'BLOCKED_METADATA_REVIEW');
 }
 const x=fixture();
 x.projectPolicy.bindings.push({role:'roles/owner',members:['user:other@example.invalid']});
 assert.equal(check(x).status,'METADATA_MATCH_ONLY');
});
test('review result never claims collection isolation, privilege effectiveness, approval or keylessness',()=>{
 const result=check(fixture());
 const json=JSON.stringify(result);
 assert.ok(!json.includes('@'));
 assert.ok(!json.includes('Bearer'));
 assert.ok(!json.includes('pat_'));
 assert.ok(!json.includes('lszh_onboarding_quarantine_cases_staging'));
 noAuthorization(result);
});
