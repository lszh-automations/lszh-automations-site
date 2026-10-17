import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync,chmodSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const source=path.join(path.dirname(fileURLToPath(import.meta.url)),'staging-airtable-secret-iam.sh');
function simulate(args=[],vars={}){
 const root=mkdtempSync(path.join(tmpdir(),'lszh-secret-iam-'));
 const bin=path.join(root,'bin');mkdirSync(bin);
 const audit=path.join(root,'audit.txt');
 const granted=path.join(root,'granted');
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
 projects:describe:lszh-automations) echo 123456789012 ;;
 iam:service-accounts:describe)
  echo '{"email":"lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com","disabled":false}' ;;
 secrets:describe:lszh-airtable-readonly-staging)
  echo '{"name":"projects/123456789012/secrets/lszh-airtable-readonly-staging","replication":{"userManaged":{"replicas":[{"location":"europe-west6","status":"READY"}]}}}' ;;
 secrets:versions:list)
  [[ "$4" == 'lszh-airtable-readonly-staging' ]] || exit 55
  if [[ "\${FAKE_BAD_VERSION:-0}" == 1 ]]; then echo '[]'
  else echo '[{"name":"projects/123456789012/secrets/lszh-airtable-readonly-staging/versions/1","state":"ENABLED"}]'
  fi ;;
 secrets:get-iam-policy:lszh-airtable-readonly-staging)
  if [[ -e "$FAKE_GRANTED" || "\${FAKE_EXISTING:-0}" == 1 ]]; then
   echo '{"bindings":[{"role":"roles/secretmanager.secretAccessor","members":["serviceAccount:lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com"]}]}'
  elif [[ "\${FAKE_PUBLIC:-0}" == 1 ]]; then
   echo '{"bindings":[{"role":"roles/secretmanager.secretAccessor","members":["allUsers"]}]}'
  else echo '{"bindings":[]}'
  fi ;;
 secrets:add-iam-policy-binding:lszh-airtable-readonly-staging)
  [[ "$*" == *"--member=serviceAccount:lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com"* ]] || exit 40
  [[ "$*" == *"--role=roles/secretmanager.secretAccessor"* ]] || exit 41
  [[ "$*" == *"--condition=None"* ]] || exit 42
  [[ "$*" == *"--project=lszh-automations"* ]] || exit 43
  touch "$FAKE_GRANTED"
  echo '{"bindings":[]}' ;;
 *) exit 88 ;;
esac
`);
 for(const name of ['git','gcloud'])chmodSync(path.join(bin,name),0o755);
 try{
  const proc=spawnSync('bash',[source,...args],{cwd:root,encoding:'utf8',timeout:12000,
   env:{...process.env,PATH:bin+':'+process.env.PATH,FAKE_ROOT:root,FAKE_AUDIT:audit,FAKE_GRANTED:granted,...vars}});
  return {...proc,audit:existsSync(audit)?readFileSync(audit,'utf8'):'',granted:existsSync(granted)};
 }finally{rmSync(root,{recursive:true,force:true});}
}
test('default plan is read-only and reads only Secret Manager metadata/version/IAM',()=>{
 const r=simulate();
 assert.equal(r.status,0,r.stdout+' '+r.stderr);
 assert.match(r.stdout,/PLAN ONLY: No IAM changes/);
 assert.match(r.audit,/secrets get-iam-policy lszh-airtable-readonly-staging/);
 assert.match(r.audit,/secrets versions list lszh-airtable-readonly-staging/);
 assert.doesNotMatch(r.audit,/secrets add-iam-policy-binding|secrets versions access|run jobs/);
 assert.equal(r.granted,false);
});
test('explicit grant writes one binding only on the exact named secret, then verifies',()=>{
 const r=simulate(['--grant-secret-only']);
 assert.equal(r.status,0,r.stdout+' '+r.stderr);
 assert.equal((r.audit.match(/secrets add-iam-policy-binding/g)||[]).length,1);
 assert.equal((r.audit.match(/secrets get-iam-policy/g)||[]).length,2);
 assert.match(r.audit,/--condition=None/);
 assert.match(r.stdout,/PASS: Dedicated service account has exactly one secret-level Secret Accessor binding/);
 assert.doesNotMatch(r.audit,/projects add-iam-policy-binding|iam service-accounts add-iam-policy-binding|secrets versions access|run jobs|secrets versions add/);
});
test('existing target IAM binding, public IAM or unexpected versions stop before grant',()=>{
 for (const env of [{FAKE_EXISTING:'1'},{FAKE_PUBLIC:'1'},{FAKE_BAD_VERSION:'1'}]){
  const r=simulate(['--grant-secret-only'],env);
  assert.notEqual(r.status,0,r.stdout);
  assert.doesNotMatch(r.audit,/secrets add-iam-policy-binding/);
  assert.equal(r.granted,false);
 }
});
test('wrong company, dirty branch stop before secret or IAM access',()=>{
 for (const env of [{FAKE_ACCOUNT:'stranger@example.invalid'},{FAKE_DIRTY:' M bad'}]){
  const r=simulate(['--grant-secret-only'],env);
  assert.notEqual(r.status,0);
  assert.doesNotMatch(r.audit,/secrets describe|secrets get-iam-policy|secrets add-iam-policy-binding/);
 }
});
test('unsupported flag or extra arguments block before any GCP interaction',()=>{
 for(const args of [['--apply'],['--grant-secret-only','--yes']]){
  const r=simulate(args);
  assert.notEqual(r.status,0);
  assert.equal(r.audit,'');
 }
});
test('no secret access, environment token or project IAM anywhere in script',()=>{
 const p=spawnSync('bash',['-n',source],{encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
 const src=readFileSync(source,'utf8');
 assert.doesNotMatch(src,/gcloud projects (add-iam-policy-binding|set-iam-policy)|gcloud secrets versions access|gcloud secrets versions add|gcloud run jobs execute|--data-file=/);
 assert.match(src,/gcloud secrets add-iam-policy-binding "\$SECRET"/);
});
