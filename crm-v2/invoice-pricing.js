'use strict';
// Invoice pricing and read-only readiness; never infer a payment or send a message.
function bad(message){throw Object.assign(new Error(message),{status:400});}
function cleanInvoiceItems(items){
  if(!Array.isArray(items)||items.length>60)bad('Ungültige Rechnungspositionen (maximal 60)');
  return items.map((row,index)=>{
    const position=index+1;
    if(!row||typeof row!=='object'||Array.isArray(row))bad('Ungültige Position '+position);
    if(typeof row.title!=='string'||!row.title.trim()||row.title.trim().length>180)
      bad('Bezeichnung fehlt oder zu lang bei Position '+position);
    const quantity=row.qty;
    if(typeof quantity!=='number'||!Number.isFinite(quantity)||quantity<=0||quantity>10000 ||
       Math.abs(quantity*1000-Math.round(quantity*1000))>0.00000001)bad('Ungültige Menge bei Position '+position);
    const price=row.unitPriceCHF;
    if(typeof price!=='number'||!Number.isFinite(price)||price<0||price>100000000 ||
       Math.abs(price*100-Math.round(price*100))>0.000001)bad('Ungültiger Einzelpreis bei Position '+position);
    const cents=Math.round(price*100);
    if(!Number.isSafeInteger(Math.round(quantity*cents)) || Math.round(quantity*cents)>10000000000)
      bad('Positionsbetrag zu hoch');
    return {title:row.title.trim(),qty:quantity,unitPriceCHF:cents/100};
  });
}
function invoiceTotals(items){
  const clean=cleanInvoiceItems(items);
  const cents=clean.reduce((sum,item)=>sum+Math.round(item.qty*Math.round(item.unitPriceCHF*100)),0);
  if(!Number.isSafeInteger(cents)||cents>10000000000)bad('Rechnungsbetrag zu hoch');
  return {items:clean,amountCHF:cents/100};
}
function invoiceLegacyItems(invoice){
  if(Array.isArray(invoice?.items))return invoice.items;
  const amount=Number(invoice?.amountCHF)||0;
  return amount>0?[{title:String(invoice?.description||'Leistung'),qty:1,unitPriceCHF:amount}]:[];
}
function isInvoiceLocked(invoice){return invoice?.status==='Bezahlt'||invoice?.status==='Storniert';}
function invoiceReadiness(invoice,customer,project){
  const missing=[];
  const day=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
  if(!/^RE-\d{1,10}$/.test(String(invoice.number||'')))missing.push('Rechnungsnummer');
  if(!String(invoice.description||'').trim())missing.push('Rechnungsbeschreibung');
  if(!day(invoice.invoiceDate||String(invoice.createdAt||'').slice(0,10)))missing.push('Gültiges Rechnungsdatum');
  if(!day(invoice.dueDate))missing.push('Gültige Fälligkeit');
  if(!invoice.customerId||!customer)missing.push('Zugeordneter Kunde');
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(customer?.email||'').trim()))missing.push('Kunden-E-Mail');
  if(!customer?.company||!customer?.street||!customer?.postalCode||!customer?.city)missing.push('Vollständige Rechnungsanschrift');
  else try{
    const {address,debtorFromCustomer}=require('./swiss-qr');
    address(debtorFromCustomer(customer),'Schuldner');
  }catch(_){missing.push('Swiss-QR-taugliche Anschrift mit Hausnummer und gültigem Land');}
  try{
    if(!Array.isArray(invoice.items)||!invoice.items.length)throw Error('items');
    const total=invoiceTotals(invoice.items).amountCHF;
    if(!(total>0)||!Number.isFinite(invoice.amountCHF)||Math.abs(total-invoice.amountCHF)>0.00001)throw Error('total');
  }catch(_){missing.push('Gültige Positionen mit übereinstimmendem Gesamtbetrag');}
  if(invoice.projectId&&(!project||project.customerId!==invoice.customerId))missing.push('Projekt mit demselben Kunden');
  let remainingCHF=null;
  try{remainingCHF=invoice.status==='Storniert'?0:require('./invoice-accounting').outstandingCents(invoice)/100;}catch(_){missing.push('Gültige Zahlungsdaten');}
  const sent=invoice.invoiceDispatchState==='confirmed'||Boolean(invoice.invoiceSentAt);
  let stage,nextAction;
  if(invoice.status==='Storniert'){stage='Storniert';nextAction='Keine Zahlung oder erneuten Versand für diese Rechnung erfassen.';}
  else if(invoice.status==='Bezahlt'){stage='Bezahlt';nextAction='Rechnung abgeschlossen.';}
  else if(['sending','manual_review'].includes(invoice.invoiceDispatchState)){stage='Versand prüfen';nextAction='Gmail «Gesendet» und Make prüfen; keinen erneuten Versand auslösen.';}
  else if(sent){stage=invoice.status==='Teilbezahlt'?'Teilbezahlt':'Versendet / offen';nextAction='Zahlungseingang prüfen und erst nach tatsächlichem Nachweis verbuchen.';}
  else if(missing.length){stage='Angaben ergänzen';nextAction='Fehlende Rechnungs- oder Kundendaten ergänzen und speichern.';}
  else if(invoice.status==='Entwurf'){stage='Entwurf prüfen';nextAction='Leistungen, Betrag und Fälligkeit prüfen, Status auf Offen setzen und speichern. Danach Swiss-QR-PDF kontrollieren.';}
  else {stage='PDF prüfen und versenden';nextAction='Swiss-QR-PDF und Empfänger kontrollieren, Prüfung bestätigen und bewusst versenden.';}
  return {missing,dataReady:missing.length===0,stage,nextAction,delivery:sent?'Versendet':invoice.invoiceDispatchState==='manual_review'?'Unklar':invoice.invoiceDispatchState==='sending'?'Läuft':'Nicht versendet',paymentStatus:invoice.status,remainingCHF,canSend:!missing.length&&invoice.status==='Offen'&&!sent&&!['sending','manual_review'].includes(invoice.invoiceDispatchState)};
}
module.exports={cleanInvoiceItems,invoiceTotals,invoiceLegacyItems,isInvoiceLocked,invoiceReadiness};
