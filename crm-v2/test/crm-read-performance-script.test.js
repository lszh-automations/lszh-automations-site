'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../../scripts/measure-crm-read-performance.ps1'),'utf8');

test('performance script is read-only and pinned to current CRM live revision',()=>{
  assert.match(script,/lszh-crm-v2-00065-xuk/);
  assert.match(script,/lszh-crm-v2-00063-baz/);
  assert.match(script,/gcloud\.cmd run services describe/);
  assert.match(script,/gcloud\.cmd logging read/);
  assert.match(script,/monitoring\.googleapis\.com\/v3\/projects/);
  assert.match(script,/Invoke-RestMethod -Method GET/);
  assert.doesNotMatch(script,/gcloud\.cmd run (?:deploy|services update-traffic)/);
  assert.doesNotMatch(script,/Invoke-RestMethod -Method (?:POST|PATCH|PUT|DELETE)/);
  assert.doesNotMatch(script,/gcloud\.cmd (?:firestore|scheduler jobs update|run jobs execute)/);
});
test('no raw URLs, email addresses or OAuth credentials appear in console output',()=>{
  assert.match(script,/function Endpoint\(/);
  assert.match(script,/\.AbsolutePath/);
  assert.doesNotMatch(script,/Write-Host\s+\$token\b/);
  assert.doesNotMatch(script,/Write-Host\s+\$requestUrl\b/);
  assert.doesNotMatch(script,/Write-Host\s+\$raw\b/);
});
