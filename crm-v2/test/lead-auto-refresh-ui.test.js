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

test('website lead age labels show relative time and refresh every minute',()=>{
  const inline=inlineScripts.find(s=>s.includes('function leadAge('));
  assert.ok(inline);
  const source=inline.slice(inline.indexOf('function leadAge('),inline.indexOf('function refreshLeadAges(){'));
  const leadAge=vm.runInNewContext(source+'\nleadAge',{Date,Math,Number});
  const anchor='2026-10-23T12:00:00Z';
  const now=Date.parse(anchor);
  assert.equal(leadAge(anchor,now),'gerade eben');
  assert.equal(leadAge(anchor,now+3*60000),'vor 3 Min.');
  assert.equal(leadAge(anchor,now+60*60000),'vor 1 Std.');
  assert.equal(leadAge(anchor,now+2*24*3600000),'vor 2 Tagen');
  assert.equal(leadAge(anchor,now-60000),'gerade eben');
  assert.equal(leadAge('not-a-date',now),'–');
  assert.match(html,/setInterval\(refreshLeadAges,60000\)/);
  assert.match(html,/data-lead-created-at/);
});
test('delete X is only available on fresh leads and uses the authenticated DELETE endpoint',()=>{
  assert.match(html,/\['createdAt','Eingegangen'\]/);
  assert.match(html,/state\.tab==='leads'&&rec\.status==='Neu'/);
  assert.match(html,/remove\.setAttribute\('aria-label','Lead '/);
  assert.match(html,/window\.confirm\(/);
  assert.match(html,/method:'DELETE'/);
  assert.match(html,/await loadAll\(\)/);
});
test('Neu option is locked in both lead detail and edit form for already handled leads',()=>{
  assert.match(html,/if\(value==='Neu'&&lead\.status!=='Neu'\)option\.disabled=true/);
  assert.match(html,/s!=='Neu'\|\|!state\.editing\|\|state\.editing\.status==='Neu'/);
});
