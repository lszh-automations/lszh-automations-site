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

test('lead traffic light uses exact eight-hour boundaries and stays red after 24 hours',()=>{
  const inline=inlineScripts.find(s=>s.includes('function leadUrgency('));
  assert.ok(inline);
  const source=inline.slice(inline.indexOf('function leadUrgency('),inline.indexOf('async function deleteNewLead('));
  const {leadUrgency}=vm.runInNewContext(source+'\n({leadUrgency})',{Date,Math,Number});
  const created='2026-10-23T08:00:00Z';
  const at=Date.parse(created);
  const h=60*60*1000;
  assert.equal(leadUrgency(created,at),'green');
  assert.equal(leadUrgency(created,at+8*h-1),'green');
  assert.equal(leadUrgency(created,at+8*h),'orange');
  assert.equal(leadUrgency(created,at+16*h-1),'orange');
  assert.equal(leadUrgency(created,at+16*h),'red');
  assert.equal(leadUrgency(created,at+24*h),'red');
  assert.equal(leadUrgency(created,at+72*h),'red');
  assert.equal(leadUrgency(created,at-h),'green');
  assert.equal(leadUrgency('invalid',at),'');
});
test('traffic-light style refresh updates class and accessible text without backend calls',()=>{
  const inline=inlineScripts.find(s=>s.includes('function leadUrgency('));
  const source=inline.slice(inline.indexOf('function leadAge('),inline.indexOf('async function deleteNewLead('));
  const at=Date.parse('2026-10-23T08:00:00Z');
  let nowMs=at+3*60000;
  class FakeDate extends Date{static now(){return nowMs;}}
  const attrs={};
  const node={dataset:{leadCreatedAt:'2026-10-23T08:00:00Z'},
    className:'lead-age',textContent:'',
    setAttribute(key,value){attrs[key]=value;}};
  const ctx={
    Date:FakeDate,Math,Number,
    document:{querySelectorAll(selector){
      assert.equal(selector,'[data-lead-created-at]');
      return [node];
    }}
  };
  const {refreshLeadAges}=vm.runInNewContext(source+'\n({refreshLeadAges})',ctx);
  refreshLeadAges();
  assert.equal(node.className,'lead-age lead-age-green');
  assert.equal(node.textContent,'vor 3 Min.');
  assert.match(attrs['aria-label'],/Grün/);
  nowMs=at+8*3600000;
  refreshLeadAges();
  assert.equal(node.className,'lead-age lead-age-orange');
  assert.equal(node.textContent,'vor 8 Std.');
  assert.match(attrs['aria-label'],/Orange/);
  nowMs=at+16*3600000;
  refreshLeadAges();
  assert.equal(node.className,'lead-age lead-age-red');
  assert.equal(node.textContent,'vor 16 Std.');
  assert.match(attrs['aria-label'],/Rot/);
  nowMs=at+25*3600000;
  refreshLeadAges();
  assert.equal(node.className,'lead-age lead-age-red');
  assert.equal(node.textContent,'vor 1 Tag');
  assert.match(html,/setInterval\(refreshLeadAges,60000\)/);
  for(const color of ['green','orange','red']){
    assert.match(html,new RegExp('\\.lead-age-'+color+'\\{'));
  }
  assert.match(html,/const urgency=leadUrgency\(rec\.createdAt\)/);
  assert.match(html,/age\.title=new Intl\.DateTimeFormat/);
});

test('due follow-ups use local calendar date and only actionable lead stages',()=>{
  const inline=inlineScripts.find(s=>s.includes('function dueLeadFollowUps('));
  assert.ok(inline);
  const start=inline.indexOf('function localDateKey(');
  const end=inline.indexOf('function leadDate(',start);
  const source=inline.slice(start,end);
  const {dueLeadFollowUps}=vm.runInNewContext(source+'\n({dueLeadFollowUps})',{Date,String});
  const leads=[
    {id:'tomorrow',status:'Kontaktiert',nextAction:'Rückruf',followUpDate:'2026-10-24'},
    {id:'today',status:'Kontaktiert',nextAction:'Angebot besprechen',followUpDate:'2026-10-23'},
    {id:'yesterday',status:'Qualifiziert',nextAction:'Demo',followUpDate:'2026-10-22'},
    {id:'won',status:'Gewonnen',nextAction:'Kickoff',followUpDate:'2026-10-23'},
    {id:'lost',status:'Verloren',nextAction:'Rückruf',followUpDate:'2026-10-22'},
    {id:'empty',status:'Neu',nextAction:'',followUpDate:'2026-10-20'}
  ];
  assert.deepEqual(Array.from(dueLeadFollowUps(leads,'2026-10-23'),lead=>lead.id),
    ['yesterday','today']);
  assert.deepEqual(Array.from(dueLeadFollowUps([],'2026-10-23')),[]);
  assert.match(html,/dashboardPanel\('Fällige Wiedervorlagen'/);
  assert.match(html,/navigateTo\('leads',lead\)/);
});
test('lead dialog adds contact history, follow-up actions and qualification',()=>{
  assert.match(html,/function appendContactSection\(body,lead\)/);
  assert.match(html,/function appendFollowUpSection\(body,lead\)/);
  assert.match(html,/function appendQualificationSection\(body,lead\)/);
  assert.match(html,/appendContactSection\(body,lead\)/);
  assert.match(html,/appendFollowUpSection\(body,lead\)/);
  assert.match(html,/appendQualificationSection\(body,lead\)/);
  assert.match(html,/method:'POST',body:JSON\.stringify\(\{\s*channel:/);
  assert.match(html,/method:'PATCH',body:JSON\.stringify\(\{nextAction:'',followUpDate:''\}\)/);
  assert.match(html,/Qualifizierung speichern/);
  assert.match(html,/await reloadOpenLead\(lead\.id\)/);
  assert.match(html,/history\.length>20/);
  assert.doesNotMatch(html,/localStorage\.setItem\(/);
});
