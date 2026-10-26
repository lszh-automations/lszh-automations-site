'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const {inspectMakeContractMockEnvelope}=require('../offer-contract-package-make-mock');
const generator=path.join(__dirname,'../scripts/generate-contract-make-learn-sample.cjs');
const powershell=path.join(__dirname,'../../scripts/learn-crm-contract-make-staging.ps1');
function sample(avv){
  const run=spawnSync(process.execPath,[generator,avv],{
    encoding:'utf8',timeout:20000,maxBuffer:2_000_000,
    env:{...process.env,LSZH_CONTRACT_STAGING_WEBHOOK:''}
  });
  assert.equal(run.status,0,run.stderr);
  assert.equal(run.stderr,'');
  const payload=JSON.parse(run.stdout);
  assert.equal(payload.kind,'contract_package_staging_mock');
  assert.equal(payload.sendMode,'staging_mock_only');
  assert.equal(payload.neverSend,true);
  assert.equal(payload.to,'preview@example.invalid');
  return payload;
}
test('schema learning sample produces valid no-AVV two-document Make TEST_ONLY envelope',()=>{
  const payload=sample('no');
  assert.equal(payload.attachmentCount,2);
  assert.deepEqual(payload.attachments.map(a=>a.kind),['offer','terms']);
  assert.equal(inspectMakeContractMockEnvelope(payload).count,2);
  assert.ok(payload.attachments.every(a=>a.filename.startsWith('TEST_ONLY_')));
});
test('schema learning sample produces valid AVV three-document Make TEST_ONLY envelope',()=>{
  const payload=sample('yes');
  assert.equal(payload.attachmentCount,3);
  assert.deepEqual(payload.attachments.map(a=>a.kind),['offer','terms','avv']);
  assert.equal(inspectMakeContractMockEnvelope(payload).count,3);
});
test('schema learning generator rejects unknown AVV mode without producing a payload',()=>{
  for(const value of ['review','production','maybe']){
    const run=spawnSync(process.execPath,[generator,value],{
      encoding:'utf8',timeout:10000,maxBuffer:300000
    });
    assert.notEqual(run.status,0);
    assert.equal(run.stdout,'');
    assert.match(run.stderr,/TEST_ONLY generator/);
  }
});
test('PowerShell sample upload is explicitly manual, test-only and hides Make webhook URL',()=>{
  const script=fs.readFileSync(powershell,'utf8');
  assert.match(script,/Read-Host 'STAGING webhook URL \(hidden\)' -AsSecureString/);
  assert.match(script,/preview@example\.invalid/);
  assert.match(script,/STAGING_CONTRACT|contract_package_staging_mock/);
  assert.match(script,/Invoke-WebRequest -Uri \$hook -Method Post/);
  assert.doesNotMatch(script,/Write-Host\s*\$hook\b/);
  assert.doesNotMatch(script,/lszh-crm-v2.*\/send|gcloud\.cmd|git push/);
});

test('PowerShell runtime smoke requires exact HTTP 423 denial and never marks mail sent',()=>{
  const script=fs.readFileSync(
    path.join(__dirname,'../../scripts/smoke-crm-contract-make-staging.ps1'),'utf8'
  );
  assert.match(script,/Read-Host 'STAGING webhook URL \(hidden\)' -AsSecureString/);
  assert.match(script,/contract_package_staging_mock/);
  assert.match(script,/staging_mock_only/);
  assert.match(script,/preview@example\.invalid/);
  assert.match(script,/if\(\$status -ne 423\)/);
  assert.match(script,/STAGING_CONTRACT_NOT_ENABLED/);
  assert.match(script,/transmitted -ne \$false/);
  assert.match(script,/null -ne \$receipt\.messageId/);
  assert.match(script,/No automatic retry|no retry/i);
  assert.doesNotMatch(script,/Write-Host\s*\$hook\b/);
  assert.doesNotMatch(script,/lszh-crm-v2.*\/send|gcloud\.cmd|git push/);
});


test('Windows PowerShell 5.1 can parse the strict 423 denial offline with no HTTP request',()=>{
  const script=path.join(__dirname,'../../scripts/smoke-crm-contract-make-staging.ps1');
  const content=fs.readFileSync(script,'utf8');
  assert.match(content,/HttpClient/);
  assert.match(content,/ReadAsStringAsync\(\)/);
  assert.match(content,/if\(\$status -ne 423\)/);
  assert.match(content,/if\(\$SelfTest\)/);
  assert.doesNotMatch(content,/Invoke-WebRequest -Uri \$hook -Method Post/);
  if(process.platform!=='win32')return;
  const result=spawnSync('powershell.exe',[
    '-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-SelfTest'
  ],{
    encoding:'utf8',timeout:15000,maxBuffer:120000,
    env:{...process.env,LSZH_CONTRACT_STAGING_WEBHOOK:''}
  });
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(result.stdout,/LOCAL 423 PARSER SELFTEST PASS/);
  assert.doesNotMatch(result.stdout,/https:\/\/hook|gmail_fake/);
});
