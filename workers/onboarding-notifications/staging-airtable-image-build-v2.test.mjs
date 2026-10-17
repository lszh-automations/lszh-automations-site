import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,chmodSync,existsSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const worker=path.dirname(fileURLToPath(import.meta.url));
const source=path.join(worker,'staging-airtable-image-build-v2.sh');
const SOURCES=[
 'onboarding/confirmation.js',
 'workers/onboarding-notifications/staging-airtable-rest-read.js',
 'workers/onboarding-notifications/airtable-runtime-probe-v2.js',
 'workers/onboarding-notifications/Dockerfile.airtable-read-probe-v2',
 'workers/onboarding-notifications/cloudbuild.airtable-read-probe-v2.yaml'
];
function simulate(args=[],vars={}){
 const root=mkdtempSync(path.join(tmpdir(),'lszh-build-probe-'));
 const bin=path.join(root,'bin');
 mkdirSync(bin);
 const audit=path.join(root,'audit');
 // Build-only copies SOURCE, not docs, GitHub, tokens or customer records.
 for(const p of SOURCES){
  const to=path.join(root,p);
  mkdirSync(path.dirname(to),{recursive:true});
  copyFileSync(path.join(worker,'..','..',p),to);
 }
 writeFileSync(path.join(bin,'git'),`#!/bin/bash
case "$1:$2" in
 rev-parse:--show-toplevel) echo "$FAKE_ROOT" ;;
 rev-parse:HEAD) echo good123 ;;
 rev-parse:refs/remotes/origin/feature/onboarding-notification-outbox-20261016) echo good123 ;;
 branch:--show-current) echo feature/onboarding-notification-outbox-20261016 ;;
 status:--porcelain) echo "$FAKE_DIRTY" ;;
 cat-file:-e) [[ "\${FAKE_PIN_FAIL:-0}" == 0 ]] || exit 44 ;;
 diff:--quiet) [[ "\${FAKE_DIFF_FAIL:-0}" == 0 ]] || exit 44 ;;
 *) exit 88 ;;
esac
`);
 writeFileSync(path.join(bin,'gcloud'),`#!/bin/bash
echo "$*" >> "$FAKE_AUDIT"
case "$1:$2:$3" in
 auth:list:*) echo "\${FAKE_ACCOUNT:-lars@lszh-automations.ch}" ;;
 config:get-value:project) echo lszh-automations ;;
 iam:service-accounts:describe) echo lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com ;;
 artifacts:repositories:describe) echo projects/lszh-automations/locations/europe-west6/repositories/cloud-run-source-deploy ;;
 secrets:describe:lszh-airtable-readonly-staging)
   echo '{"name":"projects/123456789012/secrets/lszh-airtable-readonly-staging","replication":{"userManaged":{"replicas":[{"location":"europe-west6","status":"READY"}]}}}' ;;
 projects:describe:lszh-automations) echo 123456789012 ;;
 secrets:versions:list)
   if [[ "\${FAKE_VERSION_MISSING:-0}" == 1 ]];then echo '[]'
   else echo '[{"name":"projects/123456789012/secrets/lszh-airtable-readonly-staging/versions/1","state":"ENABLED"}]'
   fi ;;
 secrets:get-iam-policy:lszh-airtable-readonly-staging)
   if [[ "\${FAKE_IAM_MISSING:-0}" == 1 ]];then echo '{"bindings":[]}'
   else echo '{"bindings":[{"role":"roles/secretmanager.secretAccessor","members":["serviceAccount:lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com"]}]}'
   fi ;;
 run:jobs:list)
   [[ "\${FAKE_HISTORIC_MISSING:-0}" == 1 ]] || echo lszh-airtable-read-probe-staging
   [[ "\${FAKE_NEW_JOB:-0}" == 1 ]] && echo lszh-airtable-read-probe-fix-staging
   : ;;
 run:jobs:executions)
   [[ "$4" == list ]] || exit 92
   if [[ "\${FAKE_HISTORY_WRONG:-0}" == 1 ]];then
    echo '[{"name":"other-execution"}]'
   else echo '[{"name":"lszh-airtable-read-probe-staging-xglcz"}]';fi ;;
 builds:submit:*)
   test -d "$3" || exit 78
   [[ "$*" == *"--region=europe-west6"* ]] || exit 78
   [[ "$*" == *"--substitutions=_IMAGE=europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-airtable-read-probe:stg-permfix-0f2f7890720f"* ]] || exit 78
   test "$(find "$3" -type f | wc -l | tr -d '[:space:]')" == 5 || exit 78
   for f in "$3/onboarding/confirmation.js" "$3/workers/onboarding-notifications/staging-airtable-rest-read.js" "$3/workers/onboarding-notifications/airtable-runtime-probe-v2.js" "$3/workers/onboarding-notifications/Dockerfile.airtable-read-probe-v2" "$3/workers/onboarding-notifications/cloudbuild.airtable-read-probe-v2.yaml";do
    [[ "$(stat -c '%a' "$f")" == 644 ]] || exit 79
   done
   for dir in "$3/onboarding" "$3/workers" "$3/workers/onboarding-notifications";do
    [[ "$(stat -c '%a' "$dir")" == 755 ]] || exit 79
   done
   grep -q '^USER node$' "$3/workers/onboarding-notifications/Dockerfile.airtable-read-probe-v2" || exit 79
   echo 'FAKE: permissions 0644/0755, nonroot preserved'
   echo 'FAKE: isolated five-file build accepted' ;;
 *) exit 88 ;;
esac
`);
 for (const n of ['git','gcloud'])chmodSync(path.join(bin,n),0o755);
 try{
  const p=spawnSync('bash',[source,...args],{
   cwd:root,encoding:'utf8',timeout:15000,
   env:{...process.env,PATH:bin+':'+process.env.PATH,FAKE_ROOT:root,FAKE_AUDIT:audit,...vars}
  });
  return {...p,audit:existsSync(audit)?readFileSync(audit,'utf8'):''};
 }finally{rmSync(root,{recursive:true,force:true});}
}
test('default plan reads identity, SA, registry, one version and secret IAM, but never builds',()=>{
 const r=simulate();
 assert.equal(r.status,0,r.stderr+' '+r.stdout);
 assert.match(r.stdout,/PLAN ONLY:/);
 assert.match(r.audit,/secrets get-iam-policy/);
 assert.doesNotMatch(r.audit,/builds submit|run jobs create|run jobs execute|versions access|add-iam-policy-binding/);
});
test('build-only is a single isolated five-file Cloud Build submission, never deploys',()=>{
 const r=simulate(['--build-only']);
 assert.equal(r.status,0,r.stderr+' '+r.stdout);
 assert.match(r.stdout,/PASS: Permission-fixed STAGING Airtable-read v2 image build returned successfully/);
 assert.equal((r.audit.match(/builds submit/g)||[]).length,1);
 assert.match(r.stdout,/five mode-corrected reviewed files/);
 assert.match(r.stdout,/Original failed job preserved/);
 assert.doesNotMatch(r.audit,/jobs create|jobs execute|run deploy|versions access|add-iam-policy-binding/);
});
test('wrong account, dirty checkout, or source pin mismatch prevent Cloud Build',()=>{
 for(const v of [{FAKE_ACCOUNT:'other@example.invalid'},{FAKE_DIRTY:' M a'},{FAKE_PIN_FAIL:'1'},{FAKE_DIFF_FAIL:'1'}]){
  const r=simulate(['--build-only'],v);
  assert.notEqual(r.status,0,r.stdout+' '+r.stderr);
  assert.doesNotMatch(r.audit,/builds submit/);
 }
});
test('missing secret version or access grant blocks Cloud Build',()=>{
 for(const v of [{FAKE_VERSION_MISSING:'1'},{FAKE_IAM_MISSING:'1'}]){
  const r=simulate(['--build-only'],v);
  assert.notEqual(r.status,0,r.stdout+' '+r.stderr);
  assert.doesNotMatch(r.audit,/builds submit/);
 }
});
test('missing historical failed job, wrong execution, or existing new job fails closed',()=>{
 for(const v of [{FAKE_HISTORIC_MISSING:'1'},{FAKE_HISTORY_WRONG:'1'},{FAKE_NEW_JOB:'1'}]){
  const r=simulate(['--build-only'],v);
  assert.notEqual(r.status,0,r.stdout+' '+r.stderr);
  assert.doesNotMatch(r.audit,/builds submit/);
 }
});
test('unsupported flags fail before any GCP commands',()=>{
 for(const args of [['--apply'],['--build-only','--execute-once']]){
  const r=simulate(args);
  assert.notEqual(r.status,0);
  assert.equal(r.audit,'');
 }
});
test('shell syntax valid, only build submission allowed',()=>{
 const p=spawnSync('bash',['-n',source],{encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
 const s=readFileSync(source,'utf8');
 assert.match(s,/gcloud builds submit/);
 assert.doesNotMatch(s,/gcloud run jobs (create|execute|update)|gcloud secrets versions access|gcloud projects add-iam-policy-binding|gcloud secrets add-iam-policy-binding|--data-file=/);
});
test('v2 Dockerfile grants readable files while retaining unprivileged runtime',()=>{
 const d=readFileSync(path.join(worker,'Dockerfile.airtable-read-probe-v2'),'utf8');
 const v=readFileSync(path.join(worker,'airtable-runtime-probe-v2.js'),'utf8');
 assert.equal((d.match(/COPY --chown=node:node --chmod=0644 /g)||[]).length,3);
 assert.match(d,/RUN chmod 0755 \/app /);
 assert.match(d,/\nUSER node\n/);
 assert.match(v,/const JOB='lszh-airtable-read-probe-fix-staging';/);
});
