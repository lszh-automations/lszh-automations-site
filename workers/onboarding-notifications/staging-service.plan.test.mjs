import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const SCRIPT=path.join(process.cwd(),'workers/onboarding-notifications/staging-service.sh');
function mockEnvironment(env={}) {
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lszh-outbox-stage-test-'));
  const log=path.join(tmp,'gcloud-calls.log');
  const git=`#!/bin/sh
if [ "$1" = "rev-parse" ]; then
 case "$2" in
 --show-toplevel) echo "${process.cwd()}";;
 *) echo "1234567890abcdef1234567890abcdef12345678";;
 esac
elif [ "$1" = "branch" ]; then
 echo "feature/onboarding-notification-outbox-20261016"
elif [ "$1" = "status" ]; then
 echo ""
else
 exit 23
fi
`;
  const gcloud=`#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_GCLOUD_LOG"
case "$1 $2" in
 "auth list") echo "${env.account??'lars@lszh-automations.ch'}";;
 "config get-value") echo "lszh-automations";;
 "firestore databases"|"artifacts repositories"|"iam service-accounts") echo "pass";;
 "run services") echo "${env.services??'lszh-offer-portal-staging'}";;
 *) echo "UNEXPECTED MUTATING TOOL CALL" >&2; exit 48;;
esac
`;
  fs.writeFileSync(path.join(tmp,'git'),git,{mode:0o755});
  fs.writeFileSync(path.join(tmp,'gcloud'),gcloud,{mode:0o755});
  return {
    env:{...process.env,PATH:tmp+path.delimiter+process.env.PATH,
      FAKE_GCLOUD_LOG:log},
    readLog:()=>fs.existsSync(log)?fs.readFileSync(log,'utf8'):'',
    clean:()=>fs.rmSync(tmp,{recursive:true,force:true})
  };
}
test('plan never calls builds submit, run deploy or IAM modification',()=>{
  const mock=mockEnvironment();
  try {
    const proc=spawnSync('bash',[SCRIPT,'--plan'],{env:mock.env,encoding:'utf8'});
    assert.equal(proc.status,0,proc.stdout+proc.stderr);
    assert.match(proc.stdout,/PLAN ONLY/);
    assert.match(proc.stdout,/LSZH_OUTBOX_STAGE_ENABLED=false|Outbox flag OFF/);
    assert.doesNotMatch(mock.readLog(),/builds submit|run deploy|add-iam-policy-binding|service-accounts create/);
  } finally {mock.clean();}
});
test('read-only plan refuses existing Cloud Run service',()=>{
  const mock=mockEnvironment({services:'lszh-onboarding-outbox-staging'});
  try {
    const proc=spawnSync('bash',[SCRIPT,'--plan'],{env:mock.env,encoding:'utf8'});
    assert.equal(proc.status,2,proc.stdout+proc.stderr);
    assert.match(proc.stdout,/already exists/);
    assert.doesNotMatch(mock.readLog(),/run deploy|builds submit/);
  } finally {mock.clean();}
});
test('read-only plan refuses wrong business identity',()=>{
  const mock=mockEnvironment({account:'other@example.invalid'});
  try {
    const proc=spawnSync('bash',[SCRIPT],{env:mock.env,encoding:'utf8'});
    assert.equal(proc.status,2,proc.stdout+proc.stderr);
    assert.match(proc.stdout,/Wrong Google account/);
    assert.doesNotMatch(mock.readLog(),/run deploy|builds submit/);
  } finally {mock.clean();}
});
test('invalid flags are blocked before tools are invoked',()=>{
  const mock=mockEnvironment();
  try {
    const proc=spawnSync('bash',[SCRIPT,'--apply'],{env:mock.env,encoding:'utf8'});
    assert.equal(proc.status,2,proc.stdout+proc.stderr);
    assert.match(proc.stdout,/Use --plan/);
    assert.equal(mock.readLog(),'');
  } finally {mock.clean();}
});
