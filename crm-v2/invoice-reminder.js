'use strict';
const {createHash}=require('node:crypto');
const {outstandingCents,localSwissDate,validDay}=require('./invoice-accounting');
const {wordmarkHtml}=require('./brand');
const KINDS=['Zahlungserinnerung','1. Mahnung','2. Mahnung'];
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function activeReminder(invoice){return ['sending','manual_review'].includes(invoice?.reminderDispatch?.state);}
function paymentDuringReminder(invoice,date){const d=invoice?.reminderDispatch;if(d?.state==='sending'&&Date.parse(date)-Date.parse(d.claimedAt)<300000)fail('Zahlungserinnerung wird gerade versendet. Zahlung danach erneut erfassen.');}
function reminderPreview(invoice,customer,date=new Date().toISOString()){
 if(!invoice)fail('Rechnung nicht gefunden',404);
 if(activeReminder(invoice))fail('Erinnerungsversand läuft oder muss zuerst im Postfach geprüft werden.');
 if(!['Offen','Teilbezahlt'].includes(invoice.status)||invoice.invoiceDispatchState!=='confirmed'||!validDay(invoice.dueDate)||invoice.dueDate>=localSwissDate(new Date(date))||outstandingCents(invoice)<=0)fail('Erinnerung nur für überfällige, versendete Rechnungen mit Restbetrag.');
 const history=invoice.reminderHistory||[],kind=KINDS[history.length];if(!kind)fail('Mahnfolge abgeschlossen.');
 if(history.length&&(!Number.isFinite(Date.parse(history.at(-1).at))||Date.parse(date)-Date.parse(history.at(-1).at)<7*86400000))fail('Zwischen Mahnstufen mindestens sieben Tage abwarten.');
 const recipient=String(customer?.email||'').trim().toLowerCase();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient))fail('Gültige Kunden-E-Mail fehlt.');
 if(!/^RE-\d{1,10}$/.test(invoice.number||''))fail('Gültige Rechnungsnummer fehlt.');
 const amount=outstandingCents(invoice)/100,money='CHF '+new Intl.NumberFormat('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2}).format(amount),due=invoice.dueDate.split('-').reverse().join('.');
 const subject=kind+' – Ihre Rechnung Nr. '+invoice.number+' | LSZH Automations';
 const text='Guten Tag'+(customer.contactName?' '+customer.contactName:'')+'\n\nZu unserer Rechnung '+invoice.number+' mit Fälligkeit '+due+' ist noch ein Betrag von '+money+' offen. Bitte begleichen Sie ausschliesslich diesen Restbetrag unter Angabe der Rechnungsnummer.\n\nIm Anhang finden Sie die ursprüngliche Rechnung. Bereits verbuchte Teilzahlungen sind im oben genannten Restbetrag berücksichtigt.\n\nFalls Sie die Zahlung bereits veranlasst haben, betrachten Sie diese Nachricht bitte als gegenstandslos.\n\nFreundliche Grüsse\nLSZH Automations';
 const html='<!doctype html><html lang="de-CH"><meta charset="utf-8"><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#142133"><div style="max-width:600px;margin:24px auto;background:white;border:1px solid #dfe7f2;border-radius:14px;overflow:hidden"><div style="background:#06101d;padding:28px;padding:clamp(14px,4vw,28px)">'+wordmarkHtml()+'</div><div style="padding:28px;padding:clamp(14px,4vw,28px);overflow-wrap:anywhere"><h1 style="font-size:clamp(18px,5vw,25px);overflow-wrap:anywhere;word-break:break-word">'+esc(kind)+'</h1><p><strong>'+esc(invoice.number)+' · Noch offen '+esc(money)+'</strong></p>'+text.split('\n\n').map(x=>'<p style="font-size:15px;line-height:1.65">'+esc(x).replace(/\n/g,'<br>')+'</p>').join('')+'</div></div></body></html>';
 const snapshot={kind,recipient,subject,text,html,amountCHF:amount,invoiceNumber:invoice.number,dueDate:invoice.dueDate,invoiceAmountCHF:invoice.amountCHF,items:invoice.items||null,invoiceDate:invoice.invoiceDate||null,customerId:invoice.customerId,customer:{company:customer.company,contactName:customer.contactName,street:customer.street,postalCode:customer.postalCode,city:customer.city,country:customer.country},history};
 return {kind,recipient,subject,text,html,amountCHF:amount,invoiceNumber:invoice.number,sha256:createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')};
}
function createReminderSender(store,config={}){
 const enabled=config.enabled===true&&config.mode==='production'&&!config.testTo&&/^https:\/\/hook\.eu1\.make\.com\/[A-Za-z0-9]+$/.test(config.webhookUrl||'')&&Boolean(config.iban);
 return {enabled,async preview(id){if(!enabled)fail('Erinnerungsversand nicht freigegeben',503);return store.invoiceReminderPreview(id);},async send(id,input,user){
  if(!enabled)fail('Erinnerungsversand nicht freigegeben',503);
  const c=await store.claimInvoiceReminder(id,input,user);if(c.replay)return {status:'confirmed',record:c.record};
  let pdf;try{pdf=await require('./invoice-pdf').makeInvoicePdf({...c.invoice,status:'Offen'},c.customer,c.project,{iban:config.iban});}catch(error){await store.finishInvoiceReminder(id,c.reminderId,'not_sent','',user);fail('PDF konnte nicht erzeugt werden. Nichts versendet.',500);}
  const eventId='invoice_send_reminder_'+c.reminderId;let receipt;
  try{const r=await (config.fetchImpl||fetch)(config.webhookUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'invoice_send',sendMode:'production',eventId,to:c.preview.recipient,subject:c.preview.subject,html:c.preview.html,pdfFilename:'LSZH_Rechnung_'+c.invoice.number+'.pdf',pdfBase64:pdf.toString('base64')}),redirect:'error',signal:AbortSignal.timeout(30000)});receipt=await r.json();if(!r.ok||receipt?.ok!==true||receipt.eventId!==eventId||typeof receipt.messageId!=='string'||!/^[A-Za-z0-9_-]{4,200}$/.test(receipt.messageId))throw Error('unconfirmed');}
  catch(error){await store.finishInvoiceReminder(id,c.reminderId,'manual_review','',user);fail('Versand unklar. Gmail Gesendet prüfen; nicht erneut senden.');}
  const record=await store.finishInvoiceReminder(id,c.reminderId,'confirmed',receipt.messageId,user);return {status:'confirmed',record};
 }};
}
module.exports={KINDS,activeReminder,paymentDuringReminder,reminderPreview,createReminderSender};
