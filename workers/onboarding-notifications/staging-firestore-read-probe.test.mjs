import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const SCRIPT=path.join(process.cwd(),'workers/onboarding-notifications/staging-firestore-read-probe.sh');
function mockEnvironment(opts={}) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lszh-fs-read-test-'));
  const log=path.join(dir,'requests.log');
  const gcloud=`#!/bin/sh
case "$1 $2" in
  "auth list") echo "${opts.account??'lars@lszh-automations.ch'}";;
  "config get-value") echo 'lszh-automations';;
  "iam service-accounts") echo 'lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com';;
  "firestore databases") echo 'projects/lszh-automations/databases/lszh-offers-staging';;
  "auth print-access-token")
    if [ "$DENY_IMPERSONATION" = 1 ]; then exit 1; fi
    echo 'SYNTHETIC_SHORT_LIVED_TOKEN';;
  *) echo 'unexpected gcloud command' >&2;exit 46;;
esac
`;
  const curl=`#!/bin/sh
case "$*" in
  *"--header Authorization: Bearer SYNTHETIC_SHORT_LIVED_TOKEN"*) :;;
  *) echo 'wrong auth header' >&2;exit 49;;
esac
case "$*" in
  *'/documents/lszh_onboarding_notification_drafts_staging/lszh_readonly_probe_no_document_created_20261016'*)
    echo 'document-read' >> "$PROBE_LOG"
    printf '%s' "$DOC_HTTP";;
  *'https://firestore.googleapis.com/v1/projects/lszh-automations/databases/lszh-offers-staging'*)
    echo 'database-read' >> "$PROBE_LOG"
    printf '%s' "$DB_HTTP";;
  *) echo 'unexpected url' >&2;exit 48;;
esac
`;
  fs.writeFileSync(path.join(dir,'gcloud'),gcloud,{mode:0o755});
  fs.writeFileSync(path.join(dir,'curl'),curl,{mode:0o755});
  return {
    env:{...process.env,PATH:dir+path.delimiter+process.env.PATH,
      DENY_IMPERSONATION:opts.deny?'1':'0',PROBE_LOG:log,
      DOC_HTTP:opts.docHttp??'404',DB_HTTP:opts.dbHttp??'200'},
    log:()=>fs.existsSync(log)?fs.readFileSync(log,'utf8'):'',
    dispose:()=>fs.rmSync(dir,{recursive:true,force:true})
  };
}
function invoke(opts={},mode='--plan') {
  const mock=mockEnvironment(opts);
  try {
    const r=spawnSync('bash',[SCRIPT,mode],{env:mock.env,encoding:'utf8'});
    return {status:r.status,output:r.stdout+r.stderr,log:mock.log()};
  }finally{mock.dispose();}
}
test('default plan makes no Firestore REST request or impersonation',()=>{
 const r=invoke();
 assert.equal(r.status,0,r.output);
 assert.match(r.output,/PLAN ONLY/);
 assert.equal(r.log,'');
});
test('approved read probe uses database GET then fixed missing-document GET',()=>{
 const r=invoke({},'--probe-read');
 assert.equal(r.status,0,r.output);
 assert.match(r.output,/Effective STAGING Firestore metadata\/entity read probe complete/);
 assert.deepEqual(r.log.trim().split('\n'),['database-read','document-read']);
 assert.doesNotMatch(r.output,/SYNTHETIC_SHORT_LIVED_TOKEN/);
});
test('failed impersonation never makes Firestore requests',()=>{
 const r=invoke({deny:true},'--probe-read');
 assert.equal(r.status,2,r.output);
 assert.match(r.output,/Could not impersonate/);
 assert.equal(r.log,'');
});
test('forbidden document GET never claimed successful',()=>{
 const r=invoke({docHttp:'403'},'--probe-read');
 assert.equal(r.status,2,r.output);
 assert.match(r.output,/HTTP 403/);
 assert.deepEqual(r.log.trim().split('\n'),['database-read','document-read']);
});
test('unexpected existing document never considered readiness',()=>{
 const r=invoke({docHttp:'200'},'--probe-read');
 assert.equal(r.status,2,r.output);
 assert.match(r.output,/unexpectedly exists/);
});
test('wrong business account is blocked before Firestore',()=>{
 const r=invoke({account:'not-us@example.invalid'},'--probe-read');
 assert.equal(r.status,2,r.output);
 assert.match(r.output,/Wrong business account/);
 assert.equal(r.log,'');
});
