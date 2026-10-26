'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'crm-v2/public/index.html'),'utf8');
const paths=[
  'scripts/prepare-crm-invoice-dunning-audit-live.ps1',
  'scripts/activate-crm-invoice-dunning-audit-live.ps1'
];
const markers=['invoice-reminder-record','Protokoll-ID:','Restbetrag bei Best'];

test('manual dunning audit checks use ASCII markers resilient to PowerShell 5.1 code pages',()=>{
  for(const marker of markers)assert.ok(html.includes(marker),'missing audit marker: '+marker);
  for(const name of paths){
    const source=fs.readFileSync(path.join(root,name),'utf8');
    const check=source.slice(source.indexOf('$auditDetail='),source.indexOf('if($expectUnlocked',source.indexOf('$auditDetail=')));
    assert.ok(check.length>80,name+' has no candidate proof');
    for(const marker of markers){
      assert.ok(check.includes("'"+marker+"'"),name+' does not check '+marker);
      assert.ok(Buffer.from(source,'utf8').toString('latin1').includes("'"+marker+"'"),
        name+' loses ASCII token '+marker+' when interpreted with Windows ANSI');
    }
    assert.doesNotMatch(check,/[^\x00-\x7F]/,
      name+' audit evidence check must not depend on UTF-8 accented characters');
  }
});
