'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {renderInvoice}=require('../lib/invoice-pdf');
(async()=>{
  const debtor={name:'Beispielkunde AG',street:'Teststrasse',number:'7',postal:'5610',city:'Wohlen',country:'CH'};
  const result=await renderInvoice({
    invoiceNumber:'TEST-QR-2026-001',amountCHF:'0.00',test:true,
    invoiceDate:'14.10.2026',dueDate:'28.10.2026',
    description:'Technischer Test, keine Leistung und keine Forderung',
    debtor
  });
  const pdf=result.pdf;
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  assert.ok(pdf.length>2000);
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,2);
  fs.mkdirSync(path.join(__dirname,'../out'),{recursive:true});
  fs.writeFileSync(path.join(__dirname,'../out/LSZH_QR_Staging_Nicht_Zahlbar.pdf'),pdf);
  const expected=String(result.reference);
  assert.match(expected,/^RF\d{2}[A-Z0-9]{1,21}$/);
  console.log('QR-PDF SMOKE OK: 2 Seiten, '+pdf.length+' Bytes, SCOR='+expected);
})().catch(e=>{console.error(e);process.exitCode=1;});
