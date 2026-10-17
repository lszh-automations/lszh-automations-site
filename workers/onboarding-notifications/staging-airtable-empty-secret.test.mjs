import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync,chmodSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const source=path.join(path.dirname(fileURLToPath(import.meta.url)),'staging-airtable-empty-secret.sh');
function simulate(args=[],vars={}) {
 const root=mkdtempSync(path.join(tmpdir(),'lszh-airtable-empty-'));
 const bin=path.join(root,'bin');mkdirSync(bin);
 const audit=path.join(root,'audit.txt');
 writeFileSync(path.join(bin,'git'),`#!/bin/bash
case "$1:$2" in
 rev-parse:--show-toplevel) echo "$FAKE_ROOT" ;;
 rev-parse:HEAD) echo abc123 ;;
 rev-parse:refs/remotes/origin/feature/onboarding-notification-outbox-20261016) echo abc123 ;;
 branch:--show-current) echo feature/onboarding-notification-outbox-20261016 ;;
 status:--porcelain) echo "$FAKE_DIRTY" ;;
 *) exit 12 ;;
esac
`);
 writeFileSync(path.join(bin,'gcloud'),`#!/bin/bash
echo "$*" >> "$FAKE_AUDIT"
case "$1:$2:$3" in
 auth:list:*) echo "\${FAKE_ACCOUNT:-lars@lszh-automations.ch}" ;;
 config:get-value:project) echo lszh-automations ;;
 iam:service-accounts:describe)
  echo '{"email":"lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com","disabled":false}' ;;
 secrets:list:*) [[ "\${FAKE_ENUM_FAIL:-0}" == 0 ]] || exit 77
  [[ "\${FAKE_HAS_SECRET:-0}" == 0 ]] || echo projects/lszh-automations/secrets/lszh-airtable-readonly-staging ;;
 run:jobs:list) [[ "\${FAKE_HAS_JOB:-0}" == 0 ]] || echo lszh-airtable-read-probe-staging ;;
 secrets:create:*) exit 0 ;;
 secrets:describe:*)
  if [[ "\${FAKE_WRONG_LOCATION:-0}" == 1 ]]; then
    echo '{"name":"projects/lszh-automations/secrets/lszh-airtable-readonly-staging","replication":{"userManaged":{"replicas":[{"location":"us-central1"}]}}}'
  else
    echo '{"name":"projects/lszh-automations/secrets/lszh-airtable-readonly-staging","replication":{"userManaged":{"replicas":[{"location":"europe-west6"}]}}}'
  fi ;;
 secrets:versions:list) [[ "$4" == "lszh-airtable-readonly-staging" ]] || exit 64; [[ "$*" != *"--secret="* ]] || exit 64;
  [[ "\${FAKE_HAS_VERSION:-0}" == 0 ]] || echo projects/lszh-automations/secrets/lszh-airtable-readonly-staging/versions/1 ;;
 *) exit 88 ;;
esac
`);
 chmodSync(path.join(bin,'git'),0o755);
 chmodSync(path.join(bin,'gcloud'),0o755);
 try{
  const p=spawnSync('bash',[source,...args],{cwd:root,encoding:'utf8',timeout:9000,
   env:{...process.env,PATH:bin+':'+process.env.PATH,
    FAKE_ROOT:root,FAKE_AUDIT:audit,...vars}});
  return {...p,audit:existsSync(audit)?readFileSync(audit,'utf8'):''};
 }finally{rmSync(root,{recursive:true,force:true});}
}
test('default plan verifies named SA and enumerates resources with zero writes',()=>{
 const r=simulate();
 assert.equal(r.status,0,r.stderr+' '+r.stdout);
 assert.match(r.stdout,/PLAN ONLY/);
 assert.match(r.audit,/iam service-accounts describe/);
 assert.doesNotMatch(r.audit,/secrets create|secrets versions add|add-iam-policy-binding|jobs create/);
});
test('explicit empty secret creates Zurich-only user-managed replica and no version',()=>{
 const r=simulate(['--create-empty']);
 assert.equal(r.status,0,r.stderr+' '+r.stdout);
 assert.match(r.stdout,/zero secret versions/);
 assert.match(r.audit,/secrets versions list lszh-airtable-readonly-staging --project=lszh-automations/);
 assert.doesNotMatch(r.audit,/secrets versions list --secret=/);
 assert.equal(r.audit.match(/secrets create/g)?.length,1);
 assert.match(r.audit,/--replication-policy=user-managed --locations=europe-west6/);
 assert.match(r.audit,/secrets describe/);
 assert.match(r.audit,/secrets versions list/);
 assert.doesNotMatch(r.audit,/secrets versions add|add-iam-policy-binding|jobs create|jobs execute|run deploy/);
});
test('existing secret or job prevents mutation',()=>{
 for(const key of ['FAKE_HAS_SECRET','FAKE_HAS_JOB']){
  const r=simulate(['--create-empty'],{[key]:'1'});
  assert.notEqual(r.status,0);
  assert.match(r.stdout,/Refusing to overwrite/);
  assert.doesNotMatch(r.audit,/secrets create/);
 }
});
test('incorrect account, dirty branch or resource-inventory error blocks creation',()=>{
 for(const vars of [
  {FAKE_ACCOUNT:'nobody@example.invalid'},
  {FAKE_DIRTY:' M untracked'},
  {FAKE_ENUM_FAIL:'1'}
 ]){
  const r=simulate(['--create-empty'],vars);
  assert.notEqual(r.status,0);
  assert.doesNotMatch(r.audit,/secrets create/);
 }
});
test('unexpected secret replication or nonempty versions cannot be marked complete',()=>{
 for(const vars of [{FAKE_WRONG_LOCATION:'1'},{FAKE_HAS_VERSION:'1'}]){
  const r=simulate(['--create-empty'],vars);
  assert.notEqual(r.status,0);
  assert.match(r.stdout,/STOP:/);
 }
});
test('only known single modes supported, no gcloud on unexpected flags',()=>{
 for(const args of [['--add-version'],['--create-empty','unexpected']]){
  const r=simulate(args);
  assert.notEqual(r.status,0);
  assert.equal(r.audit,'');
 }
});
test('syntax and source explicitly exclude credentials, grants and job execution',()=>{
 const chk=spawnSync('bash',['-n',source],{encoding:'utf8'});
 assert.equal(chk.status,0,chk.stderr);
 const s=readFileSync(source,'utf8');
 assert.doesNotMatch(s,/secrets versions add|secrets versions access|roles\/secretmanager|add-iam-policy-binding|run jobs execute|--data-file=/);
});
