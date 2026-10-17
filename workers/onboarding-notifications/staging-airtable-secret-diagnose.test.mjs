import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync,chmodSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const source=path.join(path.dirname(fileURLToPath(import.meta.url)),'staging-airtable-secret-diagnose.sh');
function simulate(vars={}) {
 const root=mkdtempSync(path.join(tmpdir(),'lszh-secret-read-'));
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
 projects:describe:lszh-automations) echo "123456789012" ;;
 secrets:describe:lszh-airtable-readonly-staging)
  python3 - <<'PY'
import os,json
p=os.environ.get("FAKE_METADATA_PROJECT","123456789012")
r=os.environ.get("FAKE_REPLICA","europe-west6")
m={"name":"projects/"+p+"/secrets/lszh-airtable-readonly-staging",
   "replication":{"userManaged":{"replicas":[{"location":r}]}}}
if os.environ.get("FAKE_AUTOMATIC")=="1":m["replication"]={"automatic":{}}
print(json.dumps(m))
PY
  ;;
 secrets:versions:list) [[ "\${FAKE_VERSION:-0}" == 0 ]] || echo 1 ;;
 *) exit 88 ;;
esac
`);
 chmodSync(path.join(bin,'git'),0o755);
 chmodSync(path.join(bin,'gcloud'),0o755);
 try {
  const p=spawnSync('bash',[source],{cwd:root,encoding:'utf8',timeout:9000,
   env:{...process.env,PATH:bin+':'+process.env.PATH,
    FAKE_ROOT:root,FAKE_AUDIT:audit,...vars}});
  return {...p,audit:existsSync(audit)?readFileSync(audit,'utf8'):''};
 } finally {rmSync(root,{recursive:true,force:true});}
}
test('numeric Google project number allowed only when independently verified',()=>{
 const r=simulate();
 assert.equal(r.status,0,r.stderr+' '+r.stdout);
 assert.match(r.stdout,/Zurich-only replica: PASS/);
 assert.match(r.stdout,/Exactly zero secret versions/);
 assert.doesNotMatch(r.audit,/secrets create|versions add|versions access|policy-binding|run jobs create|run jobs execute/);
});
test('named project ID metadata is also acceptable',()=>{
 const r=simulate({FAKE_METADATA_PROJECT:'lszh-automations'});
 assert.equal(r.status,0,r.stderr+' '+r.stdout);
});
test('unrelated project number is refused',()=>{
 const r=simulate({FAKE_METADATA_PROJECT:'999888777666'});
 assert.notEqual(r.status,0);
 assert.match(r.stdout,/Secret project verified .* STOP/);
});
test('non-Zurich location or automatic replication refused',()=>{
 for(const v of [{FAKE_REPLICA:'us-central1'},{FAKE_AUTOMATIC:'1'}]){
  const r=simulate(v);
  assert.notEqual(r.status,0);
  assert.match(r.stdout,/STOP/);
 }
});
test('existing version is never treated as an empty secret',()=>{
 const r=simulate({FAKE_VERSION:'1'});
 assert.notEqual(r.status,0);
 assert.match(r.stdout,/At least one secret version already exists/);
});
test('wrong business identity, dirty git tree or unsupported arg cause fail-closed refusal',()=>{
 for(const v of [{FAKE_ACCOUNT:'unknown@example.invalid'},{FAKE_DIRTY:' M broken'}]){
  const r=simulate(v);
  assert.notEqual(r.status,0);
  assert.doesNotMatch(r.audit,/secrets describe|secrets versions list/);
 }
 const r=spawnSync('bash',[source,'--apply'],{encoding:'utf8'});
 assert.notEqual(r.status,0);
});
test('script syntax valid and no mutating Cloud commands',()=>{
 const r=spawnSync('bash',['-n',source],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 const s=readFileSync(source,'utf8');
 assert.doesNotMatch(s,/gcloud secrets (create|delete|versions add|versions access)|gcloud run jobs (create|execute)|gcloud projects add-iam-policy-binding/);
});
