'use strict';

// Manual offer delivery bookkeeping only. NEVER sends customer mail.
const {existingLines,quoteTotals}=require('./offer-pricing');
function failure(message,status=400){return Object.assign(new Error(message),{status});}
function validDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+'T12:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
function validateNextDate(value,today){
  if(!validDate(value)||value<today)throw failure('Nachfassdatum muss heute oder in der Zukunft liegen');
  return value;
}
function checkReadyForDispatch(offer,recipient,today){
  if(offer.status!=='Bereit')throw failure('Offerte zuerst speichern und auf Bereit setzen',409);
  if(!validDate(offer.validUntil)||offer.validUntil<today)
    throw failure('Offerte benötigt ein gültiges, noch nicht abgelaufenes Gültigkeitsdatum',409);
  const lines=existingLines(offer);
  const totals=quoteTotals(lines);
  if(!lines.length || totals.oneTimeCHF<=0&&totals.monthlyCHF<=0)
    throw failure('Offerte benötigt mindestens eine kostenpflichtige Position',409);
  const email=String(recipient?.email||'').trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw failure('Beim verknüpften Lead oder Kunden fehlt eine gültige E-Mail-Adresse',409);
  return email;
}
function normalizeDispatchInput(input,today){
  if(!input||typeof input!=='object'||Array.isArray(input)||
     Object.keys(input).some(key=>key!=='followUpDate'))
    throw failure('Ungültige Versanddokumentation');
  return {followUpDate:validateNextDate(input.followUpDate,today)};
}
function normalizeFollowUpInput(input,today){
  if(!input||typeof input!=='object'||Array.isArray(input)||
     Object.keys(input).some(key=>!['followUpDate','note'].includes(key)))
    throw failure('Ungültige Nachfassdokumentation');
  const date=validateNextDate(input.followUpDate,today);
  if(input.note!==undefined&&(typeof input.note!=='string'||input.note.length>500))
    throw failure('Nachfassnotiz maximal 500 Zeichen');
  return {followUpDate:date,note:String(input.note||'').trim()};
}
function dueOfferFollowUps(offers,today){
  return (offers||[]).filter(offer=>offer.status==='Versendet'&&!offer.onlineAcceptance&&
    validDate(offer.followUpDate)&&offer.followUpDate<=today)
    .sort((a,b)=>a.followUpDate.localeCompare(b.followUpDate));
}
module.exports={validDate,validateNextDate,checkReadyForDispatch,normalizeDispatchInput,normalizeFollowUpInput,dueOfferFollowUps};
