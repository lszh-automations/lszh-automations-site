import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync,chmodSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const source=path.join(path.dirname(fileURLToPath(import.meta.url)),'staging-airtable-secret-version.sh');
function run(args=[],vars={}) {
 const root=mkdtempSync(path.join(tmpdir(),'lszh-pat-version-'));
 const bin=path.join(root,'bin');mkdirSync(bin);
 const audit=path.join(root,'audit.txt');
 const git=`#!/bin/bash
case "$1:$2" in
 rev-parse:--show-toplevel) echo "$FAKE_ROOT" ;;
 rev-parse:HEAD) echo abc123 ;;
 rev-parse:refs/remotes/origin/feature/onboarding-notification-outbox-20261016) echo abc123 ;;
 branch:--show-current) echo feature/onboarding-notification-outbox-20261016 ;;
 status:--porcelain) echo "$FAKE_DIRTY" ;;
 *) exit 12 ;;
esac
`;
 const gcloud=`#!/bin/bash
echo "$*" >> "$FAKE_AUDIT"
case "$1:$2:$3" in
 auth:list:*) echo "\${FAKE_ACCOUNT:-lars@lszh-automations.ch}" ;;
 config:get-value:project) echo lszh-automations ;;
 projects:describe:lszh-automations) echo 123456789012 ;;
 secrets:describe:lszh-airtable-readonly-staging)
  echo '{"name":"projects/123456789012/secrets/lszh-airtable-readonly-staging","replication":{"userManaged":{"replicas":[{"location":"europe-west6"}]}}}' ;;
 secrets:versions:list)
  [[ "$4" == 'lszh-airtable-readonly-staging' ]] || exit 55
  [[ "$*" != *"--secret="* ]] || exit 55
  if [[ "$*" == *"format=json"* ]]; then
    [[ "\${FAKE_HAS_VERSION:-0}" == 0 ]] && echo '[]' || echo '[{"name":"projects/123456789012/secrets/lszh-airtable-readonly-staging/versions/1","state":"ENABLED"}]'
  else
    [[ "\${FAKE_HAS_VERSION:-0}" == 0 ]] || echo 1
  fi ;;
 secrets:versions:add)
  # Never dump stdin, arguments or PAT to logs in this mock.
  echo 'ATTEMPT_TO_ADD' >> "$FAKE_AUDIT"
  exit 0 ;;
 *) exit 88 ;;
esac
`;
 writeFileSync(path.join(bin,'git'),git);
 writeFileSync(path.join(bin,'gcloud'),gcloud);
 chmodSync(path.join(bin,'git'),0o755);chmodSync(path.join(bin,'gcloud'),0o755);
 try {
  // The source script calls the other read-only diagnosis by relative path.
  // Substitute the repo checkout for the shell test in a temporary directory.
  const workerDir=path.join(root,'workers','onboarding-notifications');
  mkdirSync(workerDir,{recursive:true});
  const diag=path.join(path.dirname(source),'staging-airtable-secret-diagnose.sh');
  writeFileSync(path.join(workerDir,'staging-airtable-secret-diagnose.sh'),readFileSync(diag));
  const copied=path.join(workerDir,'staging-airtable-secret-version.sh');
  writeFileSync(copied,readFileSync(source));
  const p=spawnSync('bash',[copied,...args],{cwd:root,encoding:'utf8',timeout:10000,
   env:{...process.env,PATH:bin+':'+process.env.PATH,FAKE_ROOT:root,FAKE_AUDIT:audit,...vars}});
  return {...p,audit:existsSync(audit)?readFileSync(audit,'utf8'):''};
 } finally {rmSync(root,{recursive:true,force:true});}
}
test('plan validates correct service, Zurich-only secret, zero versions, without mutation',()=>{
 const r=run();
 assert.equal(r.status,0,r.stderr+' '+r.stdout);
 assert.match(r.stdout,/Exactly zero secret versions/);
 assert.match(r.stdout,/PLAN ONLY/);
 assert.match(r.audit,/secrets versions list lszh-airtable-readonly-staging/);
 assert.doesNotMatch(r.audit,/versions add|ATTEMPT_TO_ADD|set-iam-policy|run jobs create/);
});
test('a nonempty secret always fails before upload',()=>{
 const r=run(['--add-once'],{FAKE_HAS_VERSION:'1'});
 assert.notEqual(r.status,0);
 assert.doesNotMatch(r.audit,/ATTEMPT_TO_ADD/);
});
test('wrong business identity or checkout modifications block before secret operations',()=>{
 for(const vars of [{FAKE_ACCOUNT:'random@example.invalid'},{FAKE_DIRTY:' M changed'}]){
  const r=run(['--add-once'],vars);
  assert.notEqual(r.status,0);
  assert.doesNotMatch(r.audit,/secrets versions list|ATTEMPT_TO_ADD/);
 }
});
test('private interactive terminal required to upload',()=>{
 const r=run(['--add-once']);
 assert.notEqual(r.status,0);
 assert.match(r.stdout,/Private interactive Cloud Shell terminal required/);
 assert.doesNotMatch(r.audit,/ATTEMPT_TO_ADD/);
});
test('unsupported switches stop before any network calls',()=>{
 for(const args of [['--apply'],['--add-once','--yes']]){
  const r=run(args);
  assert.notEqual(r.status,0);
  assert.equal(r.audit,'');
 }
});
test('syntax and data transport guarantee only stdin pipe to one secret',()=>{
 const r=spawnSync('bash',['-n',source],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 const s=readFileSync(source,'utf8');
 assert.match(s,/gcloud secrets versions add "\$SECRET"/);
 assert.match(s,/--data-file=-/);
 assert.match(s,/read -r -s -p/);
 assert.doesNotMatch(s,/gcloud secrets versions access|add-iam-policy-binding|gcloud run jobs execute|--data-file="[^-]|--data-file='[^-]/);
});
