import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,chmodSync,readFileSync,existsSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {PROJECT,EXISTING,TARGET,REGION,PERMS}=require('./quarantine-provisioning-readiness');
const SCRIPT=path.join(path.dirname(fileURLToPath(import.meta.url)),'staging-quarantine-provisioning-readiness.sh');
function simulate(overrides={},args=['--plan']){
 const root=mkdtempSync(path.join(tmpdir(),'lszh-quarantine-prereq-'));
 const bin=path.join(root,'bin');mkdirSync(bin);
 const audit=path.join(root,'audit');
 writeFileSync(path.join(bin,'git'),"#!/usr/bin/env bash\ncase \"$1:$2\" in\n rev-parse:--show-toplevel) echo \"$FAKE_ROOT\" ;;\n rev-parse:HEAD) echo same ;;\n rev-parse:refs/remotes/origin/feature/onboarding-notification-outbox-20261016) echo same ;;\n branch:--show-current) echo feature/onboarding-notification-outbox-20261016 ;;\n status:--porcelain) echo \"$FAKE_DIRTY\" ;;\n *) exit 61;;\nesac\n");
 writeFileSync(path.join(bin,'gcloud'),"#!/usr/bin/env bash\necho \"$*\" >> \"$FAKE_AUDIT\"\ncase \"$1:$2:$3\" in\n auth:list:*) echo \"$FAKE_ACCOUNT\" ;;\n config:get-value:project) echo lszh-automations ;;\n billing:projects:describe)\n   [[ \"$FAKE_BILLING_FAIL\" == 1 ]] && exit 61\n   cat \"$FAKE_BILLING\" ;;\n services:list:--enabled) cat \"$FAKE_SERVICES\" ;;\n firestore:databases:list) cat \"$FAKE_DATABASES\" ;;\n iam:list-testable-permissions:*)\n   [[ \"$FAKE_PERMS_FAIL\" == 1 ]] && exit 62\n   cat \"$FAKE_PERMS\" ;;\n *) echo \"unexpected\" >&2;exit 81;;\nesac\n");
 chmodSync(path.join(bin,'git'),0o755);
 chmodSync(path.join(bin,'gcloud'),0o755);
 const fixtures={
  billing:{billingEnabled:true,billingAccountName:'billingAccounts/SYNTHETIC_ONLY'},
  services:[{config:{name:'firestore.googleapis.com'}}],
  databases:[{name:'projects/'+PROJECT+'/databases/'+EXISTING,
    locationId:REGION,type:'FIRESTORE_NATIVE'}],
  perms:PERMS.map(name=>({name,stage:'GA',customRolesSupportLevel:'SUPPORTED'}))
 };
 const files={};
 for(const [k,v] of Object.entries(fixtures)){
  files[k]=path.join(root,k+'.json');
  writeFileSync(files[k],JSON.stringify(overrides[k]??v));
 }
 try{
  const run=spawnSync('bash',[SCRIPT,...args],{cwd:root,encoding:'utf8',timeout:20000,
   env:{...process.env,PATH:bin+':'+process.env.PATH,
    FAKE_ROOT:process.cwd(),FAKE_ACCOUNT:overrides.account??'lars@lszh-automations.ch',
    FAKE_DIRTY:overrides.dirty??'',FAKE_AUDIT:audit,
    FAKE_BILLING:files.billing,FAKE_SERVICES:files.services,
    FAKE_DATABASES:files.databases,FAKE_PERMS:files.perms,
    FAKE_BILLING_FAIL:overrides.billingFail?'1':'0',FAKE_PERMS_FAIL:overrides.permsFail?'1':'0'}});
  return {...run,audit:existsSync(audit)?readFileSync(audit,'utf8'):''};
 }finally{rmSync(root,{recursive:true,force:true});}
}
function noWrites(x){
 assert.doesNotMatch(x.audit,/run jobs execute|firestore databases create|add-iam|iam roles create|iam service-accounts create|services enable|firestore documents|auth print-access-token|builds submit|run deploy/);
 assert.doesNotMatch(x.stdout,/SYNTHETIC_ONLY|billingAccounts\/|Bearer |access_token/);
}
test('valid metadata proves readiness ONLY without allowing GCP changes',()=>{
 const x=simulate();
 assert.equal(x.status,0,x.stdout+'\n'+x.stderr);
 assert.match(x.stdout,/PASS: Billing active/);
 assert.match(x.stdout,/COST: Extra named database is usage-billed and has no free tier/);
 assert.match(x.stdout,/NO APPROVAL/);
 assert.match(x.stdout,/READ ONLY/);
 assert.match(x.audit,/billing projects describe/);
 assert.match(x.audit,/firestore databases list/);
 assert.match(x.audit,/iam list-testable-permissions/);
 noWrites(x);
});
test('billing missing or false stops without changes or leaking billing accounts',()=>{
 for(const vars of [
  {billing:{billingEnabled:false,billingAccountName:'billingAccounts/SYNTHETIC_ONLY'}},
  {billingFail:true}
 ]){
  const x=simulate(vars);assert.equal(x.status,2,x.stdout+'\n'+x.stderr);assert.match(x.stdout,/BLOCKED/);noWrites(x);
 }
});
test('target existing, wrong staging region and incompatible permission each block',()=>{
 const base=[{name:'projects/'+PROJECT+'/databases/'+EXISTING,locationId:REGION,type:'FIRESTORE_NATIVE'}];
 for(const vars of [
  {databases:[...base,{name:'projects/'+PROJECT+'/databases/'+TARGET,locationId:REGION,type:'FIRESTORE_NATIVE'}]},
  {databases:[{name:'projects/'+PROJECT+'/databases/'+EXISTING,locationId:'us-central1',type:'FIRESTORE_NATIVE'}]},
  {perms:PERMS.map(name=>({name,stage:'GA',customRolesSupportLevel:'TESTING'}))}
 ]){
  const x=simulate(vars);assert.equal(x.status,2,x.stdout+'\n'+x.stderr);assert.match(x.stdout,/BLOCKED/);noWrites(x);
 }
});
test('unavailable permission inventory, wrong account, dirty branch and unsupported mode fail closed',()=>{
 for(const [vars,args] of [
  [{permsFail:true},['--plan']],
  [{account:'other@example.invalid'},['--plan']],
  [{dirty:' M source'},['--plan']],
  [{},['--apply']],
  [{},['--plan','--execute-once']]
 ]){
  const x=simulate(vars,args);
  assert.equal(x.status,2,x.stdout+'\n'+x.stderr);
  noWrites(x);
 }
});
test('bash syntax and source guard do not permit direct Cloud mutations',()=>{
 const check=spawnSync('bash',['-n',SCRIPT],{encoding:'utf8'});
 assert.equal(check.status,0,check.stderr);
 const s=readFileSync(SCRIPT,'utf8');
 assert.doesNotMatch(s,/gcloud (?:firestore databases create|iam roles create|iam service-accounts create|projects add-iam|services enable|run jobs execute|auth print-access-token)/);
});
