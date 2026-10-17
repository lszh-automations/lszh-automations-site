import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,chmodSync,readFileSync,existsSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=path.join(path.dirname(fileURLToPath(import.meta.url)),'staging-airtable-v2-success-diagnose.sh');
function simulate(vars={},args=[]){
 const dir=mkdtempSync(path.join(tmpdir(),'lszh-v2-confirm-'));
 const bin=path.join(dir,'bin'),audit=path.join(dir,'audit');mkdirSync(bin);
 writeFileSync(path.join(bin,'git'),"#!/bin/bash\ncase \"$1:$2\" in\n rev-parse:--show-toplevel) echo \"$FAKE_ROOT\" ;;\n rev-parse:HEAD) echo same ;;\n rev-parse:refs/remotes/origin/feature/onboarding-notification-outbox-20261016) echo same ;;\n branch:--show-current) echo feature/onboarding-notification-outbox-20261016 ;;\n status:--porcelain) echo \"${FAKE_DIRTY:-}\" ;;\n *) exit 77 ;;\nesac\n");
 writeFileSync(path.join(bin,'gcloud'),"#!/bin/bash\necho \"$*\" >> \"$FAKE_AUDIT\"\ncase \"$1:$2:$3\" in\n auth:list:*) echo \"${FAKE_ACCOUNT:-lars@lszh-automations.ch}\" ;;\n config:get-value:project) echo lszh-automations ;;\n run:jobs:executions)\n  if [[ \"$4\" == list ]];then\n   if [[ \"$*\" == *\"--job=lszh-airtable-read-probe-staging\"* ]];then\n    echo '[{\"name\":\"lszh-airtable-read-probe-staging-xglcz\"}]'\n   elif [[ \"${FAKE_BAD_EXEC:-0}\" == 1 ]];then\n    echo '[{\"name\":\"wrong\"}]'\n   elif [[ \"${FAKE_DOUBLE:-0}\" == 1 ]];then\n    echo '[{\"name\":\"lszh-airtable-read-probe-fix-staging-7ppq4\"},{\"name\":\"other\"}]'\n   else echo '[{\"name\":\"lszh-airtable-read-probe-fix-staging-7ppq4\"}]';fi\n  elif [[ \"$4\" == describe ]];then\n   if [[ \"${FAKE_FAILED_STATUS:-0}\" == 1 ]];then\n    echo '{\"name\":\"lszh-airtable-read-probe-fix-staging-7ppq4\",\"status\":{\"succeededCount\":0,\"failedCount\":1}}'\n   else\n    echo '{\"name\":\"lszh-airtable-read-probe-fix-staging-7ppq4\",\"status\":{\"succeededCount\":1,\"failedCount\":0}}'\n   fi\n  else exit 91;fi ;;\n logging:read:*)\n   [[ \"$*\" == *'resource.labels.job_name=\"lszh-airtable-read-probe-fix-staging\"'* ]] || exit 92\n   [[ \"$*\" == *'resource.labels.location=\"europe-west6\"'* ]] || exit 93\n   python3 - <<'PY'\nimport json,os\njob=\"lszh-airtable-read-probe-fix-staging\"\neid=\"lszh-airtable-read-probe-fix-staging-7ppq4\"\nres={\"type\":\"cloud_run_job\",\"labels\":{\"job_name\":job,\"location\":\"europe-west6\"}}\nname=\"projects/123/logs/run.googleapis.com%2Fstdout\"\nexpected=[\n \"PASS: Existing verifyOnboardingState() used Airtable REST via exactly one GET.\",\n \"PASS: Fresh unprinted synthetic project code absent; processing (not completed).\",\n \"PASS: No Airtable writes, Firestore operations, service changes or emails.\",\n]\nmode=os.environ.get(\"FAKE_LOG_MODE\",\"ok\")\nif mode==\"missing\":expected=expected[:2]\nif mode==\"duplicate\":expected.append(expected[0])\nrows=[{\"resource\":res,\"labels\":{\"run.googleapis.com/execution_name\":eid},\n  \"logName\":name,\"textPayload\":s} for s in expected]\nif mode==\"stop\":rows.append({\"resource\":res,\"labels\":{\"run.googleapis.com/execution_name\":eid},\n  \"logName\":\"projects/123/logs/run.googleapis.com%2Fstderr\",\n  \"textPayload\":\"STOP: airtable_token_not_authorized\"})\nif mode==\"wrong_labels\":\n for row in rows:row[\"labels\"]={\"run.googleapis.com/execution_name\":\"different\"}\nrows += [\n {\"resource\":res,\"labels\":{},\"logName\":name,\"textPayload\":expected[0]},\n {\"resource\":res,\"labels\":{\"run.googleapis.com/execution_name\":\"different\"},\n  \"logName\":name,\"textPayload\":\"STOP: pat_MUST_NOT_LEAK_TOP_SECRET_VALUE\"}\n]\nprint(json.dumps(rows))\nPY\n   ;;\n *) exit 95 ;;\nesac\n");
 for(const file of ['git','gcloud'])chmodSync(path.join(bin,file),0o755);
 try{
  const p=spawnSync('bash',[script,...args],{cwd:dir,encoding:'utf8',timeout:15000,
   env:{...process.env,PATH:bin+':'+process.env.PATH,FAKE_ROOT:dir,FAKE_AUDIT:audit,...vars}});
  return {...p,audit:existsSync(audit)?readFileSync(audit,'utf8'):''};
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test('exact V2 execution and 3 labelled stdout PASS prove read-only success with no raw logs',()=>{
 const r=simulate();
 assert.equal(r.status,0,r.stdout+'\n'+r.stderr);
 assert.match(r.stdout,/Live STAGING Cloud Run -> Airtable GET succeeded exactly once/);
 assert.match(r.stdout,/original historic failed job preserved/);
 assert.match(r.stdout,/READ ONLY:/);
 assert.doesNotMatch(r.stdout,/pat_MUST_NOT_LEAK|TOP_SECRET|airtable_token_not_authorized/);
 assert.doesNotMatch(r.audit,/jobs execute|jobs create|secrets versions access|run deploy|builds submit/);
 assert.match(r.audit,/logging read .*resource.labels.job_name=/);
});
test('missing, duplicated, unlabeled and STOP logs cannot claim confirmed success',()=>{
 for(const mode of ['missing','duplicate','stop','wrong_labels']){
  const r=simulate({FAKE_LOG_MODE:mode});
  assert.notEqual(r.status,0,mode+'\n'+r.stdout+'\n'+r.stderr);
  assert.doesNotMatch(r.stdout,/TOP_SECRET|pat_MUST_NOT_LEAK|airtable_token_not_authorized/);
  assert.doesNotMatch(r.audit,/jobs execute/);
 }
});
test('changed execution history, failed task, wrong account or dirty source fail closed',()=>{
 for(const vars of [{FAKE_BAD_EXEC:'1'},{FAKE_DOUBLE:'1'},{FAKE_FAILED_STATUS:'1'},
  {FAKE_ACCOUNT:'untrusted@example.invalid'},{FAKE_DIRTY:' M dirty'}]){
  const r=simulate(vars);
  assert.notEqual(r.status,0,JSON.stringify(vars)+'\n'+r.stdout+'\n'+r.stderr);
  assert.doesNotMatch(r.audit,/jobs execute|jobs create/);
 }
});
test('no extra arguments, Bash syntax valid, no cloud mutation commands',()=>{
 const r=simulate({},['--execute-once']);
 assert.notEqual(r.status,0);
 assert.equal(r.audit,'');
 const check=spawnSync('bash',['-n',script],{encoding:'utf8'});
 assert.equal(check.status,0,check.stderr);
 const source=readFileSync(script,'utf8');
 assert.doesNotMatch(source,/gcloud (?:run jobs (?:execute|create|update|delete)|builds submit|secrets versions access|projects add-iam-policy-binding|secrets add-iam-policy-binding)/);
});
