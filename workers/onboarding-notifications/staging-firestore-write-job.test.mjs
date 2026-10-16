import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const SCRIPT=path.join(process.cwd(),'workers/onboarding-notifications/staging-firestore-write-job.sh');
function mock({existing=false,previousExecution=false,wrongUser=false,badServiceIdentity=false}={}){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lszh-write-job-'));
 const callLog=path.join(tmp,'calls.txt');
 const specPath=path.join(tmp,'spec.json');
 const expectedImage='europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-firestore-write-probe:staging-1502a6da6eed';
 const spec={spec:{template:{spec:{taskCount:1,template:{spec:{
  serviceAccountName:badServiceIdentity?'other@invalid.example':'lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com',
  maxRetries:0,containers:[{image:expectedImage,env:[
   {name:'LSZH_SYNTHETIC_WRITE_PROBE_ONLY',value:'true'},
   {name:'LSZH_OUTBOX_STAGE_ENABLED',value:'false'},
   {name:'FIRESTORE_PROJECT_ID',value:'lszh-automations'},
   {name:'FIRESTORE_DATABASE_ID',value:'lszh-offers-staging'}
  ]}]
 }}}}}};
 fs.writeFileSync(specPath,JSON.stringify(spec));
 const git=`#!/bin/sh
case "$1" in
 rev-parse)
   if [ "$2" = "--show-toplevel" ]; then echo "$MOCK_ROOT"
   elif [ "$2" = "HEAD" ]; then echo "current-head-sha"
   else echo "current-head-sha"; fi;;
 branch) echo 'feature/onboarding-notification-outbox-20261016';;
 status) :;;
 cat-file) :;;
 diff) :;;
 *) exit 65;;
esac
`;
 const gcloud=`#!/bin/sh
printf '%s\\n' "$*" >> "$MOCK_LOG"
case "$1 $2" in
 "auth list") echo "${wrongUser?'someone@invalid.example':'lars@lszh-automations.ch'}";;
 "config get-value") echo 'lszh-automations';;
 "iam service-accounts"|"firestore databases"|"artifacts repositories") echo 'PASS';;
 "run jobs")
   case "$3" in
    list) if [ "$MOCK_EXISTS" = 1 ]; then echo 'lszh-firestore-write-probe-staging'; fi;;
    create) echo 'JOB CREATED';;
    describe) cat "$MOCK_SPEC";;
    execute) echo 'JOB EXECUTED';;
    executions)
      if [ "$4" = list ]; then
       if [ "$MOCK_PREVIOUS" = 1 ]; then echo 'lszh-firestore-write-probe-staging-abcd'; fi
      else exit 67; fi;;
    *) exit 66;;
   esac;;
 *) echo 'unexpected tool invocation' >&2;exit 68;;
esac
`;
 fs.writeFileSync(path.join(tmp,'git'),git,{mode:0o755});
 fs.writeFileSync(path.join(tmp,'gcloud'),gcloud,{mode:0o755});
 return {
  env:{...process.env,PATH:tmp+path.delimiter+process.env.PATH,
   MOCK_LOG:callLog,MOCK_ROOT:process.cwd(),MOCK_SPEC:specPath,
   MOCK_EXISTS:existing?'1':'0',MOCK_PREVIOUS:previousExecution?'1':'0'},
  getLogs:()=>fs.existsSync(callLog)?fs.readFileSync(callLog,'utf8'):'',
  close:()=>fs.rmSync(tmp,{recursive:true,force:true})
 };
}
function check(opts={},mode='--plan'){
 const x=mock(opts);
 try{
  const r=spawnSync('bash',[SCRIPT,mode],{env:x.env,encoding:'utf8'});
  return {status:r.status,text:r.stdout+r.stderr,logs:x.getLogs()};
 }finally{x.close()}
}
test('default plan is read only and holds original source-pin',()=>{
 const r=check();
 assert.equal(r.status,0,r.text);
 assert.match(r.text,/PLAN ONLY/);
 assert.match(r.text,/staging-1502a6da6eed/);
 assert.doesNotMatch(r.logs,/builds submit|run jobs create|run jobs execute/);
});
test('mismatch identity fails before listing or writing resources',()=>{
 const r=check({wrongUser:true},'--create-only');
 assert.equal(r.status,2,r.text);
 assert.match(r.text,/Wrong LSZH/);
 assert.doesNotMatch(r.logs,/run jobs list|run jobs create/);
});
test('previously created job cannot be overwritten by plan/create',()=>{
 const r=check({existing:true},'--create-only');
 assert.equal(r.status,2,r.text);
 assert.match(r.text,/already exists/);
 assert.doesNotMatch(r.logs,/run jobs create/);
});
test('create-only pins 512Mi, one task, no retries and does not execute',()=>{
 const r=check({},'--create-only');
 assert.equal(r.status,0,r.text);
 assert.match(r.logs,/--memory=512Mi/);
 assert.match(r.logs,/--tasks=1/);
 assert.match(r.logs,/--max-retries=0/);
 assert.match(r.logs,/LSZH_OUTBOX_STAGE_ENABLED=false/);
 assert.doesNotMatch(r.logs,/run jobs execute|--execute-now|run services/);
});
test('no existing job means execute blocked',()=>{
 const r=check({},'--execute-once');
 assert.equal(r.status,2,r.text);
 assert.match(r.text,/Exact staging job missing/);
 assert.doesNotMatch(r.logs,/run jobs execute/);
});
test('previous execution blocks all retries even if it failed',()=>{
 const r=check({existing:true,previousExecution:true},'--execute-once');
 assert.equal(r.status,2,r.text);
 assert.match(r.text,/prior execution exists/);
 assert.doesNotMatch(r.logs,/run jobs execute/);
});
test('wrong runtime service account blocks execution',()=>{
 const r=check({existing:true,badServiceIdentity:true},'--execute-once');
 assert.equal(r.status,2,r.text);
 assert.match(r.text,/service identity mismatch/);
 assert.doesNotMatch(r.logs,/run jobs execute/);
});
test('single verified execution performs no extra IAM/deploy/scheduler changes',()=>{
 const r=check({existing:true},'--execute-once');
 assert.equal(r.status,0,r.text);
 assert.equal((r.logs.match(/run jobs execute/g)||[]).length,1);
 assert.match(r.logs,/--wait/);
 assert.doesNotMatch(r.logs,/run services|scheduler|add-iam|run jobs update/);
});
test('unknown mode refuses before GCP',()=>{
 const r=check({},'--enable-prod');
 assert.equal(r.status,2,r.text);
 assert.equal(r.logs,'');
});
