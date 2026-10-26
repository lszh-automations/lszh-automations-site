'use strict';
// C3.7.1 secretless checks only. A future OAuth consent flow is separately gated.
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const script=readFileSync(resolve(__dirname,
  '../../scripts/check-crm-c37-oauth-infrastructure.ps1'),'utf8');

test('C3.7.1 infrastructure preflight is pinned to staging resources and Zurich',()=>{
  for(const fragment of [
    "'lszh-automations'","'lszh-crm-c37-ro'",
    "'lszh-crm-c37-gmail-readonly'","'europe-west6'",
    '470613067122','roles/secretmanager.secretAccessor'
  ])assert.ok(script.includes(fragment),'Expected pin missing: '+fragment);
});
test('C3.7.1 preflight only reads metadata, IAM and version count',()=>{
  assert.match(script,/Get-GcloudJson -Arguments @\('iam','service-accounts','describe'/);
  assert.match(script,/Get-GcloudJson -Arguments @\('secrets','describe'/);
  assert.match(script,/Get-GcloudJson -Arguments @\('secrets','get-iam-policy'/);
  assert.match(script,/gcloud\.cmd secrets versions list \$SecretId/);
  assert.match(script,/--format=value\(name\)/);
  assert.doesNotMatch(script,
    /secrets\s+(versions\s+(access|add|destroy|disable|enable)|delete|create|add-iam-policy-binding)/i);
  assert.doesNotMatch(script,
    /gcloud\.cmd\s+(run\s+deploy|services\s+enable|auth\s+application-default)/i);
  assert.doesNotMatch(script,/Invoke-RestMethod|Invoke-WebRequest|Set-Content|Out-File/);
});
test('C3.7.1 preflight denies mismatched principals and nonempty secret',()=>{
  assert.match(script,/if \(\$Project -cne 'lszh-automations'/);
  assert.match(script,/replicas\.Count -ne 1/);
  assert.match(script,/accessors\.Count -ne 1/);
  assert.match(script,/accessors\[0\]\.members/);
  assert.match(script,/presentVersions\.Count -ne 0/);
  assert.match(script,/NO SECRET VALUES READ OR CHANGED/);
});
test('C3.7.1 preflight is not wired to CRM APIs or provider mailing',()=>{
  for(const name of ['server.js','offer-send.js']){
    const src=readFileSync(resolve(__dirname,'..',name),'utf8');
    assert.doesNotMatch(src,/check-crm-c37-oauth-infrastructure/);
  }
  assert.doesNotMatch(script,/refresh_token|client_secret|bearer|gmail\.send/i);
});

test('C3.7.1 IAM account allows omitted disabled field, but denies true or malformed',()=>{
  assert.match(script,/PSObject\.Properties\['disabled'\]/);
  assert.match(script,/\$null -ne \$disabledField/);
  assert.match(script,/\$disabledField\.Value -isnot \[bool\]/);
  assert.match(script,/\$disabledField\.Value -eq \$true/);
  assert.doesNotMatch(script,/\$sa\.disabled/);
});
