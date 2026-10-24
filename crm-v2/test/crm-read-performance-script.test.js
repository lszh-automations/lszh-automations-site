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

test('Windows gcloud.cmd receives a quote-free log filter and freshness duration',()=>{
  const begin=script.indexOf('function ReadRevisionLog(');
  const end=script.indexOf('  Check (',begin);
  assert.ok(begin>=0&&end>begin);
  const filter=script.slice(begin,end);
  assert.match(filter,/--freshness=\$\{Hours\}h/);
  assert.match(filter,/resource\.type=cloud_run_revision/);
  assert.match(filter,/resource\.labels\.revision_name=/);
  assert.match(filter,/httpRequest\.requestUrl:cockpit/);
  assert.doesNotMatch(filter,/timestamp[<>]=/);
  assert.doesNotMatch(filter,/(?:resource\.type|httpRequest\.requestUrl)[:=]"/);
  assert.ok(script.length<9000,'Telemetry script was unexpectedly duplicated');
});

test('Cloud Logging array entries are flattened and status fields validated before conversion',()=>{
  assert.match(script,/function AddLogEntries\(/);
  assert.match(script,/\$value -is \[System\.Array\]/);
  assert.match(script,/AddLogEntries \(ConvertFrom-Json -InputObject \$raw\) \$entries/);
  assert.match(script,/\[int\]::TryParse\(\[string\]\$request\.status/);
  assert.doesNotMatch(script,/\$entries=@\(ConvertFrom-Json/);
  assert.doesNotMatch(script,/\$status=\[int\]\$entry\.httpRequest\.status/);
});
