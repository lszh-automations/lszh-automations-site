'use strict';
// Complete read-only CRM cockpit, aggregated on Cloud Run by scanning every
// authorized CRM collection. Bounded preview arrays keep HTTP output small.
// O(N) Firestore reads per request: switch to transactional materialized
// aggregates before very large datasets or high-frequency polling.
const {localSwissDate,validDay,outstandingCents,paidCents}=require('./invoice-accounting');
const {offerDisplayStatus}=require('./offer-tracking');
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
    pendingConfirmationCount:0,pendingAdoptionCount:0,pendingConfirmations:[],pendingAdoptions:[],
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

// One compact, complete row per unfinished CRM record. No preview cap and no
// writes: terminal states remain authoritative except for unresolved delivery
// or an accepted offer whose handover links are missing.
function openProcesses(data,today){
  const customers=Object.fromEntries((data.kunden||[]).map(r=>[r.id,r]));
  const leads=Object.fromEntries((data.leads||[]).map(r=>[r.id,r]));
  const projects=data.projekte||[],invoices=data.rechnungen||[],rows=[];
  const uncertain=s=>['sending','manual_review'].includes(s);
  const add=(table,r,action,{date='',priority=4,pending=false}={})=>{
    const customer=customers[r.customerId],lead=leads[r.leadId];
    rows.push({table,id:r.id,title:r.title||r.company||r.name||r.description||r.number||'Eintrag ohne Bezeichnung',
      number:r.number||'',company:customer?.company||lead?.company||r.company||'',
      status:table==='offerten'?offerDisplayStatus(r):r.status||'Status fehlt',action,
      date:validDay(date)?date:'',priority,pending,createdAt:r.createdAt||'',
      ...(table==='rechnungen'?{invoiceDispatchState:r.invoiceDispatchState||'',invoiceSentAt:r.invoiceSentAt||''}:{})});
  };
  const duePriority=date=>validDay(date)&&date<=today?(date<today?1:2):4;
  for(const r of data.leads||[]){
    if(['Gewonnen','Verloren'].includes(r.status))continue;
    const known=['Neu','Kontaktiert','Qualifiziert'].includes(r.status);
    const action=!known?'Status prüfen':r.nextAction||({Neu:'Anfrage prüfen und kontaktieren',Kontaktiert:'Kundenrückmeldung verfolgen',Qualifiziert:'Offerte vorbereiten oder Rückmeldung verfolgen'}[r.status]);
    add('leads',r,action,{date:r.followUpDate,priority:known?duePriority(r.followUpDate):0});
  }
  for(const r of data.offerten||[]){
    if(uncertain(r.offerDispatchState)){add('offerten',r,'Offertenversand im Postfach prüfen',{priority:0,pending:true});continue;}
    const acceptance=r.onlineAcceptance;
    if(r.status!=='Abgelehnt'&&acceptance?.state==='confirmed'&&(acceptance.reviewRequired===true||acceptance.archiveState&&acceptance.archiveState!=='complete')){
      add('offerten',r,'Annahme und Archivierung prüfen',{priority:0,pending:true});continue;
    }
    if(r.status!=='Abgelehnt'&&['customer_response_recorded','awaiting_lszh_confirmation'].includes(acceptance?.state)){
      add('offerten',r,'Kundenannahme prüfen und Auftragsbestätigung senden',{priority:3,pending:true});continue;
    }
    if(r.status!=='Angenommen'&&r.status!=='Abgelehnt'&&acceptance?.state==='confirmed'){
      add('offerten',r,'Bestätigten Auftrag übernehmen',{priority:3});continue;
    }
    if(r.status==='Angenommen'){
      const linked=projects.filter(p=>p.offerId===r.id);
      if(!r.customerId||!customers[r.customerId]||!linked.length){add('offerten',r,'Auftragsübernahme prüfen: Kunde oder Projekt fehlt',{priority:0});continue;}
      if(money(r.oneTimeCHF)>0&&!invoices.some(i=>i.id===r.initialInvoiceId||i.offerId===r.id||linked.some(p=>i.projectId===p.id))){
        add('offerten',r,'Rechnungsentwurf für einmalige Leistungen prüfen',{priority:3});
      }
      continue;
    }
    if(r.status==='Abgelehnt')continue;
    const action={Entwurf:'Offerte fertigstellen',Bereit:'Offerte prüfen und versenden',Versendet:'Auf Kundenantwort warten; bei Bedarf nachfassen'}[r.status]||'Offertenstatus prüfen';
    add('offerten',r,action,{date:r.followUpDate,priority:['Entwurf','Bereit','Versendet'].includes(r.status)?duePriority(r.followUpDate):0});
  }
  for(const r of invoices){
    if(uncertain(r.reminderDispatch?.state)){add('rechnungen',r,'Erinnerungsversand im Postfach prüfen',{priority:0,pending:true});continue;}
    if(uncertain(r.invoiceDispatchState)){add('rechnungen',r,'Rechnungsversand im Postfach prüfen',{priority:0,pending:true});continue;}
    if(['Bezahlt','Storniert'].includes(r.status))continue;
    let action='Rechnungsstatus prüfen',priority=0;
    if(r.status==='Entwurf'){action='Rechnung vervollständigen, prüfen und versenden';priority=4;}
    else if(['Offen','Teilbezahlt'].includes(r.status)){
      if(outstandingCents(r)<=0)action='Zahlungsstand und Rechnungsabschluss prüfen';
      else if(r.invoiceDispatchState!=='confirmed'){action='Rechnungsversand prüfen und abschliessen';priority=3;}
      else{const kind=invoiceKind(r,today);action=kind==='overdue'?'Zahlungseingang prüfen und bei Bedarf erinnern':'Auf Zahlung warten; Zahlungseingang verfolgen';priority=kind==='overdue'?1:kind==='soon'?2:4;}
    }
    add('rechnungen',r,action,{date:r.dueDate,priority});
  }
  for(const r of projects){
    if(r.status==='Abgeschlossen')continue;
    let action='Projektstatus prüfen',priority=0;
    if(['Geplant','In Arbeit','Wartet auf Kunde'].includes(r.status)){
      priority=duePriority(r.dueDate);
      if(r.status==='Wartet auf Kunde')action='Kundenrückmeldung und fehlende Angaben verfolgen';
      else if(!r.startedAt){
        const o=r.onboarding;
        action=!r.customerId?'Kunden zuordnen':typeof o?.makeRequired!=='boolean'?'Make-Bedarf klären':o.makeRequired&&!o.invitationConfirmed?'Einladung ins kundeneigene Make-Konto prüfen':!o.accessConfirmed?'Benötigte Zugänge prüfen':'Projektstart vorbereiten und dokumentieren';
      }else{const task=(r.tasks||[]).find(t=>!t.done&&t.title?.trim());action=task?'Nächster Schritt: '+task.title:'Ergebnis abnehmen und Projekt abschliessen';}
    }
    add('projekte',r,action,{date:r.dueDate,priority});
  }
  return rows.sort((a,b)=>a.priority-b.priority||(a.date||'9999').localeCompare(b.date||'9999')||a.createdAt.localeCompare(b.createdAt)||a.table.localeCompare(b.table)||String(a.id).localeCompare(String(b.id)));
}


// Bundle a business flow by exact offer/project IDs, never by company or email.
// Keep simultaneous delivery and billing work, but remove superseded lead prompts.
function processGroups(data,today,items=openProcesses(data,today),nowMs=Date.now()){
  const by=Object.fromEntries(TABLES.map(t=>[t,Object.fromEntries((data[t]||[]).map(r=>[r.id,r]))]));
  const groups={},compatible=(a,b)=>!a?.customerId||!b?.customerId||a.customerId===b.customerId;
  const activeOffers=(data.offerten||[]).filter(o=>o.status!=='Abgelehnt');
  function anchor(item,r){
    if(item.table==='offerten')return ['offerten',r];
    if(item.table==='projekte'){
      const o=by.offerten[r.offerId];return o&&compatible(r,o)?['offerten',o]:['projekte',r];
    }
    if(item.table==='rechnungen'){
      const p=by.projekte[r.projectId],direct=by.offerten[r.offerId],via=p&&by.offerten[p.offerId];
      if(p&&!compatible(r,p)||direct&&via&&direct.id!==via.id||direct&&!compatible(r,direct)||via&&!compatible(r,via))return ['rechnungen',r];
      const o=direct||via;return o?['offerten',o]:p?['projekte',p]:['rechnungen',r];
    }
    const offers=activeOffers.filter(o=>o.leadId===r.id);
    if(offers.length===1)return ['offerten',offers[0]];
    return ['leads',r];
  }
  function step(item,r){
    const x={...item,mode:item.priority===0?'check':'action'};
    const due=validDay(item.date)&&item.date<=today;
    if(item.table==='leads'&&r.status==='Kontaktiert'&&!due){x.mode='waiting';x.action=r.nextAction?'Kundenrückmeldung ausstehend: '+r.nextAction:'Auf Kundenrückmeldung warten';}
    if(item.table==='leads'&&r.nextAction&&validDay(r.followUpDate)&&r.followUpDate>today){x.mode='waiting';x.action='Geplante Rückmeldung: '+r.nextAction;}
    if(item.table==='offerten'&&r.status==='Versendet'&&!['customer_response_recorded','awaiting_lszh_confirmation','confirmed'].includes(r.onlineAcceptance?.state)&&!['sending','manual_review'].includes(r.offerDispatchState)){
      x.mode=due?'action':'waiting';x.action=due?'Offerte nachfassen':'Auf Antwort zur Offerte warten';
    }
    if(item.table==='rechnungen'&&['Offen','Teilbezahlt'].includes(r.status)&&r.invoiceDispatchState==='confirmed'&&!['sending','manual_review'].includes(r.reminderDispatch?.state)&&outstandingCents(r)>0){
      const kind=invoiceKind(r,today),last=r.reminderHistory?.at(-1),next=last?Date.parse(last.at)+7*86400000:NaN;
      if(kind!=='overdue'){x.mode='waiting';x.action=r.status==='Teilbezahlt'?'Auf restlichen Zahlungseingang warten':'Auf Zahlungseingang warten';}
      else if(Number.isFinite(next)&&nowMs<next){x.mode='waiting';x.action='Zahlung abwarten; nächste Mahnstufe frühestens '+localSwissDate(new Date(next)).split('-').reverse().join('.');}
      else{x.mode='action';x.action=(r.reminderHistory||[]).length>=3?'Offene Forderung persönlich klären':'Zahlungseingang prüfen und gegebenenfalls erinnern';}
    }
    if(item.table==='projekte'&&r.status==='Wartet auf Kunde'){
      x.mode=validDay(r.dueDate)&&r.dueDate<today?'action':'waiting';x.action=x.mode==='action'?'Ausstehende Kundenrückmeldung nachfassen':'Auf Angaben oder Freigabe des Kunden warten';
    }else if(item.table==='projekte'&&r.status==='In Arbeit'&&!r.startedAt){x.action=(r.tasks||[]).find(t=>!t.done&&t.title?.trim())?.title||'Projektstand prüfen und Umsetzung weiterführen';}
    return x;
  }
  for(const item of items){
    const r=by[item.table][item.id];if(!r)continue;
    // Qualification creates its offer already: do not ask to create it again.
    if(item.table==='leads'&&!r.nextAction&&activeOffers.some(o=>o.leadId===r.id))continue;
    const [table,parent]=anchor(item,r),key=table+':'+parent.id;
    if(!groups[key]){
      const customer=by.kunden[parent.customerId],lead=table==='leads'?parent:by.leads[parent.leadId];
      groups[key]={id:key,title:parent.title||parent.description||parent.company||parent.name||'Vorgang',company:customer?.company||lead?.company||parent.company||'',reference:table==='offerten'?(parent.status==='Angenommen'?'Auftrag ':'Offerte ')+(parent.number||'–'):table==='projekte'?'Projekt':table==='rechnungen'?'Rechnung '+String(parent.number||'').replace(/^RE-/,''):'Anfrage',steps:[]};
    }
    groups[key].steps.push(step(item,r));
  }
  const order={check:0,action:1,waiting:2};
  const compare=(a,b)=>order[a.mode]-order[b.mode]||a.priority-b.priority||(a.date||'9999').localeCompare(b.date||'9999')||a.table.localeCompare(b.table)||String(a.id).localeCompare(String(b.id));
  return Object.values(groups).map(g=>{g.steps.sort(compare);g.primary=g.steps[0];g.mode=g.primary.mode;return g;}).sort((a,b)=>compare(a.primary,b.primary)||a.id.localeCompare(b.id));
}

async function cockpitSummary(store,{today=localSwissDate(),nowMs=Date.now()}={}){
  const s=empty();const data=Object.fromEntries(TABLES.map(t=>[t,[]]));const cutoff=nowMs-24*60*60*1000;
  for(const table of TABLES){
    for await(const r of store.scan(table)){
      s.counts[table]++;data[table].push(r);
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
        const shownStatus=offerDisplayStatus(r);
        const pending=shownStatus==='Angenommen'&&r.status!=='Angenommen';
        if(pending&&['customer_response_recorded','awaiting_lszh_confirmation'].includes(r.onlineAcceptance?.state)){
          s.pendingConfirmationCount++;keepTop(s.pendingConfirmations,r,8,newest);
        }else if(pending&&r.onlineAcceptance?.state==='confirmed'){
          s.pendingAdoptionCount++;keepTop(s.pendingAdoptions,r,8,newest);
        }
        if(['Entwurf','Bereit','Versendet'].includes(shownStatus)){
          s.openOffers++;s.openOfferCents+=money(r.oneTimeCHF);
        }
        if(r.status==='Angenommen'||r.onlineAcceptance?.state==='confirmed'&&shownStatus==='Angenommen')s.acceptedMonthlyCents+=money(r.monthlyCHF);
        if(shownStatus==='Versendet'&&validDay(r.followUpDate)&&r.followUpDate<=today){
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
  s.reporting=require('./dashboard-reporting').reportingSummary(data,{today});
  s.openProcesses=openProcesses(data,today);
  s.openProcessCount=s.openProcesses.length;
  s.processGroups=processGroups(data,today,s.openProcesses,nowMs);
  return s;
}
module.exports={cockpitSummary,invoiceKind,openProcesses,processGroups};
