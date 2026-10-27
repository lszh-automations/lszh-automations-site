'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {reportingSummary,dayOf}=require('../dashboard-reporting');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8'),source=html.slice(html.indexOf('function reportValidDay('),html.indexOf('function renderKpis(){'));
const ctx=vm.createContext({localDateKey:()=> '2026-10-27',state:{}});vm.runInContext(source,ctx);
const range=(filter,today='2026-10-27')=>ctx.reportRange(filter,today),aggregate=(report,r)=>ctx.reportAggregate(report,r);
const empty=()=>({kunden:[],offerten:[],projekte:[],rechnungen:[]});
test('reporting uses Swiss calendar dates, rejects malformed and ambiguous timestamps',()=>{
 assert.equal(dayOf('2025-12-31T23:30:00Z'),'2026-01-01');assert.equal(dayOf('2026-10-01'),'2026-10-01');
 for(const value of ['2026-02-30','2026-02-30T12:00:00Z','2026-10-01T12:00:00','bad',undefined])assert.equal(dayOf(value),'');
});
test('month, quarter and year compare elapsed periods, including previous-year quarter and leap month',()=>{
 const m=range({mode:'month',month:'2026-10'});assert.equal(m.from,'2026-10-01');assert.equal(m.to,'2026-10-27');assert.equal(m.previous.from,'2026-09-01');assert.equal(m.previous.to,'2026-09-27');
 const q=range({mode:'quarter',year:2026,quarter:1});assert.equal(q.from,'2026-01-01');assert.equal(q.to,'2026-03-31');assert.equal(q.previous.from,'2025-10-01');assert.equal(q.previous.to,'2025-12-31');
 const y=range({mode:'year',year:2026});assert.equal(y.to,'2026-10-27');assert.equal(y.previous.from,'2025-01-01');
 const leap=range({mode:'month',month:'2024-02'});assert.equal(leap.to,'2024-02-29');assert.equal(leap.previous.to,'2024-01-31');
});
test('custom ranges are inclusive, compare the preceding equal span and reject invalid or future-only dates',()=>{
 const r=range({mode:'custom',from:'2026-10-10',to:'2026-10-12'});assert.equal(r.previous.from,'2026-10-07');assert.equal(r.previous.to,'2026-10-09');
 for(const f of [{mode:'custom',from:'2026-10-20',to:'2026-10-01'},{mode:'custom',from:'2026-02-30',to:'2026-10-01'},{mode:'year',year:2027},{mode:'month',month:'2026-13'}])assert.throws(()=>range(f));
});
test('customer acquisition, cumulative remaining-record stock and current active/inactive states are separate',()=>{
 const d=empty();d.kunden=[{id:'old',createdAt:'2025-12-31T23:30:00Z',status:'Inaktiv'},{id:'new',createdAt:'2026-10-01T00:00:00Z',status:'Aktiv'}];
 const report=reportingSummary(d,{today:'2026-10-27'}),selected=aggregate(report,range({mode:'quarter',year:2026,quarter:4}));
 assert.equal(report.current.customers,2);assert.equal(report.current.activeCustomers,1);assert.equal(selected.customers,1);assert.equal(selected.customersEnd,2);
 const previous=aggregate(report,range({mode:'year',year:2025}));assert.equal(previous.customers,0);assert.equal(previous.customersEnd,0);
 const rows=ctx.reportBuckets(report,range({mode:'year',year:2026}),'quarter');assert.equal(rows.length,4);assert.equal(rows[0].customersEnd,1);assert.equal(rows[3].customersEnd,2);
});
test('invoice dates and payment dates are independent; drafts, cancellations, voids and legacy paid flags never inflate receipts',()=>{
 const d=empty();d.rechnungen=[{status:'Teilbezahlt',invoiceDate:'2026-09-30',amountCHF:100,invoiceDispatchState:'confirmed',dueDate:'2026-10-01',paymentHistory:[{paidOn:'2026-10-05',amountCHF:25},{paidOn:'2026-10-05',amountCHF:50,voidedAt:'2026-10-06'}]},{status:'Entwurf',invoiceDate:'2026-10-01',amountCHF:999},{status:'Storniert',invoiceDate:'2026-10-01',amountCHF:888},{status:'Bezahlt',invoiceDate:'2026-10-01',amountCHF:500}];
 const before=JSON.stringify(d),report=reportingSummary(d,{today:'2026-10-27'}),oct=aggregate(report,range({mode:'month',month:'2026-10'})),sep=aggregate(report,range({mode:'month',month:'2026-09'}));
 assert.equal(oct.invoiceCents,50000);assert.equal(oct.paidCents,2500);assert.equal(oct.invoiceDrafts,1);assert.equal(oct.invoiceCancelled,1);assert.equal(oct.outstandingCents,0);
 assert.equal(sep.invoiceCents,10000);assert.equal(sep.paidCents,0);assert.equal(sep.outstandingCents,7500);assert.equal(sep.overdueCents,7500);assert.equal(report.quality.legacyPaid,1);assert.equal(JSON.stringify(d),before);
});
test('acceptance stages are distinguished; project completion describes the current state of created cohorts',()=>{
 const d=empty();d.offerten=['customer_response_recorded','awaiting_lszh_confirmation','confirmed'].map(state=>({createdAt:'2026-10-01',status:'Versendet',monthlyCHF:100,oneTimeCHF:10,onlineAcceptance:{state}}));d.offerten.push({createdAt:'2026-10-01',status:'Abgelehnt',onlineAcceptance:{state:'confirmed'},monthlyCHF:999});d.projekte=[{createdAt:'2026-01-01',status:'Abgeschlossen'},{createdAt:'2026-10-01',status:'Wartet auf Kunde'}];
 const r=aggregate(reportingSummary(d),range({mode:'month',month:'2026-10'}));assert.equal(r.offerStatuses['Einseitig angenommen'],2);assert.equal(r.offerStatuses['Beidseitig angenommen'],1);assert.equal(r.acceptedMonthlyCents,10000);assert.equal(r.acceptedOneTimeCents,1000);assert.equal(r.projects,1);assert.equal(r.projectStatuses['Wartet auf Kunde'],1);assert.equal(r.projectStatuses.Abgeschlossen,undefined);
});
test('undated values are explicit and included only in Gesamt; no invented dated stock or trend',()=>{
 const d=empty();d.kunden=[{status:'Aktiv'}];d.offerten=[{status:'Entwurf'}];const report=reportingSummary(d),all=ctx.reportRange({mode:'all'},report.today,report.days),year=range({mode:'year'});
 assert.equal(report.quality.customers,1);assert.equal(aggregate(report,year).customers,0);assert.equal(aggregate(report,all).customers,1);assert.equal(aggregate(report,all).customersEnd,0);assert.equal(aggregate(report,all).offers,1);
});
test('complete reporting aggregates beyond first register pages and never exposes customer identities',()=>{
 const d=empty();d.kunden=Array.from({length:235},()=>({createdAt:'2026-10-01',status:'Aktiv',email:'PRIVATE@qa.invalid',company:'PRIVATE'}));const report=reportingSummary(d);assert.equal(report.days[0].customers,235);assert.equal(report.current.customers,235);assert.doesNotMatch(JSON.stringify(report),/PRIVATE|email|company/);
});
