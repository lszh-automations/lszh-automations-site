import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,chmodSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const worker=path.dirname(fileURLToPath(import.meta.url));
const script=path.join(worker,'staging-airtable-image-verify-v2.sh');
const TAG='europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-airtable-read-probe:stg-permfix-60a879296014';
const DIGEST='sha256:'+'a'.repeat(64);

function run(vars={},args=[]){
 const root=mkdtempSync(path.join(tmpdir(),'lszh-image-digest-'));
 const bin=path.join(root,'bin'),audit=path.join(root,'audit');
 mkdirSync(bin);
 writeFileSync(path.join(bin,'git'),`#!/bin/bash
case "$1:$2" in
 rev-parse:--show-toplevel) echo "$FAKE_ROOT" ;;
 rev-parse:HEAD) echo expected ;;
 rev-parse:refs/remotes/origin/feature/onboarding-notification-outbox-20261016) echo expected ;;
 branch:--show-current) echo feature/onboarding-notification-outbox-20261016 ;;
 status:--porcelain) echo "\${FAKE_DIRTY:-}" ;;
 cat-file:-e) [[ "\${FAKE_BAD_PIN:-0}" == 0 ]] ;;
 diff:--quiet) [[ "\${FAKE_BAD_PIN:-0}" == 0 ]] ;;
 *) exit 92 ;;
esac
`);
 writeFileSync(path.join(bin,'gcloud'),`#!/bin/bash
echo "$*" >> "$FAKE_AUDIT"
case "$1:$2:$3" in
 auth:list:*) echo "\${FAKE_ACCOUNT:-lars@lszh-automations.ch}" ;;
 config:get-value:project) echo lszh-automations ;;
 builds:describe:ebcde82f-f39b-42cf-a569-dd0c96180006)
    if [[ "\${FAKE_BUILD_FAILURE:-0}" == 1 ]];then status=FAILURE;else status=SUCCESS;fi
    echo '{"id":"ebcde82f-f39b-42cf-a569-dd0c96180006","status":"'\${status}'","images":["'\${FAKE_TAG:-$FAKE_EXPECTED_TAG}'"],"results":{"images":[{"name":"'\${FAKE_TAG:-$FAKE_EXPECTED_TAG}'","digest":"'\${FAKE_RESULT_DIGEST:-$FAKE_DIGEST}'"}]}}' ;;
 artifacts:docker:images)
    echo "\${FAKE_REGISTRY_DIGEST:-$FAKE_DIGEST}" ;;
 run:jobs:list)
    [[ "\${FAKE_OLD_JOB_MISSING:-0}" == 1 ]] || echo lszh-airtable-read-probe-staging
    [[ "\${FAKE_NEW_JOB_EXISTS:-0}" == 1 ]] && echo lszh-airtable-read-probe-fix-staging
    : ;;
 run:jobs:executions)
    if [[ "\${FAKE_EXEC_MISMATCH:-0}" == 1 ]];then echo '[{"name":"wrong"}]'
    else echo '[{"name":"lszh-airtable-read-probe-staging-xglcz"}]';fi ;;
 *) exit 92 ;;
esac
`);
 for(const p of ['git','gcloud'])chmodSync(path.join(bin,p),0o755);
 try{
  const r=spawnSync('bash',[script,...args],{
   cwd:root,encoding:'utf8',timeout:10000,
   env:{...process.env,PATH:bin+':'+process.env.PATH,FAKE_ROOT:root,
     FAKE_AUDIT:audit,FAKE_EXPECTED_TAG:TAG,FAKE_DIGEST:DIGEST,...vars}
  });
  return {...r,audit:existsSync(audit)?readFileSync(audit,'utf8'):''};
 }finally{rmSync(root,{recursive:true,force:true});}
}

test('exact successful build, matching tag/digest, historic job and absent V2 job: only reads metadata',()=>{
 const r=run();
 assert.equal(r.status,0,r.stdout+'\n'+r.stderr);
 assert.match(r.stdout,/PASS: Pinned Cloud Build ID reports SUCCESS/);
 assert.match(r.stdout,/PASS: Cloud Build result digest matches Artifact Registry/);
 assert.match(r.stdout,/PASS: Original STAGING job preserved/);
 assert.match(r.stdout,/PASS: Immutable digest: sha256:/);
 assert.match(r.stdout,/READ ONLY:/);
 assert.doesNotMatch(r.audit,/builds submit|jobs create|jobs execute|run deploy|versions access|add-iam-policy-binding/);
 assert.match(r.audit,/builds describe ebcde82f-f39b-42cf-a569-dd0c96180006/);
});

test('fail closed on mismatched build, registry digest, existing job or changed original history',()=>{
 for(const env of [
  {FAKE_BUILD_FAILURE:'1'},
  {FAKE_TAG:TAG+'-wrong'},
  {FAKE_REGISTRY_DIGEST:'sha256:'+'b'.repeat(64)},
  {FAKE_NEW_JOB_EXISTS:'1'},
  {FAKE_OLD_JOB_MISSING:'1'},
  {FAKE_EXEC_MISMATCH:'1'},
  {FAKE_BAD_PIN:'1'},
  {FAKE_ACCOUNT:'other@example.invalid'}
 ]){
  const r=run(env);
  assert.notEqual(r.status,0,JSON.stringify(env)+'\n'+r.stdout+'\n'+r.stderr);
  assert.doesNotMatch(r.audit,/builds submit|jobs create|jobs execute|run deploy|versions access|add-iam-policy-binding/);
 }
});

test('unexpected argument stops before gcloud and source has valid syntax and no mutations',()=>{
 const r=run({},['--build-only']);
 assert.notEqual(r.status,0);
 assert.equal(r.audit,'');
 const sh=spawnSync('bash',['-n',script],{encoding:'utf8'});
 assert.equal(sh.status,0,sh.stderr);
 const s=readFileSync(script,'utf8');
 assert.doesNotMatch(s,/\bgcloud (?:builds submit|run jobs (?:create|execute|update)|secrets versions access|secrets add-iam-policy-binding)\b/);
 assert.match(s,/SOURCE_COMMIT='60a87929601496b4b6192ec7945d80d6dc352b3e'/);
 assert.match(s,/BUILD='ebcde82f-f39b-42cf-a569-dd0c96180006'/);
});
