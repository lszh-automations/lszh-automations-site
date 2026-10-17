import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
const script=path.join(path.dirname(fileURLToPath(import.meta.url)),'staging-quarantine-cas-write-once.sh');
function check(overrides={},args=['--plan']){
 const home=mkdtempSync(path.join(tmpdir(),'lszh-temp-iam-read-'));
 const bin=path.join(home,'bin');mkdirSync(bin);
 const audit=path.join(home,'audit.txt'),getLog=path.join(home,'gets.txt');
 const lease=path.join(home,'lease'),condition=path.join(home,'condition.json');
 writeFileSync(path.join(bin,'git'),"#!/usr/bin/env bash\ncase \"$1:$2\" in\n rev-parse:--show-toplevel) echo \"$FAKE_ROOT\" ;;\n rev-parse:HEAD) echo same ;;\n rev-parse:refs/remotes/origin/feature/onboarding-notification-outbox-20261016) echo same ;;\n branch:--show-current) echo feature/onboarding-notification-outbox-20261016 ;;\n status:--porcelain) echo \"$FAKE_DIRTY\" ;;\n *) exit 80 ;;\nesac\n",{mode:0o755});
 writeFileSync(path.join(bin,'gcloud'),"#!/usr/bin/env bash\necho \"$*\" >> \"$FAKE_AUDIT\"\ncase \"$1:$2:$3\" in\n auth:list:*) echo \"$FAKE_ACCOUNT\" ;;\n config:get-value:project) echo lszh-automations ;;\n firestore:databases:describe) echo '{\"name\":\"projects/lszh-automations/databases/lszh-quarantine-staging\",\"locationId\":\"europe-west6\",\"type\":\"FIRESTORE_NATIVE\"}' ;;\n iam:service-accounts:describe) echo '{\"email\":\"lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com\"}' ;;\n iam:roles:describe) echo '{\"name\":\"projects/lszh-automations/roles/lszhQuarantineCasStaging\",\"stage\":\"GA\",\"includedPermissions\":[\"datastore.entities.get\",\"datastore.entities.create\",\"datastore.entities.update\"]}' ;;\n projects:get-iam-policy:*) echo '{\"bindings\":[{\"role\":\"projects/lszh-automations/roles/lszhQuarantineCasStaging\",\"members\":[\"serviceAccount:lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com\"],\"condition\":{\"title\":\"LSZHQuarantineCASStaging\",\"expression\":\"resource.name==\\\"projects/lszh-automations/databases/lszh-quarantine-staging\\\"\"}}]}' ;;\n services:list:--enabled) echo iamcredentials.googleapis.com ;;\n iam:service-accounts:get-iam-policy)\n    if [[ -e \"$FAKE_LEASE\" ]];then\n      printf '{\"bindings\":[{\"role\":\"roles/iam.serviceAccountTokenCreator\",\"members\":[\"user:lars@lszh-automations.ch\"],\"condition\":'\n      cat \"$FAKE_CONDITION\"\n      echo '}]}'\n    elif [[ \"$FAKE_EXISTING\" == 1 ]];then\n      echo '{\"bindings\":[{\"role\":\"roles/iam.serviceAccountTokenCreator\",\"members\":[\"user:lars@lszh-automations.ch\"]}]}'\n    else echo '{\"bindings\":[]}';fi ;;\n iam:service-accounts:add-iam-policy-binding)\n    if [[ \"$FAKE_ADD_FAIL\" == 1 ]];then exit 77;fi\n    for a in \"$@\";do\n      case \"$a\" in --condition-from-file=*) file=\"$(printf '%s' \"$a\" | cut -d= -f2-)\"; cp \"$file\" \"$FAKE_CONDITION\" ;; esac\n    done\n    touch \"$FAKE_LEASE\";echo added ;;\n iam:service-accounts:remove-iam-policy-binding)\n    if [[ \"$FAKE_REMOVE_FAIL\" == 1 ]];then exit 78;fi\n    rm -f \"$FAKE_LEASE\";echo removed ;;\n auth:print-access-token:*)\n    if [[ \"$FAKE_TOKEN_FAIL\" == 1 ]];then echo \"PERMISSION_DENIED: iam.serviceAccounts.getAccessToken secret-sentinel-example\" >&2; exit 79;fi\n    printf 'SYNTHETIC_TEST_ONLY_LONG_NOT_A_REAL_ACCESS_TOKEN_12345678901234567890\\n' ;;\n *) echo unexpected-cloud-command >&2; exit 90 ;;\nesac\n",{mode:0o755});
 writeFileSync(path.join(bin,'sleep'),"#!/usr/bin/env bash\necho sleep:$* >> \"$FAKE_AUDIT\"\nif [[ \"$FAKE_SLEEP_FAIL\" == 1 ]];then exit 1;fi\n",{mode:0o755});
 writeFileSync(path.join(bin,'node'),"#!/usr/bin/env bash\necho node:$* >> \"$FAKE_AUDIT\"\nif [[ \"$1\" == --check ]];then exit 0;fi\nif [[ \"$FAKE_NODE_FAIL\" == 1 ]];then echo BLOCKED: mocked_failure;exit 2;fi\necho 'PASS: CREATE committed conditionally (exists:false); revision 1 read back and verified.'\necho 'PASS: UPDATE committed with exact old updateTime; revision 2 verified.'\necho 'DONE: One synthetic CREATE, one conditional UPDATE, three GETs, no deletes.'\n",{mode:0o755});
 writeFileSync(path.join(home,'sitecustomize.py'),"import os,urllib.request,urllib.error\nclass FakeOpener:\n def open(self,request,timeout=10):\n  url=request.full_url\n  with open(os.environ['FAKE_GET_LOG'],'a') as f:\n   f.write(request.get_method()+' '+url+'\\n')\n  code=404 if '/databases/lszh-quarantine-staging/' in url else 403\n  if os.environ.get('FAKE_DENY_FAIL')=='1' and code==403:\n   code=404\n  raise urllib.error.HTTPError(url,code,'mock status',{},None)\nurllib.request.build_opener=lambda *args,**kwargs: FakeOpener()\n");
 try {
 const p=spawnSync('bash',[script,...args],{cwd:process.cwd(),encoding:'utf8',timeout:25000,
  env:{...process.env,PATH:bin+':'+process.env.PATH,PYTHONPATH:home,HOME:home,
  FAKE_ROOT:process.cwd(),FAKE_AUDIT:audit,FAKE_GET_LOG:getLog,FAKE_LEASE:lease,
  FAKE_CONDITION:condition,FAKE_ACCOUNT:overrides.wrongAccount?'wrong@example.invalid':'lars@lszh-automations.ch',
  FAKE_DIRTY:overrides.dirty?' M fake':'',
  FAKE_EXISTING:overrides.existing?'1':'0',FAKE_ADD_FAIL:overrides.addFail?'1':'0',
  FAKE_REMOVE_FAIL:overrides.removeFail?'1':'0',
  FAKE_SLEEP_FAIL:overrides.sleepFail?'1':'0',FAKE_NODE_FAIL:overrides.nodeFail?'1':'0',
  FAKE_TOKEN_FAIL:overrides.tokenFail?'1':'0',FAKE_DENY_FAIL:overrides.denyFail?'1':'0',
  LSZH_TEMPORARY_IMPERSONATION_APPROVAL:overrides.approved?
   'I_APPROVE_SINGLE_SYNTHETIC_QUARANTINE_CAS_WRITE':''}});
 return {status:p.status,stdout:p.stdout,stderr:p.stderr,
  audit:existsSync(audit)?readFileSync(audit,'utf8'):'',
  gets:existsSync(getLog)?readFileSync(getLog,'utf8'):'',
  leaseExists:existsSync(lease),
  condition:existsSync(condition)?JSON.parse(readFileSync(condition,'utf8')):null,
  marker:existsSync(path.join(home,'.local/state/lszh-automations/quarantine-cas-write-once-20261017.once'))};
 }finally{rmSync(home,{recursive:true,force:true});}
}
function noExtraneousActions(r){
 assert.doesNotMatch(r.audit,/projects add-iam|firestore databases create|iam roles create|iam service-accounts create|services enable|firestore documents|run jobs|run deploy|auth activate-service-account/);
 assert.doesNotMatch(r.stdout,/SYNTHETIC_TEST_ONLY_LONG|Bearer |access_token/);
}

test('plan checks metadata only and makes no IAM grant or runtime call',()=>{
 for(const a of [[],['--plan']]){
  const r=check({},a);
  assert.equal(r.status,0,r.stdout+'\n'+r.stderr);
  assert.match(r.stdout,/PLAN ONLY/);
  assert.match(r.stdout,/synthetic CREATE/);
  assert.match(r.stdout,/three GETs/);
  assert.doesNotMatch(r.audit,/add-iam-policy-binding|remove-iam-policy-binding|sleep:600|node:workers\/onboarding-notifications\/staging-quarantine-cas-write-once.js/);
  assert.equal(r.leaseExists,false);
  noExtraneousActions(r);
 }
});
test('fresh explicit approval marker required before IAM mutation',()=>{
 const r=check({},['--run-approved-once']);
 assert.equal(r.status,2,r.stdout+'\n'+r.stderr);
 assert.match(r.stdout,/approval marker missing/);
 assert.doesNotMatch(r.audit,/add-iam-policy-binding/);
});
test('approved single grant 600-second pause one synthetic runner and exact revoke',()=>{
 const r=check({approved:true},['--run-approved-once']);
 assert.equal(r.status,0,r.stdout+'\n'+r.stderr);
 const grant=r.audit.indexOf('iam service-accounts add-iam-policy-binding');
 const pause=r.audit.indexOf('sleep:600');
 const run=r.audit.indexOf('node:workers/onboarding-notifications/staging-quarantine-cas-write-once.js');
 const revoke=r.audit.indexOf('iam service-accounts remove-iam-policy-binding');
 assert.ok(grant>=0&&pause>grant&&run>pause&&revoke>run,r.audit);
 assert.equal((r.audit.match(/iam service-accounts add-iam-policy-binding/g)||[]).length,1);
 assert.equal((r.audit.match(/iam service-accounts remove-iam-policy-binding/g)||[]).length,1);
 assert.equal((r.audit.match(/node:workers\/onboarding-notifications\/staging-quarantine-cas-write-once.js/g)||[]).length,1,r.audit);
 assert.equal(r.leaseExists,false);
 assert.match(r.condition.expression,/^request.time < timestamp\("[0-9TZ:-]+"\)$/);
 assert.match(r.stdout,/Temporary IAM binding absent in fresh readback/);
 assert.ok(r.marker);
 noExtraneousActions(r);
});
test('existing grant, wrong account and dirty checkout all block before mutation',()=>{
 for(const x of [{existing:true},{wrongAccount:true},{dirty:true}]){
  const r=check({...x,approved:true},['--run-approved-once']);
  assert.equal(r.status,2,r.stdout+'\n'+r.stderr);
  assert.doesNotMatch(r.audit,/add-iam-policy-binding/);
 }
});
test('failed propagation wait revokes without running synthetic Node probe',()=>{
 const r=check({approved:true,sleepFail:true},['--run-approved-once']);
 assert.equal(r.status,2,r.stdout+'\n'+r.stderr);
 assert.match(r.stdout,/Propagation wait interrupted/);
 assert.doesNotMatch(r.audit,/node:workers\/onboarding-notifications\/staging-quarantine-cas-write-once.js/);
 assert.equal(r.leaseExists,false);
 assert.match(r.stdout,/Temporary IAM binding absent in fresh readback/);
});
test('failed synthetic Node probe revokes with no second attempt',()=>{
 const r=check({approved:true,nodeFail:true},['--run-approved-once']);
 assert.equal(r.status,2,r.stdout+'\n'+r.stderr);
 assert.match(r.stdout,/mocked_failure/);
 assert.equal(r.leaseExists,false);
 assert.equal((r.audit.match(/node:workers\/onboarding-notifications\/staging-quarantine-cas-write-once.js/g)||[]).length,1,r.audit);
 assert.match(r.stdout,/Temporary IAM binding absent in fresh readback/);
});
test('IAM grant failure cleans up and never runs a synthetic probe',()=>{
 const r=check({approved:true,addFail:true},['--run-approved-once']);
 assert.equal(r.status,2,r.stdout+'\n'+r.stderr);
 assert.match(r.stdout,/UNVERIFIED: Timed binding change failed/);
 assert.doesNotMatch(r.audit,/node:workers\/onboarding-notifications\/staging-quarantine-cas-write-once.js/);
});
test('failed IAM revoke reports warning; 30-minute condition remains fallback',()=>{
 const r=check({approved:true,removeFail:true},['--run-approved-once']);
 assert.equal(r.status,2,r.stdout+'\n'+r.stderr);
 assert.match(r.stdout,/WARNING: Immediate scoped IAM revoke failed/);
 assert.match(r.stdout,/Temporary IAM removal not verified/);
 assert.equal(r.leaseExists,true);
});
test('shell syntax valid; exactly one grant/removal and no Cloud Run',()=>{
 const c=spawnSync('bash',['-n',script],{encoding:'utf8'});
 assert.equal(c.status,0,c.stderr);
 const txt=readFileSync(script,'utf8');
 assert.equal((txt.match(/gcloud iam service-accounts add-iam-policy-binding/g)||[]).length,1);
 assert.equal((txt.match(/gcloud iam service-accounts remove-iam-policy-binding/g)||[]).length,1);
 assert.doesNotMatch(txt,/gcloud run jobs execute|gcloud run deploy|firestore documents delete/);
});
