import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,chmodSync,readFileSync,existsSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const source=path.join(path.dirname(fileURLToPath(import.meta.url)),'staging-airtable-execution-diagnose.sh');
function run(vars={},args=[]){
 const root=mkdtempSync(path.join(tmpdir(),'lszh-failed-job-'));
 const bin=path.join(root,'bin');mkdirSync(bin);
 const audit=path.join(root,'audit');
 writeFileSync(path.join(bin,'git'),`#!/bin/bash
case "$1:$2" in
 rev-parse:--show-toplevel) echo "$FAKE_ROOT" ;;
 rev-parse:HEAD) echo abc123 ;;
 rev-parse:refs/remotes/origin/feature/onboarding-notification-outbox-20261016) echo abc123 ;;
 branch:--show-current) echo feature/onboarding-notification-outbox-20261016 ;;
 status:--porcelain) echo "$FAKE_DIRTY" ;;
 *) exit 99 ;;
esac
`);
 writeFileSync(path.join(bin,'gcloud'),`#!/bin/bash
echo "$*" >> "$FAKE_AUDIT"
case "$1:$2:$3" in
 auth:list:*) echo "\${FAKE_ACCOUNT:-lars@lszh-automations.ch}" ;;
 config:get-value:project) echo lszh-automations ;;
 run:jobs:executions)
  if [[ "$4" == list ]]; then
   [[ "\${FAKE_SECOND:-0}" == 1 ]] && echo '[{"name":"other-execution"}]' ||
     echo '[{"name":"lszh-airtable-read-probe-staging-xglcz"}]'
  elif [[ "$4" == describe ]]; then
   echo '{"name":"projects/470613067122/locations/europe-west6/jobs/lszh-airtable-read-probe-staging/executions/lszh-airtable-read-probe-staging-xglcz","failedCount":1,"succeededCount":0}'
  else exit 70; fi ;;
 logging:read:*)
  [[ "$*" == *'resource.type="cloud_run_job"'* ]] || exit 71
  [[ "$*" == *'resource.labels.job_name="lszh-airtable-read-probe-staging"'* ]] || exit 72
  [[ "$*" == *'resource.labels.location="europe-west6"'* ]] || exit 74
  [[ "$*" != *'labels.execution_name='* ]] || exit 75
  if [[ "\${FAKE_LOG_FAIL:-0}" == 1 ]]; then exit 73;fi
  if [[ "\${FAKE_NO_LOGS:-0}" == 1 ]]; then echo '[]';else
    python3 - <<'PY'
import json,os
txt=os.environ.get("FAKE_LOG","STOP: airtable_runtime_probe_disabled")
label={"run.googleapis.com/execution_name":os.environ.get("FAKE_LOG_EXECUTION","lszh-airtable-read-probe-staging-xglcz")}
entry={"resource":{"type":"cloud_run_job","labels":{"job_name":"lszh-airtable-read-probe-staging","location":"europe-west6"}},"labels":label}
print(json.dumps([
 {**entry,"textPayload":txt},
 {**entry,"textPayload":"Do not print pat_SUPER_SECRET_VALUE_12345"},
 {**entry,"labels":{"run.googleapis.com/execution_name":"unrelated-job-execution"},"textPayload":"STOP: airtable_token_not_authorized"}
]))
PY
  fi ;;
 *) exit 89 ;;
esac
`);
 for(const k of ['git','gcloud'])chmodSync(path.join(bin,k),0o755);
 try{
  const p=spawnSync('bash',[source,...args],{cwd:root,encoding:'utf8',timeout:10000,
   env:{...process.env,PATH:bin+':'+process.env.PATH,FAKE_ROOT:root,FAKE_AUDIT:audit,...vars}});
  return {...p,audit:existsSync(audit)?readFileSync(audit,'utf8'):''};
 }finally{rmSync(root,{recursive:true,force:true});}
}
test('read-only report shows known stop code, not arbitrary raw logs or PAT',()=>{
 const r=run();
 assert.equal(r.status,0,r.stdout+' '+r.stderr);
 assert.match(r.stdout,/airtable_runtime_probe_disabled/);
 assert.match(r.stdout,/Exactly one recorded Job execution/);
 assert.match(r.stdout,/PASS: Exact execution metadata read/);
 assert.match(r.stdout,/Execution reported failed tasks: 1/);
 assert.match(r.stdout,/Execution reported successful tasks: 0/);
 assert.match(r.stdout,/READ ONLY:/);
 assert.doesNotMatch(r.stdout,/pat_SUPER_SECRET|Do not print/);
 assert.match(r.audit,/logging read .*resource.labels.job_name=/);
 assert.doesNotMatch(r.audit,/logging read .*labels.execution_name=/);
 assert.match(r.stdout,/Entries matching execution label: 2/);
 assert.match(r.stdout,/Other\/unusable entries ignored: 1/);
 assert.doesNotMatch(r.stdout,/airtable_token_not_authorized/);
 assert.doesNotMatch(r.audit,/jobs execute|jobs create|secrets versions access/);
});
test('mismatched execution labels are ignored without leaking unrelated log content',()=>{
 const r=run({FAKE_LOG_EXECUTION:'some-other-execution'});
 assert.equal(r.status,0,r.stdout+' '+r.stderr);
 assert.match(r.stdout,/Matching or safely attributable entries: 0/);
 assert.match(r.stdout,/Other\/unusable entries ignored: 3/);
 assert.doesNotMatch(r.stdout,/airtable_runtime_probe_disabled|airtable_token_not_authorized|SUPER_SECRET/);
});
test('local EACCES for Secret file is classified without revealing mounted path or PAT',()=>{
 const r=run({FAKE_LOG:"Error: EACCES: permission denied, open '/var/secrets/lszh/airtable-read-pat' value pat_SUPER_SECRET_VALUE"});
 assert.equal(r.status,0,r.stdout+' '+r.stderr);
 assert.match(r.stdout,/Permission evidence classification: .*NODE_SECRET_MOUNT_FILE_DENIED/);
 assert.doesNotMatch(r.stdout,/\/var\/secrets\/lszh|airtable-read-pat|SUPER_SECRET_VALUE/);
});
test('Google Secret Manager API denial is distinguished from local file ownership failure',()=>{
 const r=run({FAKE_LOG:"Permission 'secretmanager.versions.access' denied for resource, PERMISSION_DENIED 403. PAT=pat_SUPER_SECRET"});
 assert.equal(r.status,0,r.stdout+' '+r.stderr);
 assert.match(r.stdout,/Permission evidence classification: .*SECRET_MANAGER_API_ACCESS_DENIED/);
 assert.doesNotMatch(r.stdout,/NODE_SECRET_MOUNT_FILE_DENIED|secretmanager\.versions\.access|SUPER_SECRET/);
});
test('only generic permission denied evidence avoids falsely claiming Secret access cause',()=>{
 const r=run({FAKE_LOG:'Permission denied while opening an unspecified resource'});
 assert.equal(r.status,0,r.stdout+' '+r.stderr);
 assert.match(r.stdout,/Permission evidence classification: GENERIC_PERMISSION_DENIED_ONLY/);
 assert.doesNotMatch(r.stdout,/NODE_SECRET_MOUNT_FILE_DENIED|SECRET_MANAGER_API_ACCESS_DENIED/);
});
test('runtime module-not-found error is categorized without leaking module path',()=>{
 const r=run({FAKE_LOG:"Error: Cannot find module '/app/private/customer_secret' PAT=pat_SUPER_SECRET"});
 assert.equal(r.status,0,r.stdout);
 assert.match(r.stdout,/NODE_MODULE_NOT_FOUND/);
 assert.doesNotMatch(r.stdout,/customer_secret|PAT=|SUPER_SECRET/);
});
test('empty log results are explicitly inconclusive without rerun',()=>{
 const r=run({FAKE_NO_LOGS:'1'});
 assert.equal(r.status,0);
 assert.match(r.stdout,/No matching job\/container logs found/);
 assert.doesNotMatch(r.audit,/jobs execute/);
});
test('wrong execution identity stops before Cloud Logging',()=>{
 const r=run({FAKE_SECOND:'1'});
 assert.notEqual(r.status,0);
 assert.doesNotMatch(r.audit,/logging read/);
});
test('wrong business identity or dirty checkout stop before execution lookups',()=>{
 for(const vars of [{FAKE_ACCOUNT:'wrong@example.invalid'},{FAKE_DIRTY:' M edited'}]){
  const r=run(vars);
  assert.notEqual(r.status,0);
  assert.doesNotMatch(r.audit,/run jobs executions|logging read/);
 }
});
test('failure reading log metadata never starts a new execution',()=>{
 const r=run({FAKE_LOG_FAIL:'1'});
 assert.notEqual(r.status,0);
 assert.match(r.stdout,/STOP: Could not access execution logs/);
 assert.doesNotMatch(r.audit,/jobs execute|jobs create/);
});
test('rejects parameters and has valid Bash syntax without any write operations',()=>{
 const r=run({},['--execute-once']);
 assert.notEqual(r.status,0);
 assert.equal(r.audit,'');
 const s=readFileSync(source,'utf8');
 const p=spawnSync('bash',['-n',source],{encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
 assert.doesNotMatch(s,/gcloud (?:run jobs execute|run jobs create|run jobs update|builds submit|secrets versions access|projects add-iam-policy-binding|secrets add-iam-policy-binding)/);
 assert.match(s,/gcloud logging read/);
});
