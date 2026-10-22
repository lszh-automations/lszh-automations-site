'use strict';

// Pure, dependency-free local CRM lifecycle. All changes are applied to the
// in-memory local JSON document and persisted together by local-preview.js.
// This is NOT a production mailer and never calls network services.
const LEAD_STATES=['Neu','Kontaktiert','Qualifiziert','Gewonnen','Verloren'];
const HOUR_MS=60*60*1000;
function fail(message){throw Object.assign(new Error(message),{status:400});}
function normalize(value){return String(value||'').trim().toLocaleLowerCase('de-CH');}
function linkedOffers(db,lead){
  return db.offerten.filter(x=>x.leadId===lead.id)
    .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}
function makeDraft(db,lead,now){
  const existing=linkedOffers(db,lead)[0];
  if(existing)return existing;
  if(!Number.isSafeInteger(db.nextOffer) || db.nextOffer<1000)db.nextOffer=1000;
  const number=String(db.nextOffer++);
  const offer={
    id:'local-offer-'+lead.id,number,leadId:lead.id,customerId:'',
    title:'Automation für '+(lead.company||lead.name||'Neuen Lead'),
    description:lead.message||'',oneTimeCHF:null,monthlyCHF:null,validUntil:'',
    status:'Entwurf',createdAt:now,updatedAt:now
  };
  // Avoid reusing a deterministic ID if the user has previously modified data.
  if(db.offerten.some(x=>x.id===offer.id))offer.id+='-'+number;
  db.offerten.push(offer);
  return offer;
}
function customerFor(db,lead){
  return db.kunden.find(c=>lead.email&&normalize(c.email)===normalize(lead.email)) ||
    db.kunden.find(c=>lead.company&&normalize(c.company)===normalize(lead.company));
}
function markWon(db,lead,now,selectedOffer){
  const offer=selectedOffer||linkedOffers(db,lead).find(x=>x.status==='Angenommen')||linkedOffers(db,lead)[0];
  if(!offer)fail('Gewonnen setzt eine bestehende Offerte voraus');
  offer.status='Angenommen';offer.updatedAt=now;
  let customer=customerFor(db,lead);
  if(!customer){
    customer={
      id:'local-customer-'+lead.id,
      company:lead.company,contactName:lead.name,email:lead.email,
      street:lead.street,postalCode:lead.postalCode,city:lead.city,
      country:lead.country,notes:'Aus qualifiziertem Website-Lead übernommen',
      status:'Aktiv',createdAt:now,updatedAt:now
    };
    if(db.kunden.some(x=>x.id===customer.id)) customer.id+='-'+db.kunden.length;
    db.kunden.push(customer);
  }
  offer.customerId=customer.id;
  let project=db.projekte.find(x=>x.offerId===offer.id);
  if(!project){
    project={
      id:'local-project-'+offer.id,customerId:customer.id,offerId:offer.id,
      title:offer.title||('Projekt für '+lead.company),
      description:offer.description||lead.message||'',
      dueDate:'',status:'Geplant',createdAt:now,updatedAt:now
    };
    if(db.projekte.some(x=>x.id===project.id))project.id+='-'+db.projekte.length;
    db.projekte.push(project);
  }
  lead.status='Gewonnen';lead.updatedAt=now;
  return {offer,customer,project};
}
function setLeadStatus(db,lead,status,now){
  if(!LEAD_STATES.includes(status))fail('Unbekannter Lead-Status');
  if(lead.status===status){
    if(status==='Qualifiziert')makeDraft(db,lead,now);
    if(status==='Gewonnen')markWon(db,lead,now);
    return;
  }
  if(status==='Gewonnen'){markWon(db,lead,now);return;}
  if(status==='Qualifiziert')makeDraft(db,lead,now);
  if(status==='Verloren'){
    for(const offer of linkedOffers(db,lead)){
      if(offer.status!=='Angenommen'){offer.status='Abgelehnt';offer.updatedAt=now;}
    }
  }
  lead.status=status;
  lead.updatedAt=now;
  if(status==='Kontaktiert')lead.contactedAt=now;
}
function setOfferStatus(db,offer,status,now){
  offer.status=status;offer.updatedAt=now;
  if(!offer.leadId)return;
  const lead=db.leads.find(x=>x.id===offer.leadId);
  if(!lead)return;
  if(status==='Angenommen')markWon(db,lead,now,offer);
  else if(status==='Abgelehnt' && lead.status!=='Gewonnen'){
    lead.status='Verloren';lead.updatedAt=now;
  }
}
function pendingReminders(db,now){
  const current=Date.parse(now);
  if(!Number.isFinite(current))return [];
  return db.leads.filter(lead=>{
    const date=Date.parse(lead.createdAt||'');
    return lead.status==='Neu' && Number.isFinite(date) &&
      current-date>=24*HOUR_MS && !lead.reminder24hAt;
  });
}
function queueReminderPreviews(db,now){
  const pending=pendingReminders(db,now);
  if(!Array.isArray(db.reminderPreviews))db.reminderPreviews=[];
  for(const lead of pending){
    lead.reminder24hAt=now;
    db.reminderPreviews.push({
      id:'reminder-'+lead.id,leadId:lead.id,createdAt:now,
      subject:'[CRM] Neuer Lead seit 24 Stunden unbearbeitet: '+(lead.company||lead.name),
      body:'Lead '+(lead.company||lead.name)+' ist seit mindestens 24 Stunden auf Neu. Bitte im CRM prüfen.',
      delivery:'preview_only_not_sent'
    });
  }
  return pending.length;
}
module.exports={LEAD_STATES,linkedOffers,makeDraft,customerFor,markWon,setLeadStatus,setOfferStatus,pendingReminders,queueReminderPreviews};
