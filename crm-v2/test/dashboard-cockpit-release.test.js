'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('cockpit release scripts are pinned to 00057 live, use unique 0%-tag and require manual approval',()=>{
  const prepare=read('scripts/prepare-crm-cockpit-live.ps1');
  const activate=read('scripts/activate-crm-cockpit-live.ps1');
  for(const code of [prepare,activate]){
    assert.match(code,/\$expectedLive='lszh-crm-v2-00057-qek'/);
    assert.match(code,/\$tag='crm-cockpit-qa'/);
    for(const required of [
      'dash-data-scope','dash-receivable-amount','dash-project-row',
      'function cockpitMetrics','CRM_INVOICE_MAIL_ENABLED','CRM_MAIL_ACTIVE_FROM'
    ])assert.ok(code.includes(required),required+' still checked');
    assert.match(code,/CheckMailScheduler|CheckScheduler/);
    assert.match(code,/CheckWeb|CheckFrontend/);
    assert.match(code,/Status|Http/);
  }
  assert.match(prepare,/--no-traffic/);
  assert.match(prepare,/if\(\(Live \$after\) -cne \$expectedLive\)/);
  assert.match(activate,/\$approval -cne 'LIVE COCKPIT'/);
  assert.match(activate,/if\(\$switched -and !\$verified\) \{ Rollback \}/);
  assert.match(activate,/--to-revisions=/);
});
