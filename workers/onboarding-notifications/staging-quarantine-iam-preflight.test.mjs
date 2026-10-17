import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,chmodSync,readFileSync,existsSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const {SA,MEMBER,ROLE,CONDITION,PERMISSIONS}=createFixture();
function createFixture() {
 const require=createRequire(import.meta.url);
 return require('./quarantine-iam-plan');
}
import {createRequire} from 'node:module';
const SCRIPT=path.join(path.dirname(fileURLToPath(import.meta.url)),'staging-quarantine-iam-preflight.sh');
function run(overrides={},args=['--plan']) {
 const root=mkdtempSync(path.join(tmpdir(),'lszh-quarantine-iam-'));
 const bin=path.join(root,'bin');mkdirSync(bin);
 const audit=path.join(root,'audit');
 writeFileSync(path.join(bin,'git'),"#!/usr/bin/env bash\ncase \"$1:$2\" in\n rev-parse:--show-toplevel) echo \"$FAKE_ROOT\" ;;\n rev-parse:HEAD) echo same ;;\n rev-parse:refs/remotes/origin/feature/onboarding-notification-outbox-20261016) echo same ;;\n branch:--show-current) echo feature/onboarding-notification-outbox-20261016 ;;\n status:--porcelain) echo \"$FAKE_DIRTY\" ;;\n *) exit 80 ;;\nesac\n");
 writeFileSync(path.join(bin,'gcloud'),"#!/usr/bin/env bash\necho \"$*\" >> \"$FAKE_AUDIT\"\ncase \"$1:$2:$3\" in\n auth:list:*) echo \"$FAKE_ACCOUNT\" ;;\n config:get-value:project) echo \"lszh-automations\" ;;\n firestore:databases:describe) [[ \"$FAKE_MISSING_DB\" == 1 ]] && exit 3; cat \"$FAKE_DB\" ;;\n iam:service-accounts:describe)\n   [[ \"$FAKE_MISSING_SA\" == 1 ]] && exit 3\n   cat \"$FAKE_SA\" ;;\n iam:roles:describe)\n   [[ \"$FAKE_MISSING_ROLE\" == 1 ]] && exit 3\n   cat \"$FAKE_ROLE\" ;;\n projects:get-iam-policy:*) cat \"$FAKE_POLICY\" ;;\n *) echo \"unexpected cloud command\" >&2;exit 90 ;;\nesac\n");
 for(const c of ['git','gcloud'])chmodSync(path.join(bin,c),0o755);
 const data={
  db:{name:'projects/lszh-automations/databases/lszh-quarantine-staging',locationId:'europe-west6',type:'FIRESTORE_NATIVE'},
  sa:{email:SA,disabled:false},
  role:{name:ROLE,stage:'GA',includedPermissions:PERMISSIONS},
  policy:{bindings:[{members:[MEMBER],role:ROLE,condition:CONDITION}]}
 };
 for(const [k,v] of Object.entries(data))
  writeFileSync(path.join(root,k+'.json'),JSON.stringify(overrides[k]??v));
 try {
  const p=spawnSync('bash',[SCRIPT,...args],{cwd:root,encoding:'utf8',timeout:20000,
   env:{...process.env,PATH:bin+':'+process.env.PATH,
    FAKE_ROOT:process.cwd(),FAKE_AUDIT:audit,FAKE_ACCOUNT:overrides.account??'lars@lszh-automations.ch',
    FAKE_DB:path.join(root,'db.json'),FAKE_SA:path.join(root,'sa.json'),
    FAKE_ROLE:path.join(root,'role.json'),FAKE_POLICY:path.join(root,'policy.json'),
    FAKE_DIRTY:overrides.dirty??'',FAKE_MISSING_DB:overrides.missingDB?'1':'0',FAKE_MISSING_SA:overrides.missingSA?'1':'0',
    FAKE_MISSING_ROLE:overrides.missingRole?'1':'0'}});
  return {...p,audit:existsSync(audit)?readFileSync(audit,'utf8'):''};
 }finally{rmSync(root,{recursive:true,force:true});}
}
test('only actual read-only metadata calls occur and no sensitive policy output is shown',()=>{
 const r=run();
 assert.equal(r.status,0,r.stdout+'\n'+r.stderr);
 assert.match(r.stdout,/PASS: Exact 3-permission role/);
 assert.match(r.stdout,/Database-level access, NOT collection-specific isolation/);
 assert.match(r.stdout,/PLAN ONLY/);
 assert.doesNotMatch(r.stdout,/lars@|serviceAccount:|resource.name|datastore.entities|pat_/);
 assert.match(r.audit,/projects get-iam-policy/);
 assert.doesNotMatch(r.audit,/add-iam|create|update|delete|execute|builds submit|auth print-access-token|firestore documents/);
});
test('not yet provisioned identity and role STOP without cloud changes',()=>{
 for(const vars of [{missingSA:true},{missingRole:true}]){
  const r=run(vars);
  assert.equal(r.status,2,r.stdout+' '+r.stderr);
  assert.match(r.stdout,/BLOCKED/);
  assert.doesNotMatch(r.audit,/add-iam|create|update|execute|firestore documents/);
 }
});
test('scope mismatch or extra privileges fail closed without printing IAM policy',()=>{
 for(const vars of [
  {role:{name:ROLE,stage:'GA',includedPermissions:[...PERMISSIONS,'datastore.entities.delete']}},
  {db:{name:'projects/lszh-automations/databases/(default)',locationId:'europe-west6',type:'FIRESTORE_NATIVE'}},
  {policy:{bindings:[{role:'roles/datastore.user',members:[MEMBER]}]}}
 ]) {
  const r=run(vars);
  assert.equal(r.status,2,r.stdout+' '+r.stderr);
  assert.match(r.stdout,/BLOCKED:/);
  assert.doesNotMatch(r.stdout,/lars@|serviceAccount:|datastore.user|resource.name/);
 }
});
test('wrong login, dirty tree or unknown mode refuses before IAM query',()=>{
 for(const [opts,args] of [
  [{account:'wrong@example.invalid'},['--plan']],
  [{dirty:' M file'},['--plan']],
  [{},['--apply']],
  [{},['--plan','--create-only']]
 ]) {
  const r=run(opts,args);
  assert.equal(r.status,2,r.stdout+' '+r.stderr);
  assert.doesNotMatch(r.audit,/get-iam-policy/);
 }
});
test('script source contains no mutation commands, shell syntax remains valid',()=>{
 const source=readFileSync(SCRIPT,'utf8');
 const syntax=spawnSync('bash',['-n',SCRIPT],{encoding:'utf8'});
 assert.equal(syntax.status,0,syntax.stderr);
 assert.doesNotMatch(source,/gcloud (?:projects add-iam|iam roles create|iam service-accounts create|run jobs execute|auth print-access-token|firestore documents)/);
});

test('nonexistent separate quarantine database blocks before service-account or IAM reads',()=>{
 const r=run({missingDB:true});
 assert.equal(r.status,2,r.stdout+' '+r.stderr);
 assert.match(r.stdout,/BLOCKED: Dedicated quarantine STAGING database absent or inaccessible/);
 assert.match(r.audit,/firestore databases describe .*--database=lszh-quarantine-staging/);
 assert.doesNotMatch(r.audit,/iam service-accounts describe|iam roles describe|projects get-iam-policy|add-iam|create|execute|firestore documents/);
});
