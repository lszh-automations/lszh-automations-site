import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const {assessBefore,assessAfter}=require('./quarantine-iam-provisioning');
const {SA,MEMBER,ROLE,CONDITION,PERMISSIONS}=require('./quarantine-iam-plan');
const SCRIPT=path.join(path.dirname(fileURLToPath(import.meta.url)),'staging-quarantine-iam-setup.sh');
const APPROVAL='I_APPROVE_LSZH_QUARANTINE_SA_CUSTOM_ROLE_AND_CONDITIONAL_IAM';
function run(opts={},args=['--plan']){
 const dir=mkdtempSync(path.join(tmpdir(),'lszh-quarantine-iam-setup-'));
 const bin=path.join(dir,'bin');mkdirSync(bin);
 const log=path.join(dir,'calls.txt');
 writeFileSync(path.join(bin,'git'),"#!/usr/bin/env bash\ncase \"$1:$2\" in\n rev-parse:--show-toplevel) echo \"$FAKE_ROOT\" ;;\n rev-parse:HEAD) echo same ;;\n rev-parse:refs/remotes/origin/feature/onboarding-notification-outbox-20261016) echo same ;;\n branch:--show-current) echo feature/onboarding-notification-outbox-20261016 ;;\n status:--porcelain) echo \"$FAKE_DIRTY\" ;;\n *) exit 67 ;;\nesac\n",{mode:0o755});
 writeFileSync(path.join(bin,'gcloud'),"#!/usr/bin/env bash\necho \"$*\" >> \"$FAKE_LOG\"\ncase \"$1:$2:$3\" in\n auth:list:*) echo \"$FAKE_ACCOUNT\" ;;\n config:get-value:project) echo lszh-automations ;;\n firestore:databases:describe)\n   if [[ \"$FAKE_BAD_DB\" == 1 ]];then\n     echo '{\"name\":\"projects/lszh-automations/databases/lszh-offers-staging\",\"locationId\":\"europe-west6\",\"type\":\"FIRESTORE_NATIVE\",\"deleteProtectionState\":\"DELETE_PROTECTION_ENABLED\"}'\n   else\n     echo '{\"name\":\"projects/lszh-automations/databases/lszh-quarantine-staging\",\"locationId\":\"europe-west6\",\"type\":\"FIRESTORE_NATIVE\",\"deleteProtectionState\":\"DELETE_PROTECTION_ENABLED\"}'\n   fi ;;\n iam:service-accounts:list)\n   if [[ \"$FAKE_EXISTING_SA\" == 1 || -e \"$FAKE_SA_CREATED\" ]];then\n     echo '[{\"email\":\"lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com\"}]'\n   else echo '[]';fi ;;\n iam:service-accounts:create)\n   touch \"$FAKE_SA_CREATED\";echo created ;;\n iam:service-accounts:describe)\n   if [[ -e \"$FAKE_SA_CREATED\" ]];then\n     echo '{\"email\":\"lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com\"}'\n   else exit 77;fi ;;\n iam:service-accounts:keys)\n   if [[ \"$FAKE_USER_KEYS\" == 1 ]];then echo '[{\"name\":\"UNEXPECTED_KEY\"}]';else echo '[]';fi ;;\n iam:roles:list)\n   if [[ \"$FAKE_EXISTING_ROLE\" == 1 || -e \"$FAKE_ROLE_CREATED\" ]];then\n     echo '[{\"name\":\"projects/lszh-automations/roles/lszhQuarantineCasStaging\"}]'\n   else echo '[]';fi ;;\n iam:roles:create)\n   if [[ \"$FAKE_FAIL_ROLE\" == 1 ]];then exit 75;fi\n   touch \"$FAKE_ROLE_CREATED\";echo created ;;\n iam:roles:describe)\n   [[ -e \"$FAKE_ROLE_CREATED\" ]] || exit 78\n   echo '{\"name\":\"projects/lszh-automations/roles/lszhQuarantineCasStaging\",\"stage\":\"GA\",\"includedPermissions\":[\"datastore.entities.create\",\"datastore.entities.get\",\"datastore.entities.update\"]}' ;;\n projects:get-iam-policy:*)\n   if [[ -e \"$FAKE_BOUND\" ]];then\n     echo '{\"bindings\":[{\"role\":\"projects/lszh-automations/roles/lszhQuarantineCasStaging\",\"members\":[\"serviceAccount:lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com\"],\"condition\":{\"title\":\"LSZHQuarantineCASStaging\",\"expression\":\"resource.name==\\\"projects/lszh-automations/databases/lszh-quarantine-staging\\\"\",\"description\":\"Quarantine staging database only\"}}]}'\n   elif [[ \"$FAKE_EXISTING_BINDING\" == 1 ]];then\n     echo '{\"bindings\":[{\"role\":\"roles/editor\",\"members\":[\"serviceAccount:lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com\"]}]}'\n   else\n     echo '{\"bindings\":[{\"role\":\"roles/owner\",\"members\":[\"user:synthetic@example.invalid\"]}]}'\n   fi ;;\n projects:add-iam-policy-binding:*)\n   if [[ \"$FAKE_FAIL_BINDING\" == 1 ]];then exit 76;fi\n   touch \"$FAKE_BOUND\";echo binding ;;\n *) echo \"unknown command\" >&2; exit 90 ;;\nesac\n",{mode:0o755});
 try {
  const r=spawnSync('bash',[SCRIPT,...args],{cwd:process.cwd(),encoding:'utf8',timeout:20000,
   env:{...process.env,PATH:bin+':'+process.env.PATH,
    FAKE_ROOT:process.cwd(),FAKE_LOG:log,
    FAKE_DIRTY:opts.dirty?' M file':'',
    FAKE_ACCOUNT:opts.wrongUser?'wrong@example.invalid':'lars@lszh-automations.ch',
    FAKE_SA_CREATED:path.join(dir,'sa'),FAKE_ROLE_CREATED:path.join(dir,'role'),FAKE_BOUND:path.join(dir,'bound'),
    FAKE_BAD_DB:opts.badDB?'1':'0',FAKE_EXISTING_SA:opts.existingSA?'1':'0',
    FAKE_EXISTING_ROLE:opts.existingRole?'1':'0',
    FAKE_EXISTING_BINDING:opts.existingBinding?'1':'0',
    FAKE_FAIL_ROLE:opts.failRole?'1':'0',
    FAKE_FAIL_BINDING:opts.failBinding?'1':'0',
    FAKE_USER_KEYS:opts.userKeys?'1':'0',
    LSZH_QUARANTINE_IAM_PROVISIONING_APPROVAL:opts.approved?APPROVAL:''}});
  return {status:r.status,output:r.stdout+'\n'+r.stderr,
   calls:existsSync(log)?readFileSync(log,'utf8'):'',
   created:{sa:existsSync(path.join(dir,'sa')),
    role:existsSync(path.join(dir,'role')),bound:existsSync(path.join(dir,'bound'))}};
 }finally{rmSync(dir,{recursive:true,force:true});}
}
function noExtraneousActions(x){
 assert.doesNotMatch(x.calls,/firestore databases create|firestore documents|run jobs|run deploy|billing projects link|services enable|iam service-accounts keys create|auth print-access-token/);
 assert.doesNotMatch(x.output,/Bearer |access_token|synthetic@example.invalid/);
}
test('preflight is read-only even with no approval',()=>{
 for(const args of [[],['--plan']]){
  const x=run({},args);
  assert.equal(x.status,0,x.output);
  assert.match(x.output,/PLAN ONLY/);
  assert.deepEqual(x.created,{sa:false,role:false,bound:false});
  assert.doesNotMatch(x.calls,/iam service-accounts create|iam roles create|add-iam-policy-binding/);
  noExtraneousActions(x);
 }
});
test('missing explicit approval makes no changes and no effective authority',()=>{
 const x=run({},['--apply-once']);
 assert.equal(x.status,2,x.output);assert.match(x.output,/approval flag missing/);
 assert.deepEqual(x.created,{sa:false,role:false,bound:false});
 noExtraneousActions(x);
});
test('approved once creates exactly one identity/role/database-scoped grant and verifies each',()=>{
 const x=run({approved:true},['--apply-once']);
 assert.equal(x.status,0,x.output);
 assert.deepEqual(x.created,{sa:true,role:true,bound:true});
 assert.equal((x.calls.match(/iam service-accounts create/g)||[]).length,1);
 assert.equal((x.calls.match(/iam roles create/g)||[]).length,1);
 assert.equal((x.calls.match(/projects add-iam-policy-binding/g)||[]).length,1);
 assert.match(x.calls,/--database=lszh-quarantine-staging/);
 assert.match(x.calls,/--member=serviceAccount:lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com/);
 assert.match(x.calls,/--role=projects\/lszh-automations\/roles\/lszhQuarantineCasStaging/);
 assert.match(x.calls,/--permissions=datastore.entities.create,datastore.entities.get,datastore.entities.update/);
 assert.match(x.calls,/resource.name==/);
 assert.match(x.calls,/databases\/lszh-quarantine-staging/);
 assert.match(x.output,/PASS: No user-managed service account keys detected/);
 assert.match(x.output,/DONE: One isolated quarantine IAM setup completed/);
 noExtraneousActions(x);
});
test('already present account/role/grant refuse any modifications',()=>{
 for(const config of [{existingSA:true},{existingRole:true},{existingBinding:true}]){
  const x=run({approved:true,...config},['--apply-once']);
  assert.equal(x.status,2,x.output);
  assert.match(x.output,/BLOCKED:/);
  assert.deepEqual(x.created,{sa:false,role:false,bound:false});
  noExtraneousActions(x);
 }
});
test('unexpected database metadata refuses without changes',()=>{
 const x=run({approved:true,badDB:true},['--apply-once']);
 assert.equal(x.status,2,x.output);
 assert.match(x.output,/DATABASE_OR_DELETION_PROTECTION_INVALID/);
 assert.deepEqual(x.created,{sa:false,role:false,bound:false});
 noExtraneousActions(x);
});
test('failure creating role after SA is partial, never binds IAM or retries',()=>{
 const x=run({approved:true,failRole:true},['--apply-once']);
 assert.equal(x.status,2,x.output);
 assert.deepEqual(x.created,{sa:true,role:false,bound:false});
 assert.match(x.output,/UNVERIFIED: Custom role creation failed/);
 assert.equal((x.calls.match(/iam roles create/g)||[]).length,1);
 assert.doesNotMatch(x.calls,/add-iam-policy-binding/);
 noExtraneousActions(x);
});
test('grant failure never retries or claims setup complete',()=>{
 const x=run({approved:true,failBinding:true},['--apply-once']);
 assert.equal(x.status,2,x.output);
 assert.deepEqual(x.created,{sa:true,role:true,bound:false});
 assert.match(x.output,/UNVERIFIED: IAM binding failed/);
 assert.equal((x.calls.match(/projects add-iam-policy-binding/g)||[]).length,1);
 noExtraneousActions(x);
});
test('unexpected user-managed keys stop verification and do not authorize writes',()=>{
 const x=run({approved:true,userKeys:true},['--apply-once']);
 assert.equal(x.status,2,x.output);
 assert.deepEqual(x.created,{sa:true,role:true,bound:true});
 assert.match(x.output,/SERVICE_IDENTITY_KEYLESS_UNVERIFIED/);
 noExtraneousActions(x);
});
test('wrong account, dirty branch, invalid mode fail before any IAM mutation',()=>{
 for(const [opts,args] of [
  [{approved:true,wrongUser:true},['--apply-once']],
  [{approved:true,dirty:true},['--apply-once']],
  [{approved:true},['--apply']],
  [{approved:true},['--apply-once','--force']]
 ]){
  const x=run(opts,args);assert.equal(x.status,2,x.output);
  assert.deepEqual(x.created,{sa:false,role:false,bound:false});
  noExtraneousActions(x);
 }
});
test('separate pure before/after validators never represent Firestore runtime access',()=>{
 const database={name:'projects/lszh-automations/databases/lszh-quarantine-staging',
  locationId:'europe-west6',type:'FIRESTORE_NATIVE',
  deleteProtectionState:'DELETE_PROTECTION_ENABLED'};
 const before=assessBefore({database,serviceAccounts:[],customRoles:[],
  projectPolicy:{bindings:[]}});
 assert.equal(before.status,'CREATE_METADATA_PRECONDITIONS_PASS_ONLY');
 assert.equal(before.createAuthorized,false);
 const after=assessAfter({database,serviceAccount:{email:SA},
  customRole:{name:ROLE,stage:'GA',includedPermissions:[...PERMISSIONS]},
  projectPolicy:{bindings:[{role:ROLE,members:[MEMBER],condition:{...CONDITION}}]},
  userManagedKeyNames:[]});
 assert.equal(after.status,'IAM_METADATA_VERIFIED');
 assert.equal(after.liveWriteAllowed,false);
 assert.equal(after.effectiveFirestoreAccessVerified,false);
 assert.equal(after.inheritedGrantsVerified,false);
 for(const x of [null,['user-key']]){
  assert.equal(assessAfter({database,serviceAccount:{email:SA},
    customRole:{name:ROLE,stage:'GA',includedPermissions:[...PERMISSIONS]},
    projectPolicy:{bindings:[{role:ROLE,members:[MEMBER],condition:{...CONDITION}}]},
    userManagedKeyNames:x}).status,'IAM_METADATA_VERIFICATION_FAILED');
 }
});
test('shell syntax and mock-only source keep existing offers staging untouched',()=>{
 const s=readFileSync(SCRIPT,'utf8');
 assert.equal(spawnSync('bash',['-n',SCRIPT],{encoding:'utf8'}).status,0);
 assert.equal((s.match(/gcloud iam service-accounts create/g)||[]).length,1);
 assert.equal((s.match(/gcloud iam roles create/g)||[]).length,1);
 assert.equal((s.match(/gcloud projects add-iam-policy-binding/g)||[]).length,1);
 assert.ok(!s.includes('lszh-offers-staging'));
 assert.ok(!s.includes('roles/datastore.user'));
});
