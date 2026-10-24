'use strict';

// Pure Swiss-CHF settlement helpers. No bank connection or external side effects.
// Monetary arithmetic is performed in integer Rappen.
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function cents(value,label='Betrag'){
  const text=String(value??'').trim();
  if(!/^(0|[1-9][0-9]{0,8})(?:\.[0-9]{1,2})?$/.test(text))fail(label+' muss ein positiver CHF-Betrag mit höchstens zwei Dezimalstellen sein');
  const [whole,fraction='']=text.split('.');
  const amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(amount)||amount>10000000000)fail(label+' ist zu hoch');
  return amount;
}
function localSwissDate(now=new Date()){
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
function validDay(value){
  if(typeof value!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value))return false;
  const date=new Date(value+'T12:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
const METHODS=['Banküberweisung','TWINT','Bar','Karte','Andere'];
function normalizePayment(payload,today=localSwissDate()){
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||
     Object.keys(payload).some(key=>!['paymentId','amountCHF','paidOn','method','reference'].includes(key)))
    fail('Ungültiger Zahlungseingang');
  const {paymentId,amountCHF,paidOn,method,reference=''}=payload;
  if(typeof paymentId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(paymentId))
    fail('Ungültige Buchungs-ID');
  const amountRappen=cents(amountCHF,'Zahlung');
  if(amountRappen<=0)fail('Zahlung muss grösser als CHF 0.00 sein');
  if(!validDay(paidOn)||paidOn>today)fail('Zahlungsdatum ist ungültig oder liegt in der Zukunft');
  if(!METHODS.includes(method))fail('Ungültige Zahlungsart');
  if(typeof reference!=='string'||reference.trim().length>120)fail('Zahlungsreferenz maximal 120 Zeichen');
  return {paymentId,amountCHF:amountRappen/100,paidOn,method,reference:reference.trim()};
}
function paidCents(invoice){
  const history=Array.isArray(invoice.paymentHistory)?invoice.paymentHistory:[];
  return history.reduce((sum,payment)=>sum+(payment.voidedAt?0:cents(payment.amountCHF)),0);
}
function outstandingCents(invoice){
  const total=cents(invoice.amountCHF||0);
  // Historical records marked paid before the payment ledger existed.
  if(invoice.status==='Bezahlt'&&!(invoice.paymentHistory||[]).length)return 0;
  return Math.max(0,total-paidCents(invoice));
}
function effectiveInvoiceStatus(invoice,today=localSwissDate()){
  if(['Bezahlt','Storniert','Entwurf'].includes(invoice.status))return invoice.status;
  if(invoice.dueDate&&validDay(invoice.dueDate)&&invoice.dueDate<today&&outstandingCents(invoice)>0)return 'Überfällig';
  return invoice.status;
}
module.exports={cents,localSwissDate,validDay,normalizePayment,paidCents,outstandingCents,effectiveInvoiceStatus,METHODS};
