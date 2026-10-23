'use strict';
// CI ONLY: synthetic QR invoice that must never be sent or used for payment.
const fs=require('node:fs');
const path=require('node:path');
const {makeInvoicePdf}=require('../invoice-pdf');
async function main(){
  const invoice={number:'RE-1000',status:'Offen',description:'TEST_ONLY Rechnungsbeispiel',
    invoiceDate:'2026-10-23',dueDate:'2026-11-23',amountCHF:499.90,
    items:[{title:'TEST_ONLY Automationssetup',qty:2,unitPriceCHF:249.95}]};
  const customer={company:'TEST_ONLY Musterfirma AG',contactName:'Max Beispiel',
    street:'Musterstrasse 5',postalCode:'8000',city:'Zuerich',country:'CH'};
  const bytes=await makeInvoicePdf(invoice,customer,null,{iban:'CH9300762011623852957'});
  const dest=path.join(__dirname,'..','out');
  fs.mkdirSync(dest,{recursive:true});
  const file=path.join(dest,'TEST_ONLY_LSZH_Swiss_QR.pdf');
  fs.writeFileSync(file,bytes,{flag:'w'});
  console.log('TEST_ONLY PDF generated, bytes='+bytes.length);
  const longItems=Array.from({length:60},(_,i)=>({
    title:'TEST_ONLY Leistung '+String(i+1).padStart(2,'0')+' Automationsberatung und Schulung',
    qty:1,unitPriceCHF:2
  }));
  const longPdf=await makeInvoicePdf({...invoice,description:'TEST_ONLY Mehrseitige Rechnungspruefung',
    amountCHF:120,items:longItems},customer,null,{iban:'CH9300762011623852957'});
  fs.writeFileSync(path.join(dest,'TEST_ONLY_LSZH_Swiss_QR_LONG.pdf'),longPdf,{flag:'w'});
  console.log('TEST_ONLY LONG PDF generated, bytes='+longPdf.length);
}
main().catch(e=>{console.error('TEST_ONLY PDF FAIL:',e.message);process.exitCode=1;});
