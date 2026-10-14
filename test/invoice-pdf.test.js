'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {renderInvoice,LAYOUT,printAmount}=require('../lib/invoice-pdf');
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

test('SIX print format: A4 lower-edge payment part, receipt and QR quiet zone',()=>{
 assert.equal(LAYOUT.slipTop+LAYOUT.slipHeight,297);
 assert.equal(LAYOUT.receiptWidth+LAYOUT.paymentWidth,210);
 assert.equal(LAYOUT.qrSize,46);
 assert.equal(LAYOUT.qrQuietZone,5);
 assert.ok(LAYOUT.qrX-LAYOUT.qrQuietZone>=LAYOUT.receiptWidth);
 assert.ok(LAYOUT.qrX+LAYOUT.qrSize+LAYOUT.qrQuietZone<=118);
 assert.equal(LAYOUT.receiptAcceptanceTop+LAYOUT.receiptAcceptanceHeight,297);
 assert.ok(LAYOUT.receiptAcceptanceHeight>=20);
 assert.ok(LAYOUT.receiptAmountStart+12<=LAYOUT.receiptAcceptanceTop);
});
test('visible amounts have blank thousands separator, encoded QR value stays ungrouped',()=>{
 assert.equal(printAmount('1250.00'),'1 250.00');
 assert.equal(printAmount('1000000.50'),'1 000 000.50');
 assert.equal(printAmount('0.00'),'0.00');
 assert.throws(()=>printAmount('1,250.00'),/invalid_visible_amount/);
});
test('overlong debtor details fail closed instead of spilling across the payment-part margin',async()=>{
 const tooLong={...debtor,name:'Ein Ungewoehnlich Langer Gesellschaftsname Der Den Zahlteil Deutlich Ueberschreitet GmbH'};
 await assert.rejects(()=>renderInvoice({invoiceNumber:'PREVIEW-TEST',amountCHF:'499.00',debtor:tooLong,test:true,preview:true,variablePreview:true}),/invalid_layout_text_too_long/);
});
