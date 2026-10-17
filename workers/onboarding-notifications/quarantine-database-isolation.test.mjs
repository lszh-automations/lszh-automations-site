import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const cas=require('./firestore-quarantine-cas');
const iam=require('./quarantine-iam-plan');
const outbox=require('./firestore-store');

const QUARANTINE='lszh-quarantine-staging';
const OLD='lszh-offers-staging';
const scoped=[
 'workers/onboarding-notifications/firestore-quarantine-cas.js',
 'workers/onboarding-notifications/quarantine-iam-plan.js',
 'workers/onboarding-notifications/staging-quarantine-iam-preflight.sh'
];
test('quarantine CAS and IAM must target ONLY dedicated Zurich database, never offers staging',()=>{
 assert.equal(cas.PROJECT,'lszh-automations');
 assert.equal(cas.DATABASE,QUARANTINE);
 assert.equal(iam.DATABASE,QUARANTINE);
 assert.equal(iam.REGION,'europe-west6');
 assert.equal(iam.CONDITION.expression,
  'resource.name=="projects/lszh-automations/databases/lszh-quarantine-staging"');
 for(const path of scoped){
  const source=readFileSync(path,'utf8');
  assert.ok(source.includes(QUARANTINE),path);
  assert.equal(source.includes(OLD),false,path);
 }
});
test('existing outbox retains its own previously deployed database and collection unchanged',()=>{
 assert.equal(outbox.DATABASE,OLD);
 assert.equal(outbox.COLLECTION,'lszh_onboarding_notification_drafts_staging');
 assert.equal(cas.COLLECTION,'lszh_onboarding_quarantine_cases_staging');
 assert.notEqual(cas.COLLECTION,outbox.COLLECTION);
});
test('quarantine IAM plan cannot approve old DB or old project-level access',()=>{
 const x={
  serviceAccount:{email:iam.SA,disabled:false},
  database:{name:'projects/lszh-automations/databases/'+OLD,
   locationId:'europe-west6',type:'FIRESTORE_NATIVE'},
  customRole:{name:iam.ROLE,stage:'GA',
   includedPermissions:[...iam.PERMISSIONS]},
  projectPolicy:{bindings:[{
   role:iam.ROLE,members:[iam.MEMBER],
   condition:{...iam.CONDITION}
  }]}
 };
 let result=iam.assessQuarantineIam(x);
 assert.equal(result.status,'BLOCKED_METADATA_REVIEW');
 assert.ok(result.findings.includes('DATABASE_NOT_VERIFIED'));
 x.database.name='projects/lszh-automations/databases/'+QUARANTINE;
 x.projectPolicy.bindings[0].condition.expression=
  'resource.name=="projects/lszh-automations/databases/lszh-offers-staging"';
 result=iam.assessQuarantineIam(x);
 assert.equal(result.status,'BLOCKED_METADATA_REVIEW');
 assert.ok(result.findings.includes('EXACT_SCOPED_BINDING_NOT_VERIFIED'));
 assert.equal(result.firestoreWritesAllowed,false);
});
