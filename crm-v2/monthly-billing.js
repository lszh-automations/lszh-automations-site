 'use strict';
const {createHash}=require('node:crypto');
const {existingLines}=require('./offer-pricing');
const {invoiceTotals}=require('./invoice-pricing');
const {validProjectStartDay}=require('./project-tasks');
const {localSwissDate}=require('./invoice-accounting');
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
function nextMonth(day){
 if(!validProjectStartDay(day))fail('Gültiges Abrechnungsdatum erforderlich',400);
 const y=Number(day.slice(0,4)),m=Number(day.slice(5,7));
 if(y<2000||y>9998)fail('Abrechnungsdatum muss zwischen 2000 und 9998 liegen',400);
 return m===12?String(y+1)+'-01':String(y)+'-'+String(m+1).padStart(2,'0');
}
function monthValid(m){return typeof m==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(m)&&Number(m.slice(0,4))>=2000;}
function monthEnd(m){if(!monthValid(m))fail('Ungültige Abrechnungsperiode');const [y,n]=m.split('-').map(Number);return m+'-'+new Date(Date.UTC(y,n,0)).getUTCDate();}
function monthlyInvoiceId(offerId,period){return 'monthly-'+createHash('sha256').update(offerId+'|'+period).digest('hex').slice(0,32);}
function createMonthlyBilling({db,col,audit,newRecord,now,get,scan,nextSequence}){
 async function inputs(tx,project){
  if(!project.customerId||!project.offerId)fail('Monatsabrechnung benötigt einen Kunden und eine angenommene Offerte.');
  const [c,o]=await Promise.all([tx.get(col('kunden').doc(project.customerId)),tx.get(col('offerten').doc(project.offerId))]);
  if(!c.exists||c.data().status!=='Aktiv')fail('Aktiver Kunde erforderlich.');
  const offer=o.data();
  if(!o.exists||offer.status!=='Angenommen'||offer.customerId!==project.customerId)fail('Angenommene Offerte muss demselben Kunden zugeordnet sein.');
  if(offer.onlineAcceptance&&(offer.onlineAcceptance.state!=='confirmed'||offer.onlineAcceptance.reviewRequired!==false||offer.onlineAcceptance.archiveState!=='complete'))fail('Online-Annahme muss bestätigt und archiviert sein.');
  const totals=invoiceTotals(existingLines(offer).filter(x=>x.mode==='monatlich').map(({title,qty,unitPriceCHF})=>({title,qty,unitPriceCHF})));
  if(!totals.items.length||totals.amountCHF<=0)fail('Keine kostenpflichtigen monatlichen Positionen vorhanden.');
  return {offer,totals};
 }
 async function monthlyBillingStatus(id){
  const project=await get('projekte',id);if(!project)fail('Projekt nicht gefunden',404);
  let eligible=true,reason='',totals=null;
  try{totals=(await db.runTransaction(tx=>inputs(tx,project))).totals;}catch(e){eligible=false;reason=e.message;}
  return {plan:project.monthlyBilling||null,eligible,reason,monthlyCHF:totals?.amountCHF||0,today:localSwissDate(new Date(now())),policy:'next_full_calendar_month'};
 }
 async function activateMonthlyBilling(id,input,user){
  if(!input||Object.keys(input).some(k=>!['startDate','reviewed','externalBillingChecked'].includes(k))||input.reviewed!==true||input.externalBillingChecked!==true)fail('Abrechnungsregel und bisherige Rechnungen zuerst prüfen und bestätigen.',400);
  const firstPeriod=nextMonth(input.startDate),date=now(),today=localSwissDate(new Date(date));
  const ref=col('projekte').doc(id);
  await db.runTransaction(async tx=>{
   const snap=await tx.get(ref);if(!snap.exists)fail('Projekt nicht gefunden',404);const project=snap.data(),old=project.monthlyBilling;
   if(old?.state==='active'){if(old.startDate===input.startDate)return;fail('Aktive Monatsabrechnung zuerst pausieren.');}
   if(input.startDate>'2099-12-31')fail('Abrechnungsbeginn spätestens 2099 wählen.',400);
   if(input.startDate<today)fail('Für eine neue Aktivierung ein Datum ab heute wählen. Keine rückwirkende Aktivierung.',400);
   const {totals}=await inputs(tx,project);
   const plan={state:'active',policy:'next_full_calendar_month',startDate:input.startDate,firstPeriod,nextPeriod:firstPeriod,items:totals.items,amountCHF:totals.amountCHF,customerId:project.customerId,offerId:project.offerId,activatedAt:date,activatedBy:user.email,externalBillingCheckedAt:date,lastError:null};
   tx.update(ref,audit({monthlyBilling:plan,monthlyBillingHistory:[...(project.monthlyBillingHistory||[]),{state:'active',at:date,by:user.email,startDate:input.startDate,firstPeriod,amountCHF:totals.amountCHF}]},user,date));
  });return monthlyBillingStatus(id);
 }
 async function pauseMonthlyBilling(id,user){
  const ref=col('projekte').doc(id),date=now();
  await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)fail('Projekt nicht gefunden',404);const p=snap.data();if(p.monthlyBilling?.state!=='active')return;
   tx.update(ref,audit({monthlyBilling:{...p.monthlyBilling,state:'paused',pausedAt:date,pausedBy:user.email,lastError:null},monthlyBillingHistory:[...(p.monthlyBillingHistory||[]),{state:'paused',at:date,by:user.email}]},user,date));
  });return monthlyBillingStatus(id);
 }
 async function createDueMonthlyInvoice(id,user){
  const ref=col('projekte').doc(id),date=now(),today=localSwissDate(new Date(date));let result={created:false};
  await db.runTransaction(async tx=>{
   result={created:false};const snap=await tx.get(ref);if(!snap.exists)return;const p=snap.data(),plan=p.monthlyBilling;if(plan?.state!=='active')return;
   if(!monthValid(plan.firstPeriod)||!monthValid(plan.nextPeriod)||plan.nextPeriod<plan.firstPeriod)fail('Nächste Abrechnungsperiode ist ungültig.');
   if(plan.nextPeriod>today.slice(0,7))return;
   const {totals}=await inputs(tx,p);
   if(plan.customerId!==p.customerId||plan.offerId!==p.offerId||JSON.stringify(totals.items)!==JSON.stringify(plan.items)||totals.amountCHF!==plan.amountCHF)fail('Vertragspositionen oder Zuordnung haben sich geändert. Monatsabrechnung prüfen.');
   const period=plan.nextPeriod,invoiceRef=col('rechnungen').doc(monthlyInvoiceId(p.offerId,period)),existing=await tx.get(invoiceRef);
   if(existing.exists){const i=existing.data();if(i.projectId!==id||i.customerId!==p.customerId||i.monthlyPeriod!==period||i.source!=='monthly_billing')fail('Abrechnungsperiode bereits anders zugeordnet.');}
   const counter=existing.exists?null:await nextSequence(tx,'invoice');
   if(counter){tx.set(counter.reference,{next:counter.next+1},{merge:true});tx.create(invoiceRef,newRecord({...invoiceTotals(plan.items),number:'RE-'+counter.next,customerId:p.customerId,projectId:id,offerId:p.offerId,description:'Monatliche Leistungen gemäss Offerte · Leistungszeitraum '+period+'-01 bis '+monthEnd(period),invoiceDate:today,dueDate:'',status:'Entwurf',source:'monthly_billing',billingScope:'monthly',monthlyPeriod:period,billingStartConfirmedAt:plan.activatedAt},user,date));}
   tx.update(ref,audit({monthlyBilling:{...plan,nextPeriod:nextMonth(period+'-01'),lastPeriod:period,lastInvoiceId:invoiceRef.id,lastError:null}},user,date));
   result={created:!existing.exists,invoiceId:invoiceRef.id,period,advanced:true};
  });return result;
 }
 async function monthlyBillingTick(user){
  const results=[];
  for await(const p of scan('projekte')){
   if(p.monthlyBilling?.state!=='active')continue;
   try{let created=0;for(let i=0;i<12;i++){const r=await createDueMonthlyInvoice(p.id,user);if(!r.advanced)break;if(r.created)created++;}results.push({projectId:p.id,created});}
   catch(e){const ref=col('projekte').doc(p.id),date=now();await db.runTransaction(async tx=>{const s=await tx.get(ref);if(s.exists&&s.data().monthlyBilling?.state==='active'&&s.data().monthlyBilling.activatedAt===p.monthlyBilling.activatedAt)tx.update(ref,audit({monthlyBilling:{...s.data().monthlyBilling,lastError:'Monatsabrechnung konnte nicht erstellt werden. Verknüpfung und Vertragspositionen prüfen.'}},user,date));});results.push({projectId:p.id,error:true});}
  }
  return {processed:results.length,errors:results.filter(x=>x.error).length,results};
 }
 return {monthlyBillingStatus,activateMonthlyBilling,pauseMonthlyBilling,createDueMonthlyInvoice,monthlyBillingTick};
}
module.exports={createMonthlyBilling,nextMonth,monthEnd,monthlyInvoiceId};
