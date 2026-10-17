import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {PROJECT,EXISTING,TARGET,REGION,PERMS,assessReadiness}=require('./quarantine-provisioning-readiness');
const make=()=>({
 billing:{billingEnabled:true,billingAccountName:'billingAccounts/SYNTHETIC-NOT-REAL'},
 services:[{config:{name:'firestore.googleapis.com'}}],
 databases:[{
  name:'projects/'+PROJECT+'/databases/'+EXISTING,
  locationId:REGION,type:'FIRESTORE_NATIVE'
 }],
 permissions:PERMS.map(name=>({name,stage:'GA',customRolesSupportLevel:'SUPPORTED',apiDisabled:false}))
});
const check=(x)=>assessReadiness(x);
function forbidChanges(r){
 assert.equal(r.namedDatabaseHasFreeTier,false);
 assert.equal(r.chargesMayApply,true);
 assert.equal(r.projectBillingCostApproved,false);
 assert.equal(r.databaseCreationApproved,false);
 assert.equal(r.customRoleCreationApproved,false);
 assert.equal(r.serviceAccountCreationApproved,false);
 assert.equal(r.liveFirestoreWritesApproved,false);
 assert.equal(r.effectiveCreationPermissionVerified,false);
 assert.equal(r.effectiveIamBindingVerified,false);
 assert.ok(Object.isFrozen(r));
}
test('correct read-only metadata is not a GCP permission or cost authorization',()=>{
 const r=check(make());
 assert.equal(r.status,'METADATA_PREREQUISITES_PASS_ONLY');
 assert.deepEqual(r.findings,[]);
 assert.equal(r.targetDatabase,TARGET);
 forbidChanges(r);
});
test('missing, disabled or unreadable billing blocks',()=>{
 for(const billing of [undefined,{}, {billingEnabled:false,billingAccountName:'billingAccounts/DUMMY'},
  {billingEnabled:true},{billingEnabled:true,billingAccountName:''}]){
  const x=make();x.billing=billing;
  const r=check(x);
  assert.equal(r.status,'BLOCKED');assert.ok(r.findings.includes('BILLING_NOT_VERIFIED'));forbidChanges(r);
 }
});
test('missing Firestore API or unverified services block',()=>{
 for(const services of [null,[],[{config:{name:'cloudrun.googleapis.com'}}]]){
  const x=make();x.services=services;
  const r=check(x);
  assert.ok(r.findings.includes('FIRESTORE_API_NOT_VERIFIED'));forbidChanges(r);
 }
});
test('existing offers staging must be present in Zurich and separate DB must not exist already',()=>{
 for(const databases of [
  null,[],
  [{name:'projects/'+PROJECT+'/databases/'+EXISTING,locationId:'europe-west1',type:'FIRESTORE_NATIVE'}],
  [{name:'projects/'+PROJECT+'/databases/'+EXISTING,locationId:REGION,type:'DATASTORE_MODE'}],
  [...make().databases,{name:'projects/'+PROJECT+'/databases/'+TARGET,locationId:REGION,type:'FIRESTORE_NATIVE'}],
  [...make().databases,...make().databases]
 ]){
  const x=make();x.databases=databases;
  const r=check(x);assert.equal(r.status,'BLOCKED');forbidChanges(r);
 }
});
test('project database limit blocks, never assuming capacity',()=>{
 const x=make();
 x.databases.push(...Array.from({length:99},(_,i)=>({name:'projects/'+PROJECT+'/databases/dummy'+i,locationId:REGION,type:'FIRESTORE_NATIVE'})));
 const r=check(x);assert.ok(r.findings.includes('FIRESTORE_DATABASE_LIMIT_REACHED'));
 forbidChanges(r);
});
test('all three permissions must be GA custom-role compatible',()=>{
 for(const edit of [
  a=>a.pop(),
  a=>a.push({...a[0]}),
  a=>a[0].customRolesSupportLevel='NOT_SUPPORTED',
  a=>a[0].customRolesSupportLevel='TESTING',
  a=>a[0].apiDisabled=true,
  a=>a[0].stage='BETA',
  a=>a[0].onlyInPredefinedRoles=true
 ]){
  const x=make();edit(x.permissions);
  const r=check(x);assert.equal(r.status,'BLOCKED');forbidChanges(r);
 }
 const x=make();delete x.permissions[0].customRolesSupportLevel;
 assert.equal(check(x).status,'METADATA_PREREQUISITES_PASS_ONLY');
});
test('results contain only allowlisted diagnostics; no billing accounts or role bindings',()=>{
 const x=make();x.billing.billingAccountName='billingAccounts/SUPER_SENSITIVE';
 const r=check(x);const output=JSON.stringify(r);
 assert.equal(output.includes('SUPER_SENSITIVE'),false);
 assert.equal(output.includes('lars@'),false);
 assert.equal(output.includes('Bearer'),false);
 assert.equal(output.includes('pat_'),false);
 forbidChanges(r);
});
