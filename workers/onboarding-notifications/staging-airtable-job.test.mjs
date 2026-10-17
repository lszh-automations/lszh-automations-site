import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,chmodSync,existsSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const source=path.join(path.dirname(fileURLToPath(import.meta.url)),'staging-airtable-job.sh');
const digest='sha256:ce88fa70db14f5d297095da3e8faa26b72e69cdc837ca133212ebc10a09fe8ab';
const image='europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-airtable-read-probe@sha256:ce88fa70db14f5d297095da3e8faa26b72e69cdc837ca133212ebc10a09fe8ab';
function run(args=[], vars={}) {
 const dir=mkdtempSync(path.join(tmpdir(),'lszh-job-create-'));
 const bin=path.join(dir,'bin');mkdirSync(bin);
 const audit=path.join(dir,'audit');
 const created=path.join(dir,'job-created');
 const scriptDir=path.join(dir,'workers/onboarding-notifications');mkdirSync(scriptDir,{recursive:true});
 writeFileSync(path.join(scriptDir,'staging-airtable-image-verify.sh'),
   `#!/bin/bash
echo "read_only_image_verifier" >> "$FAKE_AUDIT"
[[ "\${FAKE_PIN_FAIL:-0}" == 0 ]] || exit 2
echo 'PASS: Immutable image pinned from original successful Cloud Build.'
`);
 writeFileSync(path.join(bin,'git'),`#!/bin/bash
case "$1:$2" in
 rev-parse:--show-toplevel) echo "$FAKE_ROOT" ;;
 rev-parse:HEAD) echo abc123 ;;
 rev-parse:refs/remotes/origin/feature/onboarding-notification-outbox-20261016) echo abc123 ;;
 branch:--show-current) echo feature/onboarding-notification-outbox-20261016 ;;
 status:--porcelain) echo "$FAKE_DIRTY" ;;
 *) exit 67 ;;
esac
`);
 writeFileSync(path.join(bin,'gcloud'),`#!/bin/bash
echo "$*" >> "$FAKE_AUDIT"
case "$1:$2:$3" in
 auth:list:*) echo "\${FAKE_ACCOUNT:-lars@lszh-automations.ch}" ;;
 config:get-value:project) echo lszh-automations ;;
 artifacts:docker:images) echo "\${FAKE_DIGEST:-sha256:ce88fa70db14f5d297095da3e8faa26b72e69cdc837ca133212ebc10a09fe8ab}" ;;
 iam:service-accounts:describe)
   echo '{"email":"lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com","disabled":false}' ;;
 secrets:describe:lszh-airtable-readonly-staging)
   echo '{"name":"projects/123456789012/secrets/lszh-airtable-readonly-staging","replication":{"userManaged":{"replicas":[{"location":"europe-west6","status":"READY"}]}}}' ;;
 projects:describe:lszh-automations) echo 123456789012 ;;
 secrets:versions:list)
   if [[ "\${FAKE_NO_VERSION:-0}" == 1 ]];then echo '[]'
   else echo '[{"name":"projects/123456789012/secrets/lszh-airtable-readonly-staging/versions/1","state":"ENABLED"}]'
   fi ;;
 secrets:get-iam-policy:lszh-airtable-readonly-staging)
   if [[ "\${FAKE_NO_IAM:-0}" == 1 ]]; then echo '{"bindings":[]}'
   else echo '{"bindings":[{"role":"roles/secretmanager.secretAccessor","members":["serviceAccount:lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com"]}]}'
   fi ;;
 run:jobs:list)
   if [[ "\${FAKE_PREEXISTING:-0}" == 1 ]];then echo lszh-airtable-read-probe-staging
   elif [[ -e "$FAKE_CREATED" ]];then echo lszh-airtable-read-probe-staging; fi ;;
 run:jobs:create)
   [[ "$4" == "lszh-airtable-read-probe-staging" ]] || exit 20
   [[ "$*" == *"--image=europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-airtable-read-probe@sha256:ce88fa70db14f5d297095da3e8faa26b72e69cdc837ca133212ebc10a09fe8ab"* ]] || exit 21
   [[ "$*" == *"--service-account=lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com"* ]] || exit 22
   [[ "$*" == *"--tasks=1"* && "$*" == *"--max-retries=0"* ]] || exit 23
   [[ "$*" == *"--set-secrets=/var/secrets/lszh/airtable-read-pat=lszh-airtable-readonly-staging:1"* ]] || exit 24
   [[ "$*" == *"--set-env-vars=LSZH_AIRTABLE_RUNTIME_PROBE_ONLY=true,LSZH_OUTBOX_STAGE_ENABLED=false,GOOGLE_CLOUD_PROJECT=lszh-automations"* ]] || exit 25
   [[ "$*" != *"--execute-now"* ]] || exit 26
   touch "$FAKE_CREATED"
   echo 'FAKE: Job created without execution' ;;
 run:jobs:describe)
   python3 - <<'PY'
import json,os
image=os.environ["FAKE_IMAGE"]
sa="lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com"
env=[{"name":k,"value":v} for k,v in {
 "LSZH_AIRTABLE_RUNTIME_PROBE_ONLY":"true",
 "LSZH_OUTBOX_STAGE_ENABLED":"false",
 "GOOGLE_CLOUD_PROJECT":"lszh-automations"}.items()]
d={"spec":{"template":{"spec":{
 "taskCount":1,
 "template":{"spec":{
 "serviceAccountName":sa,"maxRetries":0,
 "containers":[{"image":image,"env":env,
 "volumeMounts":[{"mountPath":"/var/secrets/lszh","name":"secret-volume"}]}],
 "volumes":[{"name":"secret-volume","secret":{
   "secretName":"lszh-airtable-readonly-staging",
   "items":[{"key":"1","path":"airtable-read-pat"}]}}]
 }}}}}
print(json.dumps(d))
PY
 ;;
 run:jobs:executions) [[ "\${FAKE_EXECUTIONS:-0}" == 0 ]] || echo a-previous-run ;;
 *) exit 88 ;;
esac
`);
 for(const n of ['git','gcloud'])chmodSync(path.join(bin,n),0o755);
 try{
  const p=spawnSync('bash',[source,...args],{
   cwd:dir,encoding:'utf8',timeout:15000,
   env:{...process.env,PATH:bin+':'+process.env.PATH,FAKE_ROOT:dir,FAKE_AUDIT:audit,FAKE_CREATED:created,FAKE_IMAGE:image,...vars}
  });
  return {...p,audit:existsSync(audit)?readFileSync(audit,'utf8'):'',created:existsSync(created)};
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test('plan validates immutable image and one secret version, no mutation',()=>{
 const r=run();
 assert.equal(r.status,0,r.stdout+' '+r.stderr);
 assert.match(r.stdout,/PLAN ONLY:/);
 assert.match(r.audit,/read_only_image_verifier/);
 assert.match(r.audit,/secrets get-iam-policy lszh-airtable-readonly-staging/);
 assert.equal(r.created,false);
 assert.doesNotMatch(r.audit,/run jobs create|run jobs execute|versions access|builds submit/);
});
test('explicit create-only pins exact digest and secret file and never executes',()=>{
 const r=run(['--create-only']);
 assert.equal(r.status,0,r.stdout+' '+r.stderr);
 assert.equal(r.created,true);
 assert.equal((r.audit.match(/run jobs create/g)||[]).length,1);
 assert.match(r.audit,/run jobs describe lszh-airtable-read-probe-staging/);
 assert.match(r.audit,/run jobs executions list --job=lszh-airtable-read-probe-staging/);
 assert.match(r.stdout,/ZERO executions/);
 assert.doesNotMatch(r.audit,/run jobs execute lszh-|--execute-now|secrets versions access|projects add-iam-policy-binding/);
});
test('forbidden identity, untrusted image, dirty branch and source pin block creation',()=>{
 for(const v of [{FAKE_ACCOUNT:'unknown@example.invalid'},{FAKE_DIGEST:'sha256:'+'a'.repeat(64)},{FAKE_DIRTY:' M local-file'},{FAKE_PIN_FAIL:'1'}]){
  const r=run(['--create-only'],v);
  assert.notEqual(r.status,0,r.stdout);
  assert.equal(r.created,false);
 }
});
test('missing secret version or scoped IAM grant prevents creation',()=>{
 for(const v of [{FAKE_NO_VERSION:'1'},{FAKE_NO_IAM:'1'}]){
  const r=run(['--create-only'],v);
  assert.notEqual(r.status,0,r.stdout);
  assert.equal(r.created,false);
 }
});
test('existing job is not overwritten',()=>{
 const r=run(['--create-only'],{FAKE_PREEXISTING:'1'});
 assert.notEqual(r.status,0,r.stdout);
 assert.match(r.stdout,/Never overwrite/);
 assert.equal(r.created,false);
});
test('unexpected executions after creation fail closed',()=>{
 const r=run(['--create-only'],{FAKE_EXECUTIONS:'1'});
 assert.notEqual(r.status,0);
 assert.match(r.stdout,/Unexpected prior execution exists/);
});
test('invalid flags are refused before any read or write',()=>{
 for(const args of [['--execute-once'],['--create-only','--yes']]){
  const r=run(args);
  assert.notEqual(r.status,0);
  assert.equal(r.audit,'');
 }
});
test('bash syntax and no Cloud Run execution, PAT read or HTTP service writes',()=>{
 const p=spawnSync('bash',['-n',source],{encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
 const script=readFileSync(source,'utf8');
 assert.match(script,/gcloud run jobs create "\$JOB"/);
 assert.match(script,/--set-secrets="\/var\/secrets\/lszh\/airtable-read-pat=\$SECRET:1"/);
 assert.doesNotMatch(script,/gcloud (?:run jobs execute|run deploy|run services update|secrets versions access|projects add-iam-policy-binding)/);
});
