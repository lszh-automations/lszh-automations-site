 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {nextMonth,monthEnd,monthlyInvoiceId}=require('../monthly-billing');
test('next full calendar month includes year boundaries and deliberately skips activation month even on day one',()=>{assert.equal(nextMonth('2026-10-27'),'2026-11');assert.equal(nextMonth('2026-10-01'),'2026-11');assert.equal(nextMonth('2026-12-31'),'2027-01');assert.equal(monthEnd('2028-02'),'2028-02-29');assert.equal(monthEnd('2100-02'),'2100-02-28');assert.throws(()=>nextMonth('2026-02-30'));assert.throws(()=>monthEnd('2026-13'));});
test('billing period identity is stable per exact offer, independent of invoice status or retries',()=>{assert.equal(monthlyInvoiceId('o1','2026-11'),monthlyInvoiceId('o1','2026-11'));assert.notEqual(monthlyInvoiceId('o1','2026-11'),monthlyInvoiceId('o2','2026-11'));assert.notEqual(monthlyInvoiceId('o1','2026-11'),monthlyInvoiceId('o1','2026-12'));});
