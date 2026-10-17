import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,chmodSync,existsSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {PROJECT,EXISTING,TARGET,REGION,PERMS}=require('./quarantine-provisioning-readiness');
const SCRIPT=path.join(path.dirname(fileURLToPath(import.meta.url)),'staging-quarantine-db-provision.sh');
function simulated({approved=false,createFail=false,existing=false,badProtection=false,
                     dirty=false,wrongUser=false}={},args=['--plan']){
 const root=mkdtempSync(path.join(tmpdir(),'lszh-quarantine-db-once-'));
 const bin=path.join(root,'bin');mkdirSync(bin);
 const log=path.join(root,'commands.log');
 writeFileSync(path.join(bin,'git'),"#!/usr/bin/env bash\ncase \"$1:$2\" in\n rev-parse:--show-toplevel) echo \"$FAKE_ROOT\" ;;\n rev-parse:HEAD) echo same ;;\n rev-parse:refs/remotes/origin/feature/onboarding-notification-outbox-20261016) echo same ;;\n branch:--show-current) echo feature/onboarding-notification-outbox-20261016 ;;\n status:--porcelain) echo \"$FAKE_DIRTY\" ;;\n *) exit 61 ;;\nesac\n",{mode:0o755});
 writeFileSync(path.join(bin,'gcloud'),"#!/usr/bin/env bash\necho \"$*\" >> \"$FAKE_LOG\"\ncase \"$1:$2:$3\" in\n auth:list:*) echo \"$FAKE_ACCOUNT\" ;;\n config:get-value:project) echo lszh-automations ;;\n billing:projects:describe) cat \"$FAKE_BILLING\" ;;\n services:list:--enabled) cat \"$FAKE_SERVICES\" ;;\n firestore:databases:list) cat \"$FAKE_DATABASES\" ;;\n firestore:databases:create)\n   [[ \"$FAKE_CREATE_FAIL\" == 1 ]] && exit 13\n   echo created ;;\n firestore:databases:describe) cat \"$FAKE_DESCRIBE\" ;;\n iam:list-testable-permissions:*) cat \"$FAKE_PERMISSIONS\" ;;\n *) echo unexpected >&2;exit 81 ;;\nesac\n",{mode:0o755});
 const names={
  billing:{billingEnabled:true,billingAccountName:'billingAccounts/SYNTHETIC'},
  services:[{config:{name:'firestore.googleapis.com'}}],
  databases:[{
   name:'projects/'+PROJECT+'/databases/'+EXISTING,
   locationId:REGION,type:'FIRESTORE_NATIVE'
  },...(existing?[{
   name:'projects/'+PROJECT+'/databases/'+TARGET,
   locationId:REGION,type:'FIRESTORE_NATIVE'
  }]:[])],
  permissions:PERMS.map(name=>({name,stage:'GA',customRolesSupportLevel:'SUPPORTED'})),
  describe:{
   name:'projects/'+PROJECT+'/databases/'+TARGET,
   locationId:REGION,type:'FIRESTORE_NATIVE',edition:'STANDARD',
   deleteProtectionState:badProtection?'DELETE_PROTECTION_DISABLED':'DELETE_PROTECTION_ENABLED'
  }
 };
 const files={};
 for(const [key,value] of Object.entries(names)){
  files[key]=path.join(root,key+'.json');
  writeFileSync(files[key],JSON.stringify(value));
 }
 try {
  const x=spawnSync('bash',[SCRIPT,...args],{cwd:process.cwd(),encoding:'utf8',timeout:20000,
   env:{...process.env,PATH:bin+':'+process.env.PATH,FAKE_ROOT:process.cwd(),
    FAKE_DIRTY:dirty?' M file':'',FAKE_ACCOUNT:wrongUser?'someone@invalid.example':'lars@lszh-automations.ch',
    FAKE_BILLING:files.billing,FAKE_SERVICES:files.services,
    FAKE_DATABASES:files.databases,FAKE_PERMISSIONS:files.permissions,
    FAKE_DESCRIBE:files.describe,FAKE_CREATE_FAIL:createFail?'1':'0',
    FAKE_LOG:log,
    LSZH_QUARANTINE_DB_CREATION_APPROVAL:approved?
     'I_APPROVE_LSZH_QUARANTINE_STAGING_BILLABLE_DATABASE_CREATION':''}});
  return {status:x.status,output:x.stdout+'\n'+x.stderr,
   calls:existsSync(log)?readFileSync(log,'utf8'):''};
 }finally{rmSync(root,{recursive:true,force:true});}
}
function noOtherWrites(x) {
 assert.doesNotMatch(x.calls,/iam roles create|iam service-accounts create|projects add-iam|run jobs|firestore documents|services enable|builds submit|billing projects link/);
 assert.doesNotMatch(x.output,/billingAccounts\/|SYNTHETIC|Bearer|access_token/);
}
test('default and explicit plan are read-only and print exact target/cost warning',()=>{
 for(const args of [[],['--plan']]){
  const x=simulated({},args);
  assert.equal(x.status,0,x.output);
  assert.match(x.output,/PLAN ONLY/);
  assert.match(x.output,/usage billing and no own free tier/);
  assert.match(x.output,/Deletion protection enabled/);
  assert.doesNotMatch(x.calls,/firestore databases create/);
  noOtherWrites(x);
 }
});
test('create-once cannot run without separate exact billable approval',()=>{
 const x=simulated({},['--create-once']);
 assert.equal(x.status,2,x.output);
 assert.match(x.output,/approval is missing/);
 assert.doesNotMatch(x.calls,/firestore databases create/);
 noOtherWrites(x);
});
test('approved one shot creates ONLY pinned Standard Native named database with deletion protection',()=>{
 const x=simulated({approved:true},['--create-once']);
 assert.equal(x.status,0,x.output);
 assert.equal((x.calls.match(/firestore databases create/g)||[]).length,1);
 assert.match(x.calls,/--project=lszh-automations/);
 assert.match(x.calls,/--database=lszh-quarantine-staging/);
 assert.match(x.calls,/--location=europe-west6/);
 assert.match(x.calls,/--edition=standard/);
 assert.match(x.calls,/--type=firestore-native/);
 assert.match(x.calls,/--delete-protection/);
 assert.match(x.output,/PASS: Exact Zurich Native database and deletion protection verified/);
 assert.match(x.output,/DO NOT RERUN/);
 noOtherWrites(x);
});
test('target already exists: no create call, no privilege widening',()=>{
 const x=simulated({approved:true,existing:true},['--create-once']);
 assert.equal(x.status,2,x.output);
 assert.match(x.output,/QUARANTINE_DATABASE_ALREADY_EXISTS/);
 assert.doesNotMatch(x.calls,/firestore databases create/);
 noOtherWrites(x);
});
test('create failure leaves result unresolved without retry',()=>{
 const x=simulated({approved:true,createFail:true},['--create-once']);
 assert.equal(x.status,2,x.output);
 assert.match(x.output,/UNVERIFIED: Create returned an error or timed out/);
 assert.equal((x.calls.match(/firestore databases create/g)||[]).length,1);
 assert.doesNotMatch(x.calls,/firestore databases describe/);
 noOtherWrites(x);
});
test('unexpected deletion-protection state after create fails closed',()=>{
 const x=simulated({approved:true,badProtection:true},['--create-once']);
 assert.equal(x.status,2,x.output);
 assert.match(x.output,/metadata differs from reviewed configuration/);
 assert.equal((x.calls.match(/firestore databases create/g)||[]).length,1);
 noOtherWrites(x);
});
test('wrong account, dirty checkout or unknown mode block all create attempts',()=>{
 for(const [opts,args] of [
  [{approved:true,wrongUser:true},['--create-once']],
  [{approved:true,dirty:true},['--create-once']],
  [{approved:true},['--execute-now']]
 ]){
  const x=simulated(opts,args);
  assert.equal(x.status,2,x.output);
  assert.doesNotMatch(x.calls,/firestore databases create/);
  noOtherWrites(x);
 }
});
test('script syntax is valid and contains only one exact database creation command',()=>{
 const syntax=spawnSync('bash',['-n',SCRIPT],{encoding:'utf8'});
 assert.equal(syntax.status,0,syntax.stderr);
 const source=readFileSync(SCRIPT,'utf8');
 assert.equal((source.match(/gcloud firestore databases create/g)||[]).length,1);
 assert.ok(source.includes('--delete-protection'));
 assert.ok(source.includes('--edition=standard'));
 assert.ok(source.includes('--type=firestore-native'));
});
