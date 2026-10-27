'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const begin=html.indexOf('function invoiceDueInfo(');
const end=html.indexOf('function renderInvoiceDueOverview(',begin);
assert.ok(begin>=0&&end>begin,'pure cockpit/due helpers found');
const ctx=vm.createContext({localDateKey:()=>'2026-10-24'});
vm.runInContext(html.slice(begin,end),ctx,{timeout:3000});
const metrics=data=>ctx.cockpitMetrics(data,'2026-10-24');
const invoice=(status,dueDate,amountCHF,paymentHistory)=>({status,dueDate,amountCHF,paymentHistory});

test('cockpit separates actually booked payments from legacy paid flags and open balances',()=>{
  const dataset={rechnungen:[
    invoice('Teilbezahlt','2026-10-20',199.95,[{amountCHF:50.10},{amountCHF:20.01,voidedAt:'2026-10-24T10:00:00Z'}]),
    invoice('Offen','2026-10-31',44.01,[]),
    invoice('Bezahlt','2026-10-03',999,[]), // old paid flag WITHOUT transaction
    invoice('Bezahlt','2026-10-03',88.10,[{amountCHF:88.10}]),
    invoice('Storniert','2026-10-10',1000,[])
  ]};
  const a=metrics(dataset);
  assert.equal(a.bookedCents,13820);
  assert.equal(a.openCents,19386);
  assert.equal(a.overdueCents,14985);
  assert.equal(a.soonCents,4401);
  assert.equal(a.overdueCount,1);
  assert.equal(a.soonCount,1);
  assert.equal(a.openCount,2);
  assert.equal(a.legacyPaidCount,1);
  assert.equal(a.receivables.length,2);
  assert.equal(a.receivables[0].invoice.status,'Teilbezahlt');
  assert.equal(a.receivables[1].invoice.dueDate,'2026-10-31');
  assert.equal(dataset.rechnungen[0].paymentHistory[1].voidedAt,'2026-10-24T10:00:00Z');
});
test('cockpit reports accepted recurring contract values separately from open one-time offers',()=>{
  const a=metrics({offerten:[
    {status:'Entwurf',oneTimeCHF:50.05,monthlyCHF:1000},
    {status:'Bereit',oneTimeCHF:49.95},
    {status:'Versendet',oneTimeCHF:100.10,monthlyCHF:60},
    {status:'Angenommen',oneTimeCHF:5000,monthlyCHF:499.99},
    {status:'Abgelehnt',oneTimeCHF:9000,monthlyCHF:8000}
  ]});
  assert.equal(a.openOfferCount,3);
  assert.equal(a.openOfferCents,20010);
  assert.equal(a.acceptedMonthlyCents,49999);
  assert.equal(a.bookedCents,0);
});
test('cockpit project status and task totals are independent from money and never mutate inputs',()=>{
  const data={projekte:[
    {status:'Geplant',dueDate:'2026-10-31',tasks:[{done:false}]},
    {status:'In Arbeit',dueDate:'2026-10-23',tasks:[{done:true},{done:false}]},
    {status:'Wartet auf Kunde',dueDate:'2026-10-10',tasks:[{done:true}]},
    {status:'Abgeschlossen',dueDate:'2026-10-01',tasks:[{done:true}]}
  ]};
  const a=metrics(data);
  assert.equal(a.projectActive,3);
  assert.equal(a.projectWaiting,1);
  assert.equal(a.projectDone,1);
  assert.equal(a.projectOverdue,2);
  assert.equal(a.tasksDone,3);
  assert.equal(a.tasksTotal,5);
  assert.equal(data.projekte.length,4);
});
test('receivables are ordered by urgency and original invoice objects are not sorted in place',()=>{
  const future=invoice('Offen','2026-11-01',1);
  const today=invoice('Offen','2026-10-24',2);
  const past=invoice('Offen','2026-10-12',3);
  const unknown=invoice('Offen','',4);
  const invoices=[future,today,unknown,past];
  const a=metrics({rechnungen:invoices});
  assert.deepEqual(Array.from(a.receivables,x=>x.invoice.amountCHF),[3,2,1,4]);
  assert.deepEqual(invoices,[future,today,unknown,past]);
  assert.equal(a.overdueCount,1);
  assert.equal(a.soonCount,1);
  assert.equal(a.openCount,4);
});
test('personal dashboard uses complete server tasks and no metrics or workflow groups',()=>{
  const renderer=html.slice(html.indexOf('function renderDashboard(){'),html.indexOf('function projectIsOverdue('));
  assert.match(renderer,/summary\.personalTasks/);
  assert.match(renderer,/Aktuell ist nichts zu erledigen/);
  assert.match(renderer,/Aufgaben konnten nicht geladen werden/);
  assert.doesNotMatch(renderer,/reportFilter|reportContext|processGroups|openProcesses|Kennzahlen|Finanzen|Monatsrückblick/);
  assert.doesNotMatch(renderer,/\bPOST\b|\bPATCH\b|\bapi\s*\(/);
});
