'use strict';
// Read-only daily aggregates, no customer records or payment references exposed.
const {localSwissDate,validDay,outstandingCents,cents}=require('./invoice-accounting');
const empty=()=>({customers:0,invoiceCount:0,invoiceCents:0,invoiceDrafts:0,invoiceCancelled:0,invoiceSent:0,outstandingCents:0,overdueCents:0,paidCents:0,payments:0,offers:0,offerOneTimeCents:0,offerMonthlyCents:0,acceptedOneTimeCents:0,acceptedMonthlyCents:0,projects:0,offerStatuses:{},projectStatuses:{}});
function dayOf(value){
 if(typeof value!=='string')return '';
 if(validDay(value))return value;
 if(!/^\d{4}-\d{2}-\d{2}T/.test(value)||!validDay(value.slice(0,10))||!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))return '';
 return localSwissDate(new Date(value));
}
function reportingSummary(data,{today=localSwissDate()}={}){
 const days={},undated=empty(),quality={customers:0,invoices:0,offers:0,projects:0,payments:0,legacyPaid:0,invalidAmounts:0},bucket=(day,type)=>{if(!day){quality[type]++;return undated;}return days[day]||(days[day]=empty());};
 const money=value=>{try{return cents(value||0);}catch{quality.invalidAmounts++;return 0;}};
 for(const r of data.kunden||[])bucket(dayOf(r.createdAt),'customers').customers++;
 for(const r of data.offerten||[]){
  const b=bucket(dayOf(r.createdAt),'offers');b.offers++;b.offerOneTimeCents+=money(r.oneTimeCHF);b.offerMonthlyCents+=money(r.monthlyCHF);
  const state=r.onlineAcceptance?.state,pending=['customer_response_recorded','awaiting_lszh_confirmation'].includes(state)&&r.status!=='Abgelehnt';
  const accepted=!pending&&(r.status==='Angenommen'||state==='confirmed'&&r.status!=='Abgelehnt');
  const status=pending?'Einseitig angenommen':accepted?'Beidseitig angenommen':r.status||'Unbekannt';
  b.offerStatuses[status]=(b.offerStatuses[status]||0)+1;
  if(accepted){b.acceptedOneTimeCents+=money(r.oneTimeCHF);b.acceptedMonthlyCents+=money(r.monthlyCHF);}
 }
 for(const r of data.projekte||[]){const b=bucket(dayOf(r.createdAt),'projects');b.projects++;const status=r.status||'Unbekannt';b.projectStatuses[status]=(b.projectStatuses[status]||0)+1;}
 for(const r of data.rechnungen||[]){
  const b=bucket(dayOf(r.invoiceDate)||dayOf(r.createdAt),'invoices');
  if(r.status==='Entwurf')b.invoiceDrafts++;
  else if(r.status==='Storniert')b.invoiceCancelled++;
  else if(['Offen','Teilbezahlt','Bezahlt'].includes(r.status)){
   b.invoiceCount++;b.invoiceCents+=money(r.amountCHF);
   if(r.invoiceDispatchState==='confirmed'||r.invoiceSentAt)b.invoiceSent++;
   if(['Offen','Teilbezahlt'].includes(r.status)){const rest=outstandingCents(r);b.outstandingCents+=rest;if(validDay(r.dueDate)&&r.dueDate<today)b.overdueCents+=rest;}
  }
  const ledger=Array.isArray(r.paymentHistory)?r.paymentHistory:[];
  if(r.status==='Bezahlt'&&!ledger.length)quality.legacyPaid++;
  for(const payment of ledger){if(payment.voidedAt)continue;const b=bucket(dayOf(payment.paidOn),'payments');b.paidCents+=money(payment.amountCHF);b.payments++;}
 }
 const customers=data.kunden||[];
 return {today,loadedAt:new Date().toISOString(),current:{customers:customers.length,activeCustomers:customers.filter(x=>x.status==='Aktiv').length,inactiveCustomers:customers.filter(x=>x.status==='Inaktiv').length,projects:(data.projekte||[]).filter(x=>x.status!=='Abgeschlossen').length},days:Object.keys(days).sort().map(day=>({day,...days[day]})),undated,quality};
}
module.exports={reportingSummary,dayOf};
