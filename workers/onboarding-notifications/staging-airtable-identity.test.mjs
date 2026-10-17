import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync,chmodSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const dir=path.dirname(fileURLToPath(import.meta.url));
const source=path.join(dir,'staging-airtable-identity.sh');
function fakeShell(args=[],options={}) {
 const root=mkdtempSync(path.join(tmpdir(),'lszh-airt-id-'));
 const bin=path.join(root,'bin');mkdirSync(bin);
 const audit=path.join(root,'audit.txt');
 const git=path.join(bin,'git');
 writeFileSync(git,`#!/bin/bash
case "$1:$2" in
 rev-parse:--show-toplevel) echo "$FAKE_ROOT" ;;
 rev-parse:HEAD) echo abc123 ;;
 rev-parse:refs/remotes/origin/feature/onboarding-notification-outbox-20261016) echo abc123 ;;
 branch:--show-current) echo feature/onboarding-notification-outbox-20261016 ;;
 status:--porcelain) echo "$FAKE_DIRTY" ;;
 *) exit 12 ;;
esac
`);
 const gcloud=path.join(bin,'gcloud');
 writeFileSync(gcloud,`#!/bin/bash
echo "$*" >> "$FAKE_AUDIT"
case "$1:$2:$3" in
 auth:list:*) echo "${FAKE_ACCOUNT:-lars@lszh-automations.ch}" ;;
 config:get-value:project) echo lszh-automations ;;
 iam:service-accounts:list) [[ "${FAKE_ENUM_FAIL:-0}" == 0 ]] || exit 77; [[ "${FAKE_HAS_SA:-0}" == 0 ]] || echo lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com ;;
 iam:service-accounts:create) exit 0 ;;
 iam:service-accounts:describe) echo lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com ;;
 secrets:list:*) [[ "${FAKE_HAS_SECRET:-0}" == 0 ]] || echo projects/lszh-automations/secrets/lszh-airtable-readonly-staging ;;
 run:jobs:list) [[ "${FAKE_HAS_JOB:-0}" == 0 ]] || echo projects/lszh-automations/locations/europe-west6/jobs/lszh-airtable-read-probe-staging ;;
 *) exit 88 ;;
esac
`);
 chmodSync(git,0o755);chmodSync(gcloud,0o755);
 try {
  const p=spawnSync('bash',[source,...args],{
   cwd:root,encoding:'utf8',timeout:8000,
   env:{...process.env,PATH:bin+':'+process.env.PATH,
    FAKE_ROOT:root,FAKE_AUDIT:audit,...options}
  });
  return {...p,audit:existsSync(audit)?readFileSync(audit,'utf8'):''};
 }finally{rmSync(root,{recursive:true,force:true});}
}
test('plan enumerates existing metadata but never creates identities or permissions',()=>{
 const r=fakeShell();
 assert.equal(r.status,0,r.stderr+' '+r.stdout);
 assert.match(r.stdout,/PLAN ONLY/);
 assert.doesNotMatch(r.audit,/iam service-accounts create|add-iam-policy-binding|secrets create|jobs create|jobs execute/);
});
test('explicit identity creation grants no roles and never touches existing Cloud Run services',()=>{
 const r=fakeShell(['--create-identity']);
 assert.equal(r.status,0,r.stderr+' '+r.stdout);
 assert.match(r.stdout,/NO new IAM grants/);
 assert.equal(r.audit.match(/iam service-accounts create/g)?.length,1);
 assert.doesNotMatch(r.audit,/policy-binding|secrets add|secrets create|jobs create|jobs execute|run services/);
});
test('preexisting SA or secret or job prevents any resources being created',()=>{
 for(const key of ['FAKE_HAS_SA','FAKE_HAS_SECRET','FAKE_HAS_JOB']){
  const r=fakeShell(['--create-identity'],{[key]:'1'});
  assert.notEqual(r.status,0);
  assert.match(r.stdout,/already exist/);
  assert.doesNotMatch(r.audit,/iam service-accounts create/);
 }
});
test('wrong user, dirty branch or metadata access failure fails without GCP mutation',()=>{
 for (const vars of [{FAKE_ACCOUNT:'someone@example.invalid'},{FAKE_DIRTY:' M untracked'},{FAKE_ENUM_FAIL:'1'}]) {
  const r=fakeShell(['--create-identity'],vars);
  assert.notEqual(r.status,0);
  assert.doesNotMatch(r.audit,/iam service-accounts create/);
 }
});
test('extra arguments or unsupported mode fail before all cloud commands',()=>{
 for(const flags of [['--apply'],['--create-identity','unexpected']]){
  const r=fakeShell(flags);
  assert.notEqual(r.status,0);
  assert.equal(r.audit,'');
 }
});
test('shell syntax remains valid and script has no private key or project-wide grants',()=>{
 const r=spawnSync('bash',['-n',source],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 const s=readFileSync(source,'utf8');
 assert.doesNotMatch(s,/add-iam-policy-binding|keys create|roles\/secretmanager\.secretAccessor|run jobs (create|execute)/);
});
