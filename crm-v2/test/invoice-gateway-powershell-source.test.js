'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

// Structural fail-closed check complementing Windows PowerShell 5.1 ParseFile CI.
// A previous JS replacement expanded "$'" into the source suffix, duplicating
// the 3/4->4/4 send segment three times and leaving unterminated regex strings.
test('synthetic invoice PowerShell source contains one complete approved send path',()=>{
  const filename=path.join(__dirname,'..','..','scripts','test-crm-invoice-mail-gateway-once.ps1');
  const source=fs.readFileSync(filename,'utf8');
  const count=s=>source.split(s).length-1;
  assert.equal(count("Write-Host '3/4 One-time synthetic test approval'"),1);
  assert.equal(count("Write-Host '4/4 Send exactly one TEST_ONLY"),1);
  assert.equal(count("}finally{Pop-Location}"),1);
  assert.equal(count("secrets versions access $secretVersion"),1);
  assert.equal(count("Check 'Cannot securely read approved Make hook"),1);
  assert.equal(count("if($secretVersion -cnotmatch '^(latest|[1-9][0-9]*)$'){"),1);
  assert.equal(count("if($hook -cnotmatch '^https://hook[.]eu1[.]make[.]com/[A-Za-z0-9]+$'){"),1);
  assert.equal(count("if($consent -cne 'TEST MAIL SENDEN')"),1);
  assert.match(source,/\$hookEntry\.valueFrom\.secretKeyRef\.name -cne \$secretName/);
  assert.match(source,/\$testTo='lars\.schulthess@outlook\.com'/);
  assert.doesNotMatch(source,/function Var\b/i);
});
