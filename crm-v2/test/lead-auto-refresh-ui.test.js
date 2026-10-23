'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
const inlineScripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(m=>m[1]).filter(Boolean);

test('CRM browser scripts are valid JavaScript',()=>{
  assert.ok(inlineScripts.length>0);
  for(const script of inlineScripts)new vm.Script(script);
});

test('CRM checks new website leads automatically without reloading or re-authenticating',()=>{
  assert.match(html,/LEAD_REFRESH_INTERVAL_MS=30000/);
  assert.match(html,/setInterval\(refreshLeads,LEAD_REFRESH_INTERVAL_MS\)/);
  assert.match(html,/addEventListener\('visibilitychange'/);
  assert.match(html,/addEventListener\('focus',refreshLeads\)/);
  assert.match(html,/id="refreshLeads"/);
  assert.match(html,/api\('\/api\/records\/leads'\)/);
});

test('automatic refresh skips editing, hidden browser tabs and expired logins',()=>{
  assert.match(html,/!state\.token\|\|document\.hidden\|\|document\.querySelector\('dialog\[open\]'\)/);
  assert.match(html,/if\(state\.token!==loginToken\)return/);
  assert.match(html,/err\.status===401/);
  assert.match(html,/google\.accounts\.id\.disableAutoSelect/);
  assert.doesNotMatch(html,/(localStorage|sessionStorage)\.setItem\([^\n]*(token|credential)/i);
});
