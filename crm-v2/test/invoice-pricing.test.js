'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {invoiceTotals,cleanInvoiceItems,invoiceLegacyItems,isInvoiceLocked}=require('../invoice-pricing');
const {renderInvoicePreview}=require('../invoice-preview');

test('line items calculate CHF with safe rounding',()=>{
  const result=invoiceTotals([
    {title:'Einrichtung',qty:2,unitPriceCHF:149.95},
    {title:'Support',qty:1.5,unitPriceCHF:100.10}
  ]);
  assert.equal(result.amountCHF,449.05);
  assert.equal(result.items.length,2);
});
test('wrong quantities, money or excessive items are rejected',()=>{
  const row={title:'Test',qty:1,unitPriceCHF:5.25};
  for(const invalid of [
    {...row,title:''},{...row,qty:0},{...row,qty:-1},
    {...row,qty:1.0001},{...row,unitPriceCHF:-2},
    {...row,unitPriceCHF:1.005},{...row,unitPriceCHF:'5.25'}
  ])assert.throws(()=>cleanInvoiceItems([invalid]));
  assert.throws(()=>cleanInvoiceItems(Array.from({length:61},()=>({...row}))));
});
test('legacy invoices without line items retain their total',()=>{
  const lines=invoiceLegacyItems({description:'Bereits verbuchte Leistung',amountCHF:199});
  assert.equal(lines.length,1);
  assert.equal(invoiceTotals(lines).amountCHF,199);
  assert.deepEqual(invoiceLegacyItems({items:[]}),[]);
});
test('paid and cancelled invoice data is recognized as locked',()=>{
  assert.equal(isInvoiceLocked({status:'Offen'}),false);
  assert.equal(isInvoiceLocked({status:'Bezahlt'}),true);
  assert.equal(isInvoiceLocked({status:'Storniert'}),true);
});
test('print preview escapes customer supplied HTML and does not invent payment info',()=>{
  const html=renderInvoicePreview({
    number:'RE-1010',status:'Offen',invoiceDate:'2026-10-23',dueDate:'2026-11-07',
    description:'IT & Prozesse',items:[{title:'Installation <script>bad()</script>',qty:2,unitPriceCHF:100}]
  },{
    company:'Kunde <AG> & Co',contactName:'Anna Muster',
    street:'Testweg 1',postalCode:'5610',city:'Wohlen',country:'Schweiz'
  },{title:'CRM Integration'});
  assert.match(html,/size:A4/);
  assert.match(html,/RE-1010/);
  assert.match(html,/CHF 200.00/);
  assert.match(html,/Kunde &lt;AG&gt; &amp; Co/);
  assert.match(html,/Installation &lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<script>bad\(\)<\/script>/);
  assert.match(html,/07\.11\.2026/);
  assert.match(html,/KEINE GÜLTIGE ZAHLUNGSANWEISUNG/);
  assert.match(html,/Swiss-QR-Zahlteil sind noch nicht eingerichtet/);
});
