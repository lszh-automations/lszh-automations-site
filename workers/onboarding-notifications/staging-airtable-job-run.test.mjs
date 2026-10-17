import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,chmodSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const source=path.join(path.dirname(fileURLToPath(import.meta.url)),'staging-airtable-job-run.sh');
const digest='sha256:ce88fa70db14f5d297095da3e8faa26b72e69cdc837ca133212ebc10a09fe8ab',image='europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-airtable-read-probe@sha256:ce88fa70db14f5d297095da3e8faa26b72e69cdc837ca133212ebc10a09fe8ab';
function simulate(args=[],vars={}){
 const root=mkdtempSync(path.join(tmpdir(),'lszh-once-'));
 const bin=path.join(root,'bin'),audit=path.join(root,'audit'),executed=path.join(root,'executed');
 mkdirSync(bin);
 writeFileSync(path.join(bin,'git'),`#!/bin/bash
case "$1:$2" in
 rev-parse:--show-toplevel) echo "$FAKE_ROOT" ;;
 rev-parse:HEAD) echo abc123 ;;
 rev-parse:refs/remotes/origin/feature/onboarding-notification-outbox-20261016) echo abc123 ;;
 branch:--show-current) echo feature/onboarding-notification-outbox-20261016 ;;
 status:--porcelain) echo "$FAKE_DIRTY" ;;
 cat-file:-e) [[ "\${FAKE_PIN_FAIL:-0}" == 0 ]] || exit 44 ;;
 diff:--quiet) [[ "\${FAKE_PIN_FAIL:-0}" == 0 ]] || exit 44 ;;
 *) exit 88 ;;
esac
`);
 writeFileSync(path.join(bin,'gcloud'),`#!/bin/bash
echo "$*" >> "$FAKE_AUDIT"
case "$1:$2:$3" in
 auth:list:*) echo "\${FAKE_ACCOUNT:-lars@lszh-automations.ch}" ;;
 config:get-value:project) echo lszh-automations ;;
 builds:describe:1b909760-deb7-49a9-bfe8-b4e20af68133)
  python3 - <<'PY'
import json,os
tag="europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-airtable-read-probe:stg-c7ebdde79b67"
digest=os.environ["FAKE_IMAGE_DIGEST"]
print(json.dumps({"id":"1b909760-deb7-49a9-bfe8-b4e20af68133",
 "status":os.environ.get("FAKE_BUILD_STATUS","SUCCESS"),"images":[tag],
 "results":{"images":[{"name":tag,"digest":digest}]}}))
PY
  ;;
 artifacts:docker:images) echo "\${FAKE_REGISTRY_DIGEST:-$FAKE_IMAGE_DIGEST}" ;;
 iam:service-accounts:describe)
  echo '{"email":"lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com","disabled":false}' ;;
 secrets:describe:lszh-airtable-readonly-staging)
  echo '{"name":"projects/123456789012/secrets/lszh-airtable-readonly-staging","replication":{"userManaged":{"replicas":[{"location":"europe-west6"}]}}}' ;;
 projects:describe:lszh-automations) echo 123456789012 ;;
 secrets:versions:list)
  if [[ "\${FAKE_MISSING_VERSION:-0}" == 1 ]]; then echo '[]';
  else echo '[{"name":"projects/123456789012/secrets/lszh-airtable-readonly-staging/versions/1","state":"ENABLED"}]'; fi ;;
 secrets:get-iam-policy:lszh-airtable-readonly-staging)
  if [[ "\${FAKE_IAM_MISSING:-0}" == 1 ]];then echo '{"bindings":[]}'
  else echo '{"bindings":[{"role":"roles/secretmanager.secretAccessor","members":["serviceAccount:lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com"]}]}'; fi ;;
 run:jobs:describe)
  python3 - <<'PY'
import json,os
image=os.environ["FAKE_IMAGE"]
env=[{"name":x,"value":y} for x,y in {
 "LSZH_AIRTABLE_RUNTIME_PROBE_ONLY":"true",
 "LSZH_OUTBOX_STAGE_ENABLED":"false",
 "GOOGLE_CLOUD_PROJECT":"lszh-automations"}.items()]
if os.environ.get("FAKE_UNSAFE_ENV","0")=="1":
 env.append({"name":"LSZH_OUTBOX_STAGE_ENABLED","value":"true"})
task={"serviceAccountName":"lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com",
 "maxRetries":int(os.environ.get("FAKE_RETRIES","0")),
 "containers":[{"image":image,"env":env,
 "volumeMounts":[{"name":"vol-secret","mountPath":"/var/secrets/lszh"}]}],
 "volumes":[{"name":"vol-secret","secret":{"secretName":"lszh-airtable-readonly-staging",
 "items":[{"key":"1","path":"airtable-read-pat"}]}}]}
if os.environ.get("FAKE_SCHEMA","v1")=="v2":
 task["serviceAccount"]=task.pop("serviceAccountName")
 for vol in task["volumes"]:
  vol["secret"]["secret"]=vol["secret"].pop("secretName")
  for item in vol["secret"]["items"]:item["version"]=item.pop("key")
 d={"template":{"taskCount":1,"parallelism":1,"template":task}}
else:
 d={"spec":{"template":{"spec":{"taskCount":1,"parallelism":1,
     "template":{"spec":task}}}}}
print(json.dumps(d))
PY
 ;;
 run:jobs:executions)
   if [[ -e "$FAKE_EXECUTED" || "\${FAKE_PREVIOUS:-0}" == 1 ]];then
      echo '[{"name":"projects/123456789012/locations/europe-west6/jobs/lszh-airtable-read-probe-staging/executions/a"}]'
   elif [[ "\${FAKE_BAD_LIST:-0}" == 1 ]];then echo 'INVALID_JSON'
   else echo '[]';fi ;;
 run:jobs:execute)
  [[ "$4" == 'lszh-airtable-read-probe-staging' ]] || exit 40
  [[ "$*" == *"--wait"* ]] || exit 41
  [[ "$*" != *"--tasks="* && "$*" != *"--update-env-vars="* && "$*" != *"--args="* ]] || exit 42
  touch "$FAKE_EXECUTED"
  [[ "\${FAKE_EXEC_FAIL:-0}" == 0 ]] || exit 55
  echo 'FAKE: one job execution completed' ;;
 *) exit 88 ;;
esac
`);
 for(const name of ['git','gcloud'])chmodSync(path.join(bin,name),0o755);
 try {
  const p=spawnSync('bash',[source,...args],{cwd:root,encoding:'utf8',timeout:20000,
   env:{...process.env,PATH:bin+':'+process.env.PATH,
    FAKE_ROOT:root,FAKE_AUDIT:audit,FAKE_EXECUTED:executed,
    FAKE_IMAGE:image,FAKE_IMAGE_DIGEST:digest,...vars}});
  return {...p,audit:existsSync(audit)?readFileSync(audit,'utf8'):'',executed:existsSync(executed)};
 }finally{rmSync(root,{recursive:true,force:true});}
}
test('default plan validates everything, requires zero executions and never starts job',()=>{
 const r=simulate();
 assert.equal(r.status,0,r.stderr+' '+r.stdout);
 assert.match(r.stdout,/PLAN ONLY: No live Airtable GET/);
 assert.match(r.stdout,/Zero Cloud Run executions registered/);
 assert.doesNotMatch(r.audit,/run jobs execute lszh-|run jobs create|secrets versions access/);
 assert.equal(r.executed,false);
});
test('explicit one-shot executes exactly once and only with --wait',()=>{
 const r=simulate(['--execute-once']);
 assert.equal(r.status,0,r.stdout+' '+r.stderr);
 assert.equal(r.executed,true);
 assert.equal((r.audit.match(/run jobs execute lszh-airtable-read-probe-staging/g)||[]).length,1);
 assert.equal((r.audit.match(/run jobs executions list/g)||[]).length,2);
 assert.match(r.stdout,/DO NOT RERUN/);
});
test('v2 Cloud Run job representation also passes exact read-only layout check',()=>{
 const r=simulate([],{FAKE_SCHEMA:'v2'});
 assert.equal(r.status,0,r.stdout+' '+r.stderr);
});
test('one prior execution rejects even explicit one-shot without writing',()=>{
 const r=simulate(['--execute-once'],{FAKE_PREVIOUS:'1'});
 assert.notEqual(r.status,0);
 assert.match(r.stdout,/Job was already executed/);
 assert.equal(r.executed,false);
});
test('malformed list, wrong IAM, version, digest, account or runtime flags fail closed',()=>{
 for(const varset of [
  {FAKE_BAD_LIST:'1'}, {FAKE_IAM_MISSING:'1'},{FAKE_MISSING_VERSION:'1'},
  {FAKE_REGISTRY_DIGEST:'sha256:'+'a'.repeat(64)},
  {FAKE_BUILD_STATUS:'FAILURE'},{FAKE_ACCOUNT:'wrong@example.invalid'},
  {FAKE_UNSAFE_ENV:'1'},{FAKE_RETRIES:'1'},{FAKE_PIN_FAIL:'1'},
  {FAKE_DIRTY:' M changes'}
 ]){
  const r=simulate(['--execute-once'],varset);
  assert.notEqual(r.status,0,'unexpected pass for '+JSON.stringify(varset)+r.stdout);
  assert.equal(r.executed,false);
 }
});
test('a failed live execution refuses automated or blind retry',()=>{
 const r=simulate(['--execute-once'],{FAKE_EXEC_FAIL:'1'});
 assert.notEqual(r.status,0);
 assert.equal(r.executed,true);
 assert.match(r.stdout,/DO NOT RERUN/);
 assert.equal((r.audit.match(/run jobs execute lszh-airtable-read-probe-staging/g)||[]).length,1);
});
test('unknown parameters blocked before any GCP interaction',()=>{
 for(const args of [['--create-only'],['--execute-once','--yes']]){
  const r=simulate(args);
  assert.notEqual(r.status,0);
  assert.equal(r.audit,'');
 }
});
test('Bash syntax and forbidden mutating gcloud operations',()=>{
 const p=spawnSync('bash',['-n',source],{encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
 const s=readFileSync(source,'utf8');
 assert.match(s,/gcloud run jobs execute "\$JOB"/);
 assert.doesNotMatch(s,/gcloud (?:run jobs (?:create|update|delete)|run services update|builds submit|secrets versions access|secrets add-iam-policy-binding|projects add-iam-policy-binding)/);
});
