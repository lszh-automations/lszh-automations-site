import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const SCRIPT=path.join(process.cwd(),'workers/onboarding-notifications/staging-firestore-job.sh');
function setup({existing=false,wrongIdentity=false,jobSpecMismatch=false}={}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lszh-one-shot-probe-'));
 const log=path.join(dir,'gcloud.log');
 const git=`#!/bin/sh
case "$1" in
 rev-parse)
   if [ "$2" = "--show-toplevel" ]; then printf '%s\\n' "$TEST_REPO_ROOT"
   elif [ "$2" = "--short=12" ]; then echo "1234567890ab"
   else echo "1234567890abcdef1234567890abcdef12345678"; fi;;
 branch) echo 'feature/onboarding-notification-outbox-20261016';;
 status) :;;
 *) exit 48;;
esac
`;
 const gcloud=`#!/bin/sh
printf '%s\\n' "$*" >> "$GCLOUD_CALL_LOG"
case "$1 $2" in
 "auth list") echo "${wrongIdentity?'different@example.invalid':'lars@lszh-automations.ch'}";;
 "config get-value") echo 'lszh-automations';;
 "iam service-accounts"|"firestore databases"|"artifacts repositories") echo 'PASS';;
 "run jobs")
   case "$3" in
    list) if [ "$JOB_EXISTS" = 1 ]; then echo 'lszh-firestore-read-probe-staging'; fi;;
    create) echo 'CREATED';;
    describe) cat "$JOB_SPEC";;
    execute) echo 'EXECUTED';;
    *) exit 51;;
   esac;;
 *) echo 'unexpected mock tool operation' >&2; exit 52;;
esac
`;
 fs.writeFileSync(path.join(dir,'git'),git,{mode:0o755});
 fs.writeFileSync(path.join(dir,'gcloud'),gcloud,{mode:0o755});
 const task={containers:[{image:'europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-firestore-read-probe:staging-1234567890ab',env:[
  {name:'LSZH_FIRESTORE_READ_PROBE_ONLY',value:'true'},
  {name:'FIRESTORE_PROJECT_ID',value:'lszh-automations'},
  {name:'FIRESTORE_DATABASE_ID',value:'lszh-offers-staging'}
 ]}],maxRetries:0,serviceAccountName:'lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com'};
 if(jobSpecMismatch)task.serviceAccountName='wrong@example.invalid';
 const spec=path.join(dir,'spec.json');
 fs.writeFileSync(spec,JSON.stringify({spec:{template:{spec:{taskCount:1,template:{spec:task}}}}}));
 return {
  env:{...process.env,PATH:dir+path.delimiter+process.env.PATH,
    GCLOUD_CALL_LOG:log,JOB_EXISTS:existing?'1':'0',JOB_SPEC:spec,TEST_REPO_ROOT:process.cwd()},
  calls:()=>fs.existsSync(log)?fs.readFileSync(log,'utf8'):'',
  close:()=>fs.rmSync(dir,{recursive:true,force:true})
 };
}
function run(options={},mode='--plan') {
 const x=setup(options);
 try {
  const result=spawnSync('bash',[SCRIPT,mode],{env:x.env,encoding:'utf8'});
  return {code:result.status,text:result.stdout+result.stderr,calls:x.calls()};
 }finally{x.close();}
}

test('plan only reads known infrastructure and never builds or creates Cloud Run Job',()=>{
 const v=run();
 assert.equal(v.code,0,v.text);
 assert.match(v.text,/PLAN ONLY/);
 assert.doesNotMatch(v.calls,/builds submit|run jobs create|run jobs execute|add-iam/);
});

test('job name preexists: fail closed before build and creation',()=>{
 const v=run({existing:true});
 assert.equal(v.code,2,v.text);
 assert.match(v.text,/Refusing overwrite/i);
 assert.doesNotMatch(v.calls,/run jobs create|builds submit/);
});

test('wrong business account blocks before any cloud resources',()=>{
 const v=run({wrongIdentity:true});
 assert.equal(v.code,2,v.text);
 assert.match(v.text,/Wrong business account/);
 assert.doesNotMatch(v.calls,/run jobs list|run jobs create|builds submit/);
});

test('create-only does NOT execute and has zero retries and read-only probe image',()=>{
 const v=run({},'--create-only');
 assert.equal(v.code,0,v.text);
 assert.match(v.text,/CREATED but NOT EXECUTED/);
 assert.match(v.calls,/run jobs create lszh-firestore-read-probe-staging/);
 assert.match(v.calls,/--max-retries=0/);
 assert.match(v.calls,/--service-account=lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com/);
 assert.doesNotMatch(v.calls,/--execute-now|run jobs execute|run deploy|run services/);
});

test('execution refuses missing job and makes no changes',()=>{
 const v=run({},'--execute-once');
 assert.equal(v.code,2,v.text);
 assert.match(v.text,/not found/);
 assert.doesNotMatch(v.calls,/run jobs execute/);
});

test('execution fails closed if service account does not match pinned configuration',()=>{
 const v=run({existing:true,jobSpecMismatch:true},'--execute-once');
 assert.equal(v.code,2,v.text);
 assert.match(v.text,/mismatch/);
 assert.doesNotMatch(v.calls,/run jobs execute/);
});

test('execution of pinned job occurs once with wait, no updates or scheduling',()=>{
 const v=run({existing:true},'--execute-once');
 assert.equal(v.code,0,v.text);
 const executions=v.calls.match(/run jobs execute/g)??[];
 assert.equal(executions.length,1,v.calls);
 assert.match(v.calls,/--wait/);
 assert.doesNotMatch(v.calls,/run jobs deploy|run jobs update|scheduler|add-iam/);
});

test('unknown mode is rejected before gcloud call',()=>{
 const v=run({},'--activate-production');
 assert.equal(v.code,2,v.text);
 assert.equal(v.calls,'');
});
