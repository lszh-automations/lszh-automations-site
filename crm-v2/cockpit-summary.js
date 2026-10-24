'use strict';
// Complete read-only CRM cockpit, aggregated on Cloud Run by scanning every
// authorized CRM collection. Bounded preview arrays keep HTTP output small.
// O(N) Firestore reads per request: switch to transactional materialized
// aggregates before very large datasets or high-frequency polling.
const {localSwissDate,validDay,outstandingCents,paidCents}=require('./invoice-accounting');
const TABLES=['leads','kunden','offerten','rechnungen','projekte'];
const leadStatuses=['Neu','Kontaktiert','Qualifiziert','Gewonnen','Verloren'];
const money=x=>{const v=Number(x);return Number.isFinite(v)&&v>0?Math.round(v*100):0;};
const keepTop=(array,value,limit,comparator)=>{
  array.push(value);array.sort(comparator);if(array.length>limit)array.length=limit;
};
function empty(){
  return {
    loadedAt:new Date().toISOString(),counts:Object.fromEntries(TABLES.map(k=>[k,0])),
    newLeads:0,openOffers:0,openInvoices:0,openInvoiceCents:0,
    activeProjects:0,waitingProjects:0,paidCents:0,openOfferCents:0,
    acceptedMonthlyCents:0,leadCount:0,
    overdueCount:0,overdueCents:0,soonCount:0,soonCents:0,
    legacyPaidCount:0,projectDone:0,projectOverdue:0,tasksDone:0,tasksTotal:0,
    leadStages:Object.fromEntries(leadStatuses.map(k=>[k,0])),
    dueLeadCount:0,dueOfferCount:0,reminderPreviewCount:0,
    recentLeads:[],dueLeads:[],dueOffers:[],receivables:[]
  };
}
const earliest=(a,b)=>String(a.followUpDate||'').localeCompare(String(b.followUpDate||''))||
  String(a.id||'').localeCompare(String(b.id||''));
const newest=(a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))||
  String(b.id||'').localeCompare(String(a.id||''));
const priority={overdue:0,soon:1,open:2};
const invoiceOrder=(a,b)=>(priority[a.kind]??3)-(priority[b.kind]??3)||
  String(a.invoice.dueDate||'9999-99-99').localeCompare(String(b.invoice.dueDate||'9999-99-99'))||
  String(a.invoice.number||'').localeCompare(String(b.invoice.number||''));
function invoiceKind(inv,today,remaining){
  if(!validDay(inv.dueDate))return 'open';
  if(inv.dueDate<today)return 'overdue';
  // UTC noon avoids Swiss daylight-saving clock arithmetic in calendar days.
  const days=Math.round((Date.parse(inv.dueDate+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);
  return days<=7?'soon':'open';
}
async function cockpitSummary(store,{today=localSwissDate(),nowMs=Date.now()}={}){
  const s=empty();const cutoff=nowMs-24*60*60*1000;
  for(const table of TABLES){
    for await(const r of store.scan(table)){
      s.counts[table]++;
      if(table==='leads'){
        s.leadCount++;if(Object.hasOwn(s.leadStages,r.status))s.leadStages[r.status]++;
        if(r.status==='Neu'){
          s.newLeads++;
          if(Number.isFinite(Date.parse(r.createdAt))&&Date.parse(r.createdAt)<=cutoff)s.reminderPreviewCount++;
        }
        keepTop(s.recentLeads,r,4,newest);
        if(['Neu','Kontaktiert','Qualifiziert'].includes(r.status)&&r.nextAction&&validDay(r.followUpDate)&&r.followUpDate<=today){
          s.dueLeadCount++;keepTop(s.dueLeads,r,8,earliest);
        }
      }
      if(table==='offerten'){
        if(['Entwurf','Bereit','Versendet'].includes(r.status)){
          s.openOffers++;s.openOfferCents+=money(r.oneTimeCHF);
        }
        if(r.status==='Angenommen')s.acceptedMonthlyCents+=money(r.monthlyCHF);
        if(r.status==='Versendet'&&validDay(r.followUpDate)&&r.followUpDate<=today){
          s.dueOfferCount++;keepTop(s.dueOffers,r,8,earliest);
        }
      }
      if(table==='rechnungen'){
        if(!['Offen','Teilbezahlt','Bezahlt'].includes(r.status))continue;
        const history=Array.isArray(r.paymentHistory)?r.paymentHistory:[];
        s.paidCents+=paidCents(r);
        if(r.status==='Bezahlt'&&!history.length)s.legacyPaidCount++;
        if(!['Offen','Teilbezahlt'].includes(r.status))continue;
        const remaining=outstandingCents(r);
        if(remaining<=0)continue;
        s.openInvoices++;s.openInvoiceCents+=remaining;
        const kind=invoiceKind(r,today,remaining);
        if(kind==='overdue'){s.overdueCount++;s.overdueCents+=remaining;}
        if(kind==='soon'){s.soonCount++;s.soonCents+=remaining;}
        keepTop(s.receivables,{invoice:r,kind,remaining},6,invoiceOrder);
      }
      if(table==='projekte'){
        if(r.status==='Abgeschlossen')s.projectDone++;
        if(['Geplant','In Arbeit','Wartet auf Kunde'].includes(r.status))s.activeProjects++;
        if(r.status==='Wartet auf Kunde')s.waitingProjects++;
        if(r.status!=='Abgeschlossen'&&validDay(r.dueDate)&&r.dueDate<today)s.projectOverdue++;
        const tasks=Array.isArray(r.tasks)?r.tasks:[];
        s.tasksTotal+=tasks.length;s.tasksDone+=tasks.filter(t=>t.done===true).length;
      }
    }
  }
  return s;
}
module.exports={cockpitSummary,invoiceKind};
