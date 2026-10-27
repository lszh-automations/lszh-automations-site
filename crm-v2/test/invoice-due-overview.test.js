'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const start=html.indexOf('function invoiceDueInfo(');
const end=html.indexOf('function dashboardStats(',start);
assert.ok(start>=0&&end>start,'due overview helpers present');
const ctx=vm.createContext({localDateKey:()=> '2026-10-24'});
vm.runInContext(html.slice(start,end),ctx,{timeout:2000});
const due=invoice=>ctx.invoiceDueInfo(invoice,'2026-10-24');
const totals=invoices=>ctx.invoiceDueTotals(invoices,'2026-10-24');
const sample=(props={})=>({
  number:'RE-2026',status:'Offen',dueDate:'2026-10-23',amountCHF:100, ...props
});

test('overdue recognizes yesterday, but today is due in next 7 days, not overdue',()=>{
  assert.equal(due(sample()).kind,'overdue');
  assert.equal(due(sample()).days,-1);
  assert.equal(due(sample({dueDate:'2026-10-24'})).kind,'soon');
  assert.equal(due(sample({dueDate:'2026-10-24'})).days,0);
  assert.equal(due(sample({dueDate:'2026-10-31'})).kind,'soon');
  assert.equal(due(sample({dueDate:'2026-11-01'})).kind,'open');
});
test('partial invoices contribute only the unpaid rest in integer Swiss rappen',()=>{
  const info=due(sample({status:'Teilbezahlt',amountCHF:199.95,
    paymentHistory:[{amountCHF:50.1},{amountCHF:0.05}]}));
  assert.equal(info.remaining,14980);
  const summary=totals([sample(),sample({status:'Teilbezahlt',amountCHF:199.95,
    paymentHistory:[{amountCHF:50.1},{amountCHF:0.05}]}),
    sample({dueDate:'2026-10-26',amountCHF:40.01})]);
  assert.equal(summary.overdueCount,2);
  assert.equal(summary.overdueCents,24980);
  assert.equal(summary.soonCount,1);
  assert.equal(summary.soonCents,4001);
});
test('voided payments are excluded while canceled and paid invoices never inflate collections',()=>{
  const partial=sample({status:'Teilbezahlt',
    paymentHistory:[{amountCHF:60,voidedAt:'2026-10-24T12:00:00Z'},{amountCHF:10}]});
  assert.equal(due(partial).remaining,9000);
  const summary=totals([partial,sample({status:'Bezahlt'}),sample({status:'Storniert'}),
    sample({status:'Entwurf'}),sample({paymentHistory:[{amountCHF:100}]})]);
  assert.equal(summary.overdueCount,1);
  assert.equal(summary.overdueCents,9000);
});
test('invalid dates are never described as overdue or due soon',()=>{
  assert.equal(due(sample({dueDate:''})).kind,'open');
  assert.equal(due(sample({dueDate:'2026-02-30'})).kind,'open');
  assert.equal(due(sample({dueDate:'2026/10/22'})).kind,'open');
});
test('due overview is only in invoice register with no automatic mail or payment actions',()=>{
  for(const id of ['invoiceDueOverview','invoiceDueOverdueCount','invoiceDueOverdueAmount',
    'invoiceDueSoonCount','invoiceDueFilter','invoiceReminderStatus']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  for(const option of ['overdue','soon','open']){
    assert.match(html,new RegExp('<option value="'+option+'">'));
  }
  assert.match(html,/invoiceDueFilter'\)\.addEventListener\('change'/);
  assert.match(html,/invoiceDueTotals\(invoices\)/);
  assert.match(html,/Das CRM versendet keine Mahnung automatisch/);
  assert.match(html,/Dies protokolliert nur den bereits erfolgten Versand/);
  assert.doesNotMatch(html,/setInterval\(.*invoiceReminder|setInterval\(.*recordInvoiceReminder/);
});
