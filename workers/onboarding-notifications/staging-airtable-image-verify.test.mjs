import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,chmodSync,rmSync,existsSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const source=path.join(path.dirname(fileURLToPath(import.meta.url)),'staging-airtable-image-verify.sh');
const DIGEST='sha256:'+('a'.repeat(64));
const TAG='europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-airtable-read-probe:stg-c7ebdde79b67';
function simulate(vars={}){
 const root=mkdtempSync(path.join(tmpdir(),'lszh-image-digest-'));
 const bin=path.join(root,'bin');mkdirSync(bin);
 const audit=path.join(root,'audit');
 writeFileSync(path.join(bin,'git'),`#!/bin/bash
case "$1:$2" in
 rev-parse:--show-toplevel) echo "$FAKE_ROOT" ;;
 rev-parse:HEAD) echo good123 ;;
 rev-parse:refs/remotes/origin/feature/onboarding-notification-outbox-20261016) echo good123 ;;
 branch:--show-current) echo feature/onboarding-notification-outbox-20261016 ;;
 status:--porcelain) echo "$FAKE_DIRTY" ;;
 cat-file:-e) [[ "\${FAKE_PIN_BAD:-0}" == 0 ]] || exit 12 ;;
 diff:--quiet) [[ "\${FAKE_PIN_BAD:-0}" == 0 ]] || exit 12 ;;
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
import os,json
digest=os.environ["FAKE_DIGEST"]
tag=os.environ["FAKE_TAG"]
d={"id":"1b909760-deb7-49a9-bfe8-b4e20af68133",
   "name":"projects/470613067122/locations/europe-west6/builds/1b909760-deb7-49a9-bfe8-b4e20af68133",
   "status":os.environ.get("FAKE_BUILD_STATUS","SUCCESS"),
   "images":[tag],
   "results":{"images":[{"name":tag,"digest":os.environ.get("FAKE_BUILD_DIGEST",digest)}]}}
print(json.dumps(d))
PY
 ;;
 artifacts:docker:images)
  [[ "$4" == describe ]] || exit 61
  echo "\${FAKE_REGISTRY_DIGEST:-$FAKE_DIGEST}" ;;
 run:jobs:list)
  [[ "\${FAKE_LIST_FAIL:-0}" == 0 ]] || exit 56
  [[ "\${FAKE_HAS_JOB:-0}" == 0 ]] || echo lszh-airtable-read-probe-staging ;;
 *) exit 88 ;;
esac
`);
 for(const n of ['git','gcloud'])chmodSync(path.join(bin,n),0o755);
 try {
  const proc=spawnSync('bash',[source],{cwd:root,encoding:'utf8',timeout:13000,
   env:{...process.env,PATH:bin+':'+process.env.PATH,FAKE_ROOT:root,FAKE_AUDIT:audit,
    FAKE_DIGEST:DIGEST,FAKE_TAG:TAG,...vars}});
  return {...proc,audit:existsSync(audit)?readFileSync(audit,'utf8'):''};
 }finally{rmSync(root,{recursive:true,force:true});}
}
test('valid exact Cloud Build + registry digest + job absence all pass read-only',()=>{
 const r=simulate();
 assert.equal(r.status,0,r.stderr+' '+r.stdout);
 assert.match(r.stdout,/PASS: Pinned Cloud Build ID reports SUCCESS/);
 assert.match(r.stdout,/PASS: Cloud Build result digest matches Artifact Registry/);
 assert.match(r.stdout,new RegExp(DIGEST));
 assert.match(r.stdout,/READ ONLY:/);
 assert.doesNotMatch(r.audit,/jobs create|jobs execute|builds submit|secrets versions access|add-iam-policy-binding/);
});
test('build not successful cannot be interpreted as a deployable image',()=>{
 const r=simulate({FAKE_BUILD_STATUS:'FAILURE'});
 assert.notEqual(r.status,0);
 assert.doesNotMatch(r.audit,/artifacts docker images describe/);
});
test('retagged registry image digest cannot be accepted',()=>{
 const r=simulate({FAKE_REGISTRY_DIGEST:'sha256:'+('b'.repeat(64))});
 assert.notEqual(r.status,0);
 assert.match(r.stdout,/STOP: Artifact Registry digest disagrees/);
});
test('malformed registry digest is rejected',()=>{
 const r=simulate({FAKE_REGISTRY_DIGEST:'latest'});
 assert.notEqual(r.status,0);
 assert.match(r.stdout,/STOP: Artifact Registry digest missing/);
});
test('existing job, wrong user, dirty review tree or source pin all stop',()=>{
 for(const vars of [
  {FAKE_HAS_JOB:'1'},{FAKE_LIST_FAIL:'1'},
  {FAKE_ACCOUNT:'other@example.invalid'},
  {FAKE_DIRTY:' M doc'},
  {FAKE_PIN_BAD:'1'}
 ]){
  const r=simulate(vars);
  assert.notEqual(r.status,0,r.stdout);
  assert.doesNotMatch(r.audit,/jobs create|jobs execute|builds submit/);
 }
});
test('rejects all positional arguments without a single Cloud command',()=>{
 const p=spawnSync('bash',[source,'--build-only'],{encoding:'utf8'});
 assert.notEqual(p.status,0);
 assert.match(p.stdout,/takes no arguments/);
});
test('shell syntax and sole allowlisted read operations',()=>{
 const p=spawnSync('bash',['-n',source],{encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
 const s=readFileSync(source,'utf8');
 assert.doesNotMatch(s,/gcloud (?:run jobs (?:create|execute|update)|builds submit|secrets versions access|secrets add-iam-policy-binding|projects add-iam-policy-binding)/);
 assert.match(s,/gcloud artifacts docker images describe/);
 assert.match(s,/gcloud builds describe/);
});
