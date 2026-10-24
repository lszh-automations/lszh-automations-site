'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {cents,validDay,effectiveInvoiceStatus,outstandingCents,normalizePayment}=require('../invoice-accounting');

test('invoice settlement UI inline JavaScript parses and never forces hidden payments on invoice draft save',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  const match=html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match,'CRM inline JavaScript found');
  assert.doesNotThrow(()=>new vm.Script(match[1],{filename:'crm-v2/public/index.html'}));
  for(const id of ['invoicePaymentsPanel','invoicePaymentAmount','invoicePaymentDate',
    'invoiceRecordPayment','invoiceReminderPanel','invoiceReminderText','invoiceLogReminder']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.doesNotMatch(html,/id="invoicePaymentAmount"[^>]*\brequired\b/);
  assert.doesNotMatch(html,/id="invoicePaymentDate"[^>]*\brequired\b/);
  assert.doesNotMatch(html,/id="invoiceMarkPaid"/,'legacy direct paid button must be absent');
});
test('CHF amount, due status and overdue partial balance use exact rappen and Swiss dates',()=>{
  assert.equal(cents('12.30'),1230);
  assert.equal(cents(12.3),1230);
  assert.equal(validDay('2026-02-30'),false);
  assert.equal(validDay('2028-02-29'),true);
  const partial={status:'Teilbezahlt',dueDate:'2026-10-01',amountCHF:149.95,
    paymentHistory:[{amountCHF:50}]};
  assert.equal(outstandingCents(partial),9995);
  assert.equal(effectiveInvoiceStatus(partial,'2026-10-24'),'Überfällig');
  assert.equal(effectiveInvoiceStatus(partial,'2026-09-30'),'Teilbezahlt');
  assert.equal(effectiveInvoiceStatus({...partial,status:'Storniert'},'2026-10-24'),'Storniert');
  assert.throws(()=>normalizePayment({paymentId:'bad',amountCHF:'1.00',paidOn:'2026-10-01',
    method:'Bar',reference:''},'2026-10-24'));
});
