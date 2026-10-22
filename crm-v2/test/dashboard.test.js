'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {seedData}=require('../local-preview');

const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
const begin=html.indexOf('function dashboardStats(records){');
const end=html.indexOf('\nfunction navigateTo(',begin);
assert.ok(begin>=0&&end>begin,'Expected isolated dashboard metrics function');
const stats=vm.runInNewContext(html.slice(begin,end)+'\ndashboardStats;');
test('Dashboard is the default CRM view and existing registers stay available',()=>{
  assert.match(html,/data-tab="dashboard" class="active"/);
  assert.match(html,/id="dashboardArea"/);
  assert.match(html,/id="recordsPanel" hidden/);
  assert.match(html,/tab:'dashboard'/);
  for(const route of ['leads','kunden','offerten','rechnungen','projekte'])
    assert.ok(html.includes('data-tab="'+route+'"'));
});
test('Dashboard derives attention counts and financial numbers from synthetic data',()=>{
  const result=stats(seedData());
  assert.equal(result.newLeads,1);
  assert.equal(result.openOffers,1);
  assert.equal(result.openOfferVolume,1200);
  assert.equal(result.openInvoices,0);
  assert.equal(result.openInvoiceAmount,0);
  assert.equal(result.activeProjects,1);
  assert.equal(result.paidAmount,0);
  assert.equal(result.acceptedMonthly,0);
  assert.equal(result.leadCount,2);
});
test('Dashboard separates open offers, contracted monthly values and paid invoices',()=>{
  const r=seedData();
  r.offerten.push({status:'Angenommen',oneTimeCHF:999,monthlyCHF:299});
  r.rechnungen.push({status:'Offen',amountCHF:400},{status:'Bezahlt',amountCHF:250});
  r.projekte.push({status:'Wartet auf Kunde'});
  r.leads.push({status:'In Prüfung'});
  const output=stats(r);
  assert.equal(output.openOfferVolume,1200,'Accepted offer is no longer open');
  assert.equal(output.acceptedMonthly,299);
  assert.equal(output.openInvoices,1);
  assert.equal(output.openInvoiceAmount,400);
  assert.equal(output.paidAmount,250);
  assert.equal(output.waitingProjects,1);
  assert.equal(output.activeProjects,2);
  assert.equal(output.leadCount,3);
});
test('Dashboard is robust with empty data and does not invent money',()=>{
  const output=stats({});
  assert.equal(output.newLeads,0);
  assert.equal(output.openOffers,0);
  assert.equal(output.openOfferVolume,0);
  assert.equal(output.paidAmount,0);
  assert.equal(output.leadCount,0);
});
