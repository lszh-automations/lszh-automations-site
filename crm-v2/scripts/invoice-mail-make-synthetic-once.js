'use strict';
// Manual, one-shot Make/Gmail smoke test. No Firestore, Cloud Run or real bank data.
// Run ONLY through scripts/test-crm-invoice-mail-gateway-once.ps1 after approval.
// The test PDF uses the publicly documented synthetic SIX-example IBAN.
// Never submit this sample PDF for payment.
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {makeInvoicePdf}=require('../invoice-pdf');
const {renderInvoiceEmail}=require('../invoice-mail');

const TEST_TO='lars.schulthess@outlook.com';
const DEMO_IBAN='CH9300762011623852957';
const TEST_INVOICE='RE-9099999';
const TEST_FILENAME='TEST_ONLY_LSZH_Rechnung_RE-9099999.pdf';
const makeHook=String(process.env.LSZH_TEST_MAKE_WEBHOOK||'');
const approval=process.env.LSZH_TEST_MAIL_APPROVED;

async function main(){
  if(approval!=='TEST MAIL SENDEN')
    throw Error('No manual test-mail approval. Nothing sent.');
  if(!/^https:\/\/hook\.eu1\.make\.com\/[A-Za-z0-9]+$/.test(makeHook))
    throw Error('Missing configured LSZH Make webhook. Nothing sent.');
  const invoice={
    number:TEST_INVOICE,status:'Offen',
    description:'TEST_ONLY – synthetische Rechnung. Nicht bezahlen.',
    invoiceDate:'2026-10-24',dueDate:'2026-11-24',
    amountCHF:79.90,
    items:[{title:'TEST_ONLY synthetische Automationsleistung – nicht bezahlen',qty:1,unitPriceCHF:79.90}]
  };
  const customer={
    company:'TEST_ONLY Musterfirma AG',
    contactName:'Max Beispiel',
    email:TEST_TO,
    street:'Musterstrasse 5',postalCode:'8000',city:'Zuerich',country:'CH'
  };
  // Complete PDF and email BEFORE creating the no-retry marker and calling Make.
  const pdf=await makeInvoicePdf(invoice,customer,null,{iban:DEMO_IBAN});
  if(!Buffer.isBuffer(pdf)||pdf.length<500||pdf.length>700000||
     !pdf.subarray(0,8).toString().startsWith('%PDF-'))
    throw Error('Synthetic PDF invalid, nothing sent');
  const mail=renderInvoiceEmail(invoice,customer);
  const eventId='invoice_send_TEST_ONLY_'+randomUUID();
  const subject='[TEST_ONLY] '+mail.subject;
  const payload={
    kind:'invoice_send',sendMode:'test_only',eventId,
    invoiceId:'TEST_ONLY_NO_FIRESTORE',
    to:TEST_TO,subject,html:mail.html,
    pdfFilename:TEST_FILENAME,pdfBase64:pdf.toString('base64')
  };
  if(!payload.subject.startsWith('[TEST_ONLY] Ihre Rechnung Nr.')||
     payload.to!==TEST_TO||payload.pdfFilename!==TEST_FILENAME)
    throw Error('Test-only invariant violated');
  const out=path.join(__dirname,'..','out');
  fs.mkdirSync(out,{recursive:true});
  const marker=path.join(out,'.TEST_ONLY_invoice_gateway_sent_or_pending.json');
  try{
    const fd=fs.openSync(marker,'wx',0o600);
    try{fs.writeFileSync(fd,JSON.stringify({
      status:'PENDING_UNCONFIRMED',eventId,
      to:TEST_TO,invoiceNumber:TEST_INVOICE,
      createdAt:new Date().toISOString()
    })+'\n');}
    finally{fs.closeSync(fd);}
  }catch(e){
    if(e.code==='EEXIST')throw Error('Previous TEST_ONLY gateway attempt exists. Check the business Sent folder; no automatic retry.');
    throw e;
  }
  // Following network call is explicitly once. If it timed out, Gmail might
  // still have sent it: marker remains and the command cannot silently retry.
  console.log('SYNTHETIC TEST ONLY: one Make/Gmail request to the approved mailbox; no CRM database writes.');
  let receipt=null,confirmed=false;
  try{
    const response=await fetch(makeHook,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)
    });
    receipt=await response.json().catch(()=>null);
    confirmed=response.ok&&receipt?.ok===true&&
      receipt?.eventId===eventId&&
      typeof receipt?.messageId==='string'&&receipt.messageId.length>0;
  }catch(_e){confirmed=false;}
  fs.writeFileSync(marker,JSON.stringify({
    status:confirmed?'GMAIL_RECEIPT_CONFIRMED':'MANUAL_REVIEW_REQUIRED',
    eventId,to:TEST_TO,invoiceNumber:TEST_INVOICE,
    checkedAt:new Date().toISOString(),
    ...(confirmed?{gmailMessageId:receipt.messageId}:{})
  },null,2)+'\n',{mode:0o600});
  if(!confirmed)
    throw Error('Test response unconfirmed; check Gmail Sent manually. DO NOT rerun.');
  console.log('CRM INVOICE MAKE GMAIL SYNTHETIC PASS');
  console.log('Recipient: approved private test mailbox only');
  console.log('PDF: '+TEST_FILENAME+'; attachment bytes='+pdf.length);
  console.log('Gmail receipt: messageId confirmed; eventId matched');
  console.log('No Firestore writes. No real IBAN. No live CRM revision changes.');
}
main().catch(e=>{
  console.error('CRM INVOICE SYNTHETIC TEST STOPPED: '+e.message);
  process.exitCode=1;
});
