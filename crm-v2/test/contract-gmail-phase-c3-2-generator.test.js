'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {digest}=require('../offer-contract-package');
const ROOT=path.resolve(__dirname,'../..');
const GENERATOR=path.join(ROOT,'crm-v2/scripts/generate-contract-c3-2-blocked-make-sample.cjs');
const PS=path.join(ROOT,'scripts/test-crm-contract-c3-2-make-blocked.ps1');
function generate(avv){
  const r=spawnSync(process.execPath,[GENERATOR,avv],{
    encoding:'utf8',timeout:15000,maxBuffer:500000
  });
  return r;
}
test('C3.2 no-AVV schema fixture contains two real TEST_ONLY PDF bytes and hard mail stop',()=>{
  const r=generate('no');
  assert.equal(r.status,0,r.stderr);
  const p=JSON.parse(r.stdout);
  assert.equal(p.kind,'lszh_contract_gmail_c3_2_blocked');
  assert.equal(p.sendMode,'blocked_preview_only');
  assert.equal(p.neverSend,true);
  assert.equal(p.to,'test-approved@example.com');
  assert.equal(p.attachmentCount,2);
  assert.deepEqual(p.attachments.map(a=>a.kind),['offer','terms']);
  assert.deepEqual(p.emailHeaders.map(h=>h.key),
    ['X-LSZH-Contract-Event','X-LSZH-Package-SHA256']);
  for(const a of p.attachments){
    const bytes=Buffer.from(a.contentBase64,'base64');
    assert.equal(bytes.length,a.bytes);
    assert.equal(digest(bytes),a.sha256);
    assert.equal(bytes.subarray(0,5).toString('ascii'),'%PDF-');
  }
});
test('C3.2 AVV=yes schema fixture includes 3 distinct PDF attachments',()=>{
  const r=generate('yes');
  assert.equal(r.status,0,r.stderr);
  const p=JSON.parse(r.stdout);
  assert.equal(p.attachmentCount,3);
  assert.deepEqual(p.attachments.map(a=>a.kind),['offer','terms','avv']);
  assert.equal(new Set(p.attachments.map(a=>a.sha256)).size,3);
  assert.match(p.subject,/TEST_ONLY.*KEIN VERSAND/);
});
test('C3.2 fixture refuses unknown AVV values without producing a payload',()=>{
  for(const value of ['review','true','production','']){
    const r=generate(value);
    assert.notEqual(r.status,0);
    assert.equal(r.stdout,'');
    assert.doesNotMatch(r.stderr,/https:\/\/hook/);
  }
});
test('C3.2 PowerShell harness never exposes hook and cannot interpret 200 as sent',()=>{
  const code=fs.readFileSync(PS,'utf8');
  assert.match(code,/Read-Host 'C3\.2 STAGING webhook URL \(hidden\)' -AsSecureString/);
  assert.match(code,/ValidateSet\('Learn','Smoke'\)/);
  assert.match(code,/if\(\$status -ne 423\)/);
  assert.match(code,/expectedHookSha256='[a-f0-9]{64}'/);
  assert.match(code,/Webhook does not match Make scenario 8166714/);
  // Regression for 25.10.2026: a malformed patch previously duplicated
  // the HTTP POST and spliced the URL guard into the middle of a regex.
  // Enforce one and only one preflight, generator and network request.
  const exactlyOnce=[
    "if($hook -cnotmatch ",
    "$expectedHookSha256=",
    "if($hookSha256 -cne $expectedHookSha256)",
    "$json=& node.exe $generator $Avv",
    "$client.PostAsync($hook,$postBody)",
    "if($Mode -eq 'Learn'){",
    "Read Make history to independently verify iterator 2/3 and aggregator 1."
  ];
  for(const needle of exactlyOnce)
    assert.equal(code.split(needle).length-1,1,
      'must occur exactly once: '+needle);
  assert.ok(
    code.indexOf("if($hook -cnotmatch ") <
    code.indexOf("if($hookSha256 -cne $expectedHookSha256)") &&
    code.indexOf("if($hookSha256 -cne $expectedHookSha256)") <
    code.indexOf("$json=& node.exe $generator $Avv") &&
    code.indexOf("$json=& node.exe $generator $Avv") <
    code.indexOf("$client.PostAsync($hook,$postBody)"),
    'exact hook pinning and synthetic validation must run before one HTTP POST');
  assert.match(code,/STAGING_C3_2_SEND_NOT_AUTHORISED/);
  assert.match(code,/C3\.2 Make denial VERIFIED: HTTP 423/);
  assert.match(code,/No retry|do not retry/i);
  assert.doesNotMatch(code,/Write-Host\s*\$hook\b/);
  assert.doesNotMatch(code,/gcloud\.cmd|gmail\.send|google-email:sendAnEmail|firebase deploy/);
});


test('C3.2 blocked webhook PowerShell script passes Windows PowerShell 5.1 parser offline',()=>{
  const source=fs.readFileSync(PS,'utf8');
  // Catch the precise malformed if(... )throw pattern even on Linux CI.
  assert.doesNotMatch(source,/\bif\s*\(\$status\s+-ne\s+200\)\s*throw\b/i);
  assert.match(source,/if\s*\(\$status\s+-ne\s+200\)\s*\{\s*throw\b/i);
  if(process.platform!=='win32')return;
  const escapedPath=PS.replace(/'/g,"''");
  const parseCommand=[
    "$tokens=$null;$errors=$null;",
    "[System.Management.Automation.Language.Parser]::ParseFile('"+escapedPath+"',",
    "[ref]$tokens,[ref]$errors)|Out-Null;",
    "if($errors.Count -gt 0){",
    "$errors|ForEach-Object {Write-Error $_.Message};exit 1",
    "};Write-Output 'POWERSHELL_C32_PARSER_PASS'"
  ].join('');
  const result=spawnSync('powershell.exe',[
    '-NoProfile','-NonInteractive','-Command',parseCommand
  ],{encoding:'utf8',timeout:12000,maxBuffer:300000});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/POWERSHELL_C32_PARSER_PASS/);
});


test('C3.2 wrong Make webhook is rejected BEFORE any HTTP and cannot point to production',()=>{
  const code=fs.readFileSync(PS,'utf8');
  assert.match(code,/SHA256\]::Create\(\)/);
  assert.match(code,/if\(\$hookSha256 -cne \$expectedHookSha256\)/);
  if(process.platform!=='win32')return;
  // Deliberately fake host-valid URL: verified C3.2 SHA pin must reject this
  // before any network call, even when no manual webhook prompt occurs.
  const result=spawnSync('powershell.exe',[
    '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass',
    '-File',PS,'-Mode','Learn','-Avv','no'
  ],{
    env:{...process.env,LSZH_CONTRACT_C32_STAGING_WEBHOOK:'https://hook.eu1.make.com/notrealhook'},
    encoding:'utf8',timeout:12000,maxBuffer:300000
  });
  assert.notEqual(result.status,0);
  assert.match(result.stdout+result.stderr,/Webhook does not match Make scenario 8166714/);
  assert.doesNotMatch(result.stdout+result.stderr,/https:\/\/hook/);
});
