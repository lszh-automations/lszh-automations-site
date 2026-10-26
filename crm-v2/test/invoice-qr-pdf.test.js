'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {PDFDocument}=require('pdf-lib');
const {ibanCheck,prepareSwissQR}=require('../swiss-qr');
const {makeInvoicePdf}=require('../invoice-pdf');
const SYNTHETIC_DEMO_IBAN='CH9300762011623852957'; // official test-example format; never use for live
const customer={
 company:'TEST_ONLY Musterkunde AG',contactName:'Bea Muster',
 street:'Bahnhofstrasse 5',postalCode:'8000',city:'Zuerich',country:'Schweiz'
};
const invoice={
 number:'RE-1000',status:'Offen',invoiceDate:'2026-10-23',dueDate:'2026-11-23',
 description:'TEST_ONLY Automationsprojekt',amountCHF:499.9,
 items:[{title:'TEST_ONLY Einrichtung',qty:2,unitPriceCHF:249.95}]
};
test('Swiss QR enforces CH/LI IBAN checksum and rejects QR-IBAN with NON reference',()=>{
 assert.equal(ibanCheck('CH93 0076 2011 6238 5295 7'),SYNTHETIC_DEMO_IBAN);
 for(const iban of ['', 'CH9300762011623852956','DE89370400440532013000',
   'CH4431999123000889012']){
   assert.throws(()=>ibanCheck(iban),{status:422});
 }
});
test('Swiss QR emits exactly ordered mandatory data with structured address and NON',()=>{
 const result=prepareSwissQR(invoice,customer,{iban:SYNTHETIC_DEMO_IBAN});
 const lines=result.payload.split('\n');
 assert.equal(lines.length,31);
 assert.deepEqual(lines.slice(0,4),['SPC','0200','1',SYNTHETIC_DEMO_IBAN]);
 assert.deepEqual(lines.slice(4,11),['S','LSZH Invest GmbH','Rummelmatt','8','5610','Wohlen','CH']);
 assert.deepEqual(lines.slice(11,18),Array(7).fill(''));
 assert.deepEqual(lines.slice(18,27),['499.90','CHF','S','TEST_ONLY Musterkunde AG',
   'Bahnhofstrasse','5','8000','Zuerich','CH']);
 assert.deepEqual(lines.slice(27),['NON','','Rechnung RE-1000','EPD']);
 assert.equal(result.referenceType,'NON');
 assert.ok(Buffer.byteLength(result.payload,'utf8')<=997);
});
test('Swiss QR fails closed on unpaid drafts, mismatches, and incomplete debtor addresses',()=>{
 assert.throws(()=>prepareSwissQR({...invoice,status:'Entwurf'},customer,{iban:SYNTHETIC_DEMO_IBAN}),{status:422});
 assert.throws(()=>prepareSwissQR({...invoice,amountCHF:9},customer,{iban:SYNTHETIC_DEMO_IBAN}),{status:422});
 assert.throws(()=>prepareSwissQR(invoice,{...customer,street:'Bahnhofstrasse'},{iban:SYNTHETIC_DEMO_IBAN}),{status:422});
 assert.throws(()=>prepareSwissQR(invoice,customer,{}),{status:422});
});
test('Invoice generator builds an A4 PDF without external calls or dispatch',async()=>{
 const bytes=await makeInvoicePdf(invoice,customer,null,{iban:SYNTHETIC_DEMO_IBAN});
 assert.ok(Buffer.isBuffer(bytes));
 assert.equal(bytes.subarray(0,5).toString('ascii'),'%PDF-');
 const document=await PDFDocument.load(bytes);
 assert.equal(document.getPageCount(),1);
 const page=document.getPage(0),size=page.getSize();
 assert.ok(Math.abs(size.width-595.2756)<.05);
 assert.ok(Math.abs(size.height-841.8898)<.05);
});
test('Long invoices paginate while keeping a single final QR payment slip',async()=>{
 const lines=Array.from({length:60},(_,i)=>({
   title:'TEST_ONLY Position '+(i+1)+' Einrichtung verschiedener Automationsprozesse',
   qty:1,unitPriceCHF:2
 }));
 const bytes=await makeInvoicePdf({...invoice,items:lines,amountCHF:120},customer,null,
   {iban:SYNTHETIC_DEMO_IBAN});
 const document=await PDFDocument.load(bytes);
 assert.ok(document.getPageCount()>=2);
});
