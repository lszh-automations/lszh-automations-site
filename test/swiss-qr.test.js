'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {ACCOUNT,mod97,validIban,scor,buildSwissQr}=require('../lib/swiss-qr');
const debtor={name:'Beispielkunde AG',street:'Teststrasse',number:'7',postal:'5610',city:'Wohlen',country:'CH'};
test('Swiss IBAN and IID',()=>{
assert.ok(validIban(ACCOUNT));assert.equal(ACCOUNT.slice(4,9),'00761');
assert.equal(validIban('CH5100761648607672003'),false);
});
test('SCOR deterministic reference and ISO 11649 mod97',()=>{
const a=scor('SR-2026-001'),b=scor('SR-2026-002');
assert.notEqual(a,b);assert.equal(a,scor('SR-2026-001'));
assert.match(a,/^RF\d{2}LSZH[A-F0-9]{16}$/);
assert.ok(a.length<=25);assert.equal(mod97(a.slice(4)+a.slice(0,4)),1);
});
test('31 structured Swiss QR lines and SCOR',()=>{
const q=buildSwissQr({invoiceNumber:'SR-2026-001',amountCHF:'1250.00',debtor});
const l=q.payload.split('\n');
assert.equal(l.length,31);
assert.deepEqual(l.slice(0,5),['SPC','0200','1',ACCOUNT,'S']);
assert.ok(l.slice(11,18).every(x=>x===''));
assert.deepEqual(l.slice(18,22),['1250.00','CHF','S',debtor.name]);
assert.deepEqual(l.slice(27,29),['SCOR',q.reference]);
assert.equal(l[30],'EPD');
});
test('Non-payable tests are 0.00 with exact SIX warning',()=>{
const q=buildSwissQr({invoiceNumber:'TEST-001',amountCHF:'0.00',debtor,test:true});
assert.equal(q.payload.split('\n')[29],'NICHT ZUR ZAHLUNG VERWENDEN');
assert.equal(q.payload.split('\n')[18],'', 'SIX forbids 0.00 as encoded payment amount');
assert.equal(q.qrAmount,'');
assert.equal(q.amount,'0.00');
assert.throws(()=>buildSwissQr({invoiceNumber:'TEST-001',amountCHF:'1250.00',debtor,test:true}));
assert.throws(()=>buildSwissQr({invoiceNumber:'TEST-001',amountCHF:'0.00',debtor}));
});
test('Invalid debtor and invoice identifiers rejected',()=>{
assert.throws(()=>buildSwissQr({invoiceNumber:'SR 2026?',amountCHF:'1250.00',debtor}));
assert.throws(()=>buildSwissQr({invoiceNumber:'SR-2026-001',amountCHF:'1250.00',debtor:{...debtor,postal:''}}));
});
test('CHF 499 preview is fixed and scannable, with non-payable warning',()=>{
 const q=buildSwissQr({invoiceNumber:'DEMO-QR-499-2026-001',amountCHF:'499.00',debtor,test:true,preview:true});
 const l=q.payload.split('\\n');
 assert.equal(l.length,31);
 assert.equal(l[18],'499.00');
 assert.equal(l[19],'CHF');
 assert.equal(l[27],'SCOR');
 assert.equal(l[28],q.reference);
 assert.match(l[29],/NICHT BEZAHLEN/);
 assert.equal(q.preview,true);
 assert.throws(()=>buildSwissQr({invoiceNumber:'DEMO-001',amountCHF:'499.00',debtor,test:true}));
 assert.throws(()=>buildSwissQr({invoiceNumber:'DEMO-001',amountCHF:'499.01',debtor,test:true,preview:true}));
 assert.throws(()=>buildSwissQr({invoiceNumber:'DEMO-001',amountCHF:'499.00',debtor,test:false,preview:true}));
});
