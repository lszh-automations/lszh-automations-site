'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {renderInvoice}=require('../lib/invoice-pdf');
const debtor={name:'Beispielkunde AG',street:'Teststrasse',number:'7',postal:'5610',city:'Wohlen',country:'CH'};
test('node renderer makes exactly 2 PDF pages for CHF 0.00 non-payable sample', async()=>{
 const r=await renderInvoice({invoiceNumber:'TEST-001',amountCHF:'0.00',debtor,test:true});
 assert.equal(r.pdf.subarray(0,5).toString('latin1'),'%PDF-');
 assert.equal((r.pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,2);
 assert.match(r.reference,/^RF\d\d[A-Z0-9]+$/);
});
test('test PDFs reject real monetary amounts and invalid addresses',async()=>{
 await assert.rejects(()=>renderInvoice({invoiceNumber:'TEST-001',amountCHF:'999.00',debtor,test:true}),/invalid_amount/);
 await assert.rejects(()=>renderInvoice({invoiceNumber:'TEST-001',amountCHF:'0.00',debtor:{...debtor,postal:''},test:true}),/invalid_address_postal/);
});

test('scan preview with CHF 499.00 produces 2-page PDF without production issuance',async()=>{
 const r=await renderInvoice({invoiceNumber:'DEMO-QR-499-2026-001',amountCHF:'499.00',debtor,test:true,preview:true,description:'Demo without real obligation'});
 assert.equal(r.pdf.subarray(0,5).toString('latin1'),'%PDF-');
 assert.equal((r.pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,2);
 assert.match(r.reference,/^RF\d{2}LSZH[A-F0-9]{16}$/);
});
