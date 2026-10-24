'use strict';
const {makeInvoicePdf}=require('./invoice-pdf');
const {renderInvoiceEmail}=require('./invoice-mail');

const err=(message,status=400)=>Object.assign(new Error(message),{status});
function createInvoiceSender(store,config={}){
  const http=config.fetchImpl||globalThis.fetch;
  const hook=String(config.webhookUrl||'');
  const mode=String(config.mode||'').trim().toLowerCase();
  const testTo=String(config.testTo||'').trim().toLowerCase();
  const isProduction=mode==='production'&&!testTo;
  const isTest=mode==='test_only'&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testTo);
  const enabled=config.enabled===true&&
    /^https:\/\/hook\.eu1\.make\.com\/[A-Za-z0-9]+$/.test(hook)&&
    (isProduction||isTest)&&Boolean(String(config.iban||'').trim());
  const stats=()=>({enabled,mode:enabled?mode:'disabled',testTo:enabled?testTo:''});
  async function send(id,payload,user){
    if(!enabled)throw err('Rechnungsversand ist noch nicht freigegeben',503);
    if(!payload||typeof payload!=='object'||Array.isArray(payload)||
       Object.keys(payload).length!==0)
      throw err('Ungültige Versandbestätigung');
    const invoice=await store.get('rechnungen',id);
    if(!invoice)throw err('Rechnung nicht gefunden',404);
    // Never accidentally send synthetic/self-billed internal test invoices
    // through production Gmail. Strictly separate this from a test-only mailbox.
    const customer=invoice.customerId?await store.get('kunden',invoice.customerId):null;
    const isSynthetic=String(invoice.description||'').startsWith('TEST_ONLY')||
      /^TEST_ONLY\b/i.test(String(customer?.company||''))||
      String(customer?.company||'').trim().toLowerCase()==='lszh invest gmbh';
    if(isProduction&&isSynthetic)
      throw err('Interne Test- oder Eigenrechnung darf nicht produktiv versendet werden',403);
    if(isTest&&(!isSynthetic||String(customer?.email||'').trim().toLowerCase()!==testTo))
      throw err('Testmodus: nur interne Testrechnung an das erlaubte Testpostfach',403);
    const claim=await store.claimInvoiceSend(id,user);
    if(isProduction&&claim.isSynthetic){
      await store.finishInvoiceSend(id,claim.attemptId,'preparation_failed');
      throw err('Testrechnung nach Versandreservierung erkannt',403);
    }
    if(isTest&&(!claim.isSynthetic||claim.to!==testTo)){
      await store.finishInvoiceSend(id,claim.attemptId,'preparation_failed');
      throw err('Testempfänger nach Versandreservierung abweichend',403);
    }
    let mail,pdf;
    try{
      pdf=await makeInvoicePdf(claim.invoice,claim.customer,claim.project,{iban:config.iban});
      if(!Buffer.isBuffer(pdf)||pdf.length<500||pdf.length>700000||
         !pdf.subarray(0,8).toString().startsWith('%PDF-'))throw Error('invoice_pdf_invalid');
      mail=renderInvoiceEmail(claim.invoice,claim.customer);
      if(isTest)mail.subject='[TEST_ONLY] '+mail.subject;
    }catch(_e){
      await store.finishInvoiceSend(id,claim.attemptId,'preparation_failed');
      throw err('Rechnung oder E-Mail konnte nicht erzeugt werden. Nichts versendet.',500);
    }
    const eventId='invoice_send_'+claim.attemptId;
    const body={
      kind:'invoice_send',sendMode:mode,eventId,invoiceId:id,
      to:claim.to,subject:mail.subject,html:mail.html,
      pdfFilename:mail.filename,pdfBase64:pdf.toString('base64')
    };
    let confirmed=false,messageId='';
    try{
      const response=await http(hook,{method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
      const receipt=await response.json().catch(()=>null);
      confirmed=response.ok&&receipt?.ok===true&&receipt?.eventId===eventId&&
        typeof receipt?.messageId==='string'&&receipt.messageId.length>0;
      if(confirmed)messageId=receipt.messageId;
    }catch(_e){confirmed=false;}
    if(confirmed){
      const record=await store.finishInvoiceSend(id,claim.attemptId,'confirmed',messageId);
      return {status:'confirmed',record};
    }
    // In doubt: never repeat automatically. A lost receipt could still mean
    // Gmail sent the invoice. Require explicit manual Sent-folder reconciliation.
    await store.finishInvoiceSend(id,claim.attemptId,'manual_review','delivery_unconfirmed');
    throw err('Versandbestätigung fehlt. Geschäftliches Gmail-Postfach prüfen, nicht erneut senden.',409);
  }
  return {send,stats};
}
module.exports={createInvoiceSender};
