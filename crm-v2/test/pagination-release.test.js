'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const source=x=>fs.readFileSync(path.join(root,x),'utf8');
test('50-row pagination has a protected summary and no data mutation in its statistics',()=>{
 const api=source('crm-v2/server.js');
 const browser=source('crm-v2/public/index.html');
 const store=source('crm-v2/cloud-records.js');
 assert.match(api,/pathname==='\/api\/cockpit\/summary'/);
 assert.match(api,/if\(!user\)return reply\(res,401/);
 assert.match(api,/store\.listPage\(table/);
 assert.match(store,/query\.startAfter\(last\)/);
 assert.match(store,/Math\.max\(Number\(limit\)\|\|200,1\),200/); // untouched legacy clients
 assert.match(browser,/pageSize=50/);
 assert.match(browser,/function renderPageMore\(/);
 assert.match(browser,/state\.summary\?/);
});
test('release scripts are pinned to 00059, 0 percent and human release approval',()=>{
 const prep=source('scripts/prepare-crm-pagination-live.ps1');
 const activate=source('scripts/activate-crm-pagination-live.ps1');
 for(const src of [prep,activate]){
  assert.match(src,/\$expectedLive='lszh-crm-v2-00059-puj'/);
  assert.match(src,/\$tag='crm-pagination-qa'/);
  assert.match(src,/serverseitige Auswertung aller CRM-Register/);
  assert.match(src,/api\/cockpit\/summary/);
 }
 assert.match(prep,/--no-traffic/);
 assert.match(activate,/LIVE PAGINATION/);
 assert.match(activate,/if\(\$switched -and !\$verified\) \{ Rollback \}/);
});
