'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildStore}=require('../cloud-records');

function fakeFirestore(){
  const storage=new Map();
  let seq=0;
  const clone=value=>JSON.parse(JSON.stringify(value));
  class Doc{
    constructor(collection,id){this.collection=collection;this.id=id;}
    get path(){return this.collection.name+'/'+this.id;}
    async get(){return snapshot(this);}
    async create(value){
      assert.equal(storage.has(this.path),false,'document must not exist');
      storage.set(this.path,clone(value));
    }
  }
  function snapshot(ref){
    const val=storage.get(ref.path);
    return {exists:val!==undefined,id:ref.id,ref,data:()=>val===undefined?undefined:clone(val)};
  }
  class Query{
    constructor(name,filter=null,order=null,limit=200,cursor=null){this.name=name;this.filter=filter;this.order=order;this.max=limit;this.cursor=cursor;}
    where(field,operator,value){
      assert.equal(operator,'==');
      return new Query(this.name,{field,value},this.order,this.max,this.cursor);
    }
    limit(n){return new Query(this.name,this.filter,this.order,n,this.cursor);}
    startAfter(doc){return new Query(this.name,this.filter,this.order,this.max,doc);}
    orderBy(field,direction){return new Query(this.name,this.filter,{field,direction},this.max,this.cursor);}
    async get(){
      let docs=[...storage.keys()].filter(key=>key.startsWith(this.name+'/'))
        .map(key=>{const id=key.slice(this.name.length+1);return snapshot(new Doc({name:this.name},id));});
      if(this.filter)docs=docs.filter(x=>x.data()[this.filter.field]===this.filter.value);
      if(this.order)docs.sort((a,b)=>{
        const x=String(a.data()[this.order.field]||'');
        const y=String(b.data()[this.order.field]||'');
        const byValue=this.order.direction==='desc'?y.localeCompare(x):x.localeCompare(y);
        return byValue||(this.order.direction==='desc'?b.id.localeCompare(a.id):a.id.localeCompare(b.id));
      });
      if(this.cursor){const at=docs.findIndex(x=>x.id===this.cursor.id);docs=at>=0?docs.slice(at+1):[];}
      docs=docs.slice(0,this.max);
      return {docs,empty:docs.length===0};
    }
  }
  class Col{
    constructor(name){this.name=name;}
    doc(id){return new Doc(this,id||('generated-'+(++seq)));}
    where(field,op,value){return new Query(this.name).where(field,op,value);}
    orderBy(field,direction){return new Query(this.name).orderBy(field,direction);}
    async *stream(){for(const [key] of storage){if(key.startsWith(this.name+'/'))yield snapshot(new Doc(this,key.slice(this.name.length+1)));}}
  }
  class Transaction{
    constructor(){this.writes=[];this.startedWriting=false;}
    async get(refOrQuery){
      assert.equal(this.startedWriting,false,'Firestore requires all reads before first write');
      return refOrQuery.get();
    }
    create(ref,value){this.startedWriting=true;this.writes.push(['create',ref,clone(value)]);}
    set(ref,value,options){this.startedWriting=true;this.writes.push(['set',ref,clone(value),options]);}
    update(ref,value){this.startedWriting=true;this.writes.push(['update',ref,clone(value)]);}
    delete(ref){this.startedWriting=true;this.writes.push(['delete',ref]);}
    commit(){
      for(const [kind,ref,value,opts] of this.writes){
        if(kind==='delete'){storage.delete(ref.path);continue;}
        const prev=storage.get(ref.path);
        if(kind==='create')assert.equal(prev,undefined,'duplicate document');
        if(kind==='update')assert.notEqual(prev,undefined,'document missing for update');
        storage.set(ref.path,kind==='create'?value:{...(kind==='set'&&opts?.merge?prev||{}:prev||{}),...value});
      }
    }
  }
  return {
    collection:name=>new Col(name),
    async runTransaction(fn){const tx=new Transaction();const result=await fn(tx);tx.commit();return result;},
    storage
  };
}
const admin={email:'crm-admin@example.ch'};
function newLead(n='Beispiel GmbH'){
  return {name:'Max Muster',company:n,email:'max@beispiel.ch',street:'Musterstrasse 12',
    postalCode:'5610',city:'Wohlen',country:'Schweiz',message:'Automationen prüfen'};
}
test('cloud staging prefix is isolated and website collection untouched',async()=>{
  const db=fakeFirestore();
  const store=buildStore(db,'lszh_crm_v2_staging_');
  const lead=await store.create('leads',newLead(),admin);
  assert.equal(lead.status,'Neu');
  assert.equal((await store.list('leads')).length,1);
  assert.equal(db.storage.has('lszh_crm_v2_leads/'+lead.id),false);
  await assert.rejects(async()=>buildStore(db,'anything_else'));
});
test('qualification creates exactly one numbered editable Firestore offer',async()=>{
  const db=fakeFirestore(),store=buildStore(db,'lszh_crm_v2_staging_');
  const lead=await store.create('leads',newLead(),admin);
  await store.update('leads',lead.id,{status:'Kontaktiert'},admin);
  assert.equal((await store.list('offerten')).length,0);
  await store.update('leads',lead.id,{status:'Qualifiziert'},admin);
  const offers=await store.list('offerten');
  assert.equal(offers.length,1);
  assert.equal(offers[0].number,'1000');
  assert.equal(offers[0].status,'Entwurf');
  assert.equal(offers[0].leadId,lead.id);
  await store.update('leads',lead.id,{status:'Qualifiziert'},admin);
  assert.equal((await store.list('offerten')).length,1);
  assert.equal((await store.list('offerten'))[0].description,'');
});
test('accepting a quote generates customer and project once and locks accepted offer',async()=>{
  const store=buildStore(fakeFirestore(),'lszh_crm_v2_staging_');
  const lead=await store.create('leads',newLead(),admin);
  await store.update('leads',lead.id,{status:'Qualifiziert'},admin);
  const offer=(await store.list('offerten'))[0];
  const accepted=await store.update('offerten',offer.id,{status:'Angenommen'},admin);
  assert.equal(accepted.status,'Angenommen');
  assert.equal((await store.get('leads',lead.id)).status,'Gewonnen');
  const customers=await store.list('kunden');
  const projects=await store.list('projekte');
  assert.equal(customers.length,1);
  assert.equal(projects.length,1);
  assert.equal(projects[0].offerId,offer.id);
  assert.equal(projects[0].customerId,customers[0].id);
  await store.update('leads',lead.id,{status:'Gewonnen'},admin);
  assert.equal((await store.list('projekte')).length,1);
  await assert.rejects(store.update('offerten',offer.id,{title:'Silent change'},admin),{status:403});
});
test('lead Won transitions offer and creates exactly one customer and project',async()=>{
  const store=buildStore(fakeFirestore(),'lszh_crm_v2_staging_');
  const lead=await store.create('leads',newLead(),admin);
  await store.update('leads',lead.id,{status:'Qualifiziert'},admin);
  await store.update('leads',lead.id,{status:'Gewonnen'},admin);
  assert.equal((await store.list('offerten'))[0].status,'Angenommen');
  assert.equal((await store.list('kunden')).length,1);
  assert.equal((await store.list('projekte')).length,1);
});
test('project tasks save without breaking won links',async()=>{
  const store=buildStore(fakeFirestore(),'lszh_crm_v2_staging_');
  const lead=await store.create('leads',newLead(),admin);
  await store.update('leads',lead.id,{status:'Qualifiziert'},admin);
  await store.update('leads',lead.id,{status:'Gewonnen'},admin);
  const project=(await store.list('projekte'))[0];
  const changed=await store.update('projekte',project.id,{status:'In Arbeit',dueDate:'2026-12-01',tasks:[{title:'Testen',done:true}]},admin);
  assert.equal(changed.status,'In Arbeit');
  assert.deepEqual(changed.tasks,[{title:'Testen',done:true}]);
  await assert.rejects(store.update('projekte',project.id,{customerId:'other'},admin),/darf nicht geändert werden/);
});
test('invoices calculate prices and retain paid lock with stable numbering',async()=>{
  const db=fakeFirestore(),store=buildStore(db,'lszh_crm_v2_staging_');
  const customer=await store.create('kunden',{company:'Kunde AG'},admin);
  const invoice=await store.create('rechnungen',{
    customerId:customer.id,description:'Leistung',dueDate:'2026-11-30',status:'Entwurf',
    items:[{title:'Einrichtung',qty:2,unitPriceCHF:249.95}]
  },admin);
  assert.equal(invoice.number,'RE-1000');
  assert.equal(invoice.amountCHF,499.9);
  await store.update('rechnungen',invoice.id,{status:'Offen'},admin);
  await assert.rejects(store.update('rechnungen',invoice.id,{status:'Bezahlt'},admin),{status:409});
  db.storage.get('lszh_crm_v2_staging_rechnungen/'+invoice.id).invoiceDispatchState='confirmed';
  const paid=await store.recordInvoicePayment(invoice.id,{paymentId:'00000000-0000-4000-8000-000000000001',
    amountCHF:'499.90',paidOn:'2026-10-24',method:'Banküberweisung',reference:'BANK-E2E-1'},admin);
  assert.equal(paid.status,'Bezahlt');
  assert.equal(paid.paymentHistory.length,1);
  assert.equal(paid.outstandingCHF,0);
  assert.ok(paid.paidAt);
  await assert.rejects(store.update('rechnungen',invoice.id,{description:'changed'},admin),{status:403});
});
test('24-hour new lead reminders are informational only',async()=>{
  const db=fakeFirestore(),store=buildStore(db,'lszh_crm_v2_staging_');
  const lead=await store.create('leads',newLead(),admin);
  db.storage.get('lszh_crm_v2_staging_leads/'+lead.id).createdAt='2026-10-01T00:00:00Z';
  const reminders=await store.reminders();
  assert.equal(reminders.length,1);
  assert.equal(reminders[0].delivery,'preview_only_not_sent');
});

test('a fresh lead can be deleted; processed leads cannot return to Neu or be deleted',async()=>{
  const db=fakeFirestore(),store=buildStore(db,'lszh_crm_v2_staging_');
  const fresh=await store.create('leads',newLead('Sofort löschbar AG'),admin);
  const removed=await store.remove('leads',fresh.id);
  assert.deepEqual(removed,{id:fresh.id,deleted:true});
  assert.equal(await store.get('leads',fresh.id),null);
  assert.equal((await store.list('leads')).length,0);
  await assert.rejects(store.remove('leads',fresh.id),{status:404});
  const lead=await store.create('leads',newLead('Bearbeitet GmbH'),admin);
  await store.update('leads',lead.id,{status:'Kontaktiert'},admin);
  for(const changedStatus of ['Kontaktiert','Qualifiziert','Verloren']){
    if(changedStatus!=='Kontaktiert')await store.update('leads',lead.id,{status:changedStatus},admin);
    await assert.rejects(store.update('leads',lead.id,{status:'Neu'},admin),{status:409});
    await assert.rejects(store.remove('leads',lead.id),{status:409});
    assert.equal((await store.get('leads',lead.id)).status,changedStatus);
  }
  await store.update('leads',lead.id,{status:'Gewonnen'},admin);
  await assert.rejects(store.update('leads',lead.id,{status:'Neu'},admin),{status:409});
  await assert.rejects(store.remove('leads',lead.id),{status:409});
});
test('fresh leads with linked offer are not deleted and other registers cannot be deleted',async()=>{
  const db=fakeFirestore(),store=buildStore(db,'lszh_crm_v2_staging_');
  const lead=await store.create('leads',newLead(),admin);
  db.storage.set('lszh_crm_v2_staging_offerten/manual-offer',{
    leadId:lead.id,status:'Entwurf',createdAt:new Date().toISOString()
  });
  await assert.rejects(store.remove('leads',lead.id),{status:409});
  assert.ok(await store.get('leads',lead.id));
  for(const table of ['kunden','offerten','rechnungen','projekte']){
    await assert.rejects(store.remove(table,'some-id'),{status:405});
  }
});

test('contact log is append-only, audited and marks a reached new lead as contacted',async()=>{
  const db=fakeFirestore(),store=buildStore(db,'lszh_crm_v2_staging_');
  const lead=await store.create('leads',newLead(),admin);
  const missed=await store.addContact(lead.id,{
    channel:'Telefon',outcome:'Nicht erreicht',note:'  Mailbox erreicht  '
  },admin);
  assert.equal(missed.note,'Mailbox erreicht');
  assert.equal(missed.channel,'Telefon');
  assert.equal(missed.createdBy,admin.email);
  assert.match(missed.id,/^[a-f0-9-]{36}$/);
  assert.equal((await store.get('leads',lead.id)).status,'Neu');
  await store.addContact(lead.id,{channel:'Telefon',outcome:'Erreicht',note:'Bedarf besprochen'},admin);
  const after=await store.get('leads',lead.id);
  assert.equal(after.status,'Kontaktiert');
  assert.equal(after.contactHistory.length,2);
  assert.equal(after.contactHistory[0].note,'Mailbox erreicht');
  assert.equal(after.contactHistory[1].note,'Bedarf besprochen');
  assert.ok(after.lastContactAt);
  await store.addContact(lead.id,{channel:'E-Mail',outcome:'Nachricht gesendet',note:'Termin angefragt'},admin);
  assert.equal((await store.get('leads',lead.id)).status,'Kontaktiert');
  await assert.rejects(store.update('leads',lead.id,{contactHistory:[]},admin),{status:400});
});
test('invalid contact entries are rejected; missing leads are not silently recreated',async()=>{
  const db=fakeFirestore(),store=buildStore(db,'lszh_crm_v2_staging_');
  const lead=await store.create('leads',newLead(),admin);
  for(const entry of [
    {channel:'SMS',outcome:'Erreicht',note:'Hallo'},
    {channel:'Telefon',outcome:'Anderes',note:'Hallo'},
    {channel:'Telefon',outcome:'Erreicht',note:' '},
    {channel:'Telefon',outcome:'Erreicht',note:'x'.repeat(1501)},
    {channel:'Telefon',outcome:'Erreicht',note:'Hallo',status:'Gewonnen'}
  ])await assert.rejects(store.addContact(lead.id,entry,admin),{status:400});
  assert.equal((await store.get('leads',lead.id)).contactHistory,undefined);
  await assert.rejects(store.addContact('unknown-id',{
    channel:'Telefon',outcome:'Erreicht',note:'Test'
  },admin),{status:404});
});
test('follow-up and qualification data persist without affecting other records',async()=>{
  const db=fakeFirestore(),store=buildStore(db,'lszh_crm_v2_staging_');
  const lead=await store.create('leads',newLead(),admin);
  await assert.rejects(store.update('leads',lead.id,{nextAction:'Rückruf'},admin),{status:400});
  await assert.rejects(store.update('leads',lead.id,{
    nextAction:'Rückruf',followUpDate:'2026-02-30'
  },admin),{status:400});
  await store.update('leads',lead.id,{
    nextAction:'Angebot besprechen',followUpDate:'2026-10-27',
    currentProcess:'Excel',systems:'Google Workspace',mainProblem:'Doppelarbeit',
    desiredResult:'Automatisierte Buchungen',budgetRange:'CHF 1’000–5’000',
    qualificationNotes:'MVP zuerst'
  },admin);
  const saved=await store.get('leads',lead.id);
  assert.equal(saved.status,'Neu');
  assert.equal(saved.followUpDate,'2026-10-27');
  assert.equal(saved.nextAction,'Angebot besprechen');
  assert.equal(saved.budgetRange,'CHF 1’000–5’000');
  await store.update('leads',lead.id,{status:'Kontaktiert'},admin);
  await store.update('leads',lead.id,{status:'Qualifiziert'},admin);
  const offers=await store.list('offerten');
  assert.equal(offers.length,1);
  assert.equal(offers[0].description,'','Qualifizierte Leads dürfen keine vorausgefüllte Leistungsbeschreibung erzeugen');
  await store.update('leads',lead.id,{qualificationNotes:'Später ergänzt'},admin);
  assert.equal((await store.list('offerten'))[0].description,offers[0].description);
  await store.update('leads',lead.id,{nextAction:'',followUpDate:''},admin);
  const done=await store.get('leads',lead.id);
  assert.equal(done.nextAction,'');
  assert.equal(done.followUpDate,'');
  assert.equal((await store.list('offerten')).length,1);
});

test('manual offer delivery records actual dispatch once, locks quote and tracks follow-ups',async()=>{
  const store=buildStore(fakeFirestore(),'lszh_crm_v2_staging_');
  const lead=await store.create('leads',newLead('Offertenkunde GmbH'),admin);
  await store.update('leads',lead.id,{status:'Qualifiziert'},admin);
  const offer=(await store.list('offerten'))[0];
  const validUntil=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const nextFollowUp=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  const secondFollowUp=new Date(Date.now()+14*86400000).toISOString().slice(0,10);
  const position={title:'Termin-Automation',mode:'einmalig',qty:1,unitPriceCHF:450};
  await assert.rejects(store.recordOfferDispatch(offer.id,{followUpDate:nextFollowUp},admin),{status:409});
  await store.update('offerten',offer.id,{status:'Bereit'},admin);
  await assert.rejects(store.recordOfferDispatch(offer.id,{followUpDate:nextFollowUp},admin),{status:409});
  await store.update('offerten',offer.id,{items:[position],validUntil},admin);
  await assert.rejects(store.update('offerten',offer.id,{status:'Versendet'},admin),{status:409});
  const sent=await store.recordOfferDispatch(offer.id,{followUpDate:nextFollowUp},admin);
  assert.equal(sent.status,'Versendet');
  assert.equal(sent.sentTo,lead.email);
  assert.equal(sent.sentBy,admin.email);
  assert.ok(sent.sentAt);
  assert.equal(sent.followUpDate,nextFollowUp);
  assert.equal(sent.followUpCount,0);
  assert.equal(sent.followUpHistory.length,0);
  await assert.rejects(store.recordOfferDispatch(offer.id,{followUpDate:nextFollowUp},admin),{status:409});
  await assert.rejects(store.update('offerten',offer.id,{status:'Entwurf'},admin),{status:409});
  await assert.rejects(store.update('offerten',offer.id,{title:'Unerlaubt geändert'},admin),{status:409});
  await assert.rejects(store.update('offerten',offer.id,{status:'Bereit'},admin),{status:409});
  await assert.rejects(store.recordOfferFollowUp(offer.id,{followUpDate:'2020-01-01'},admin),{status:400});
  const first=await store.recordOfferFollowUp(offer.id,{
    followUpDate:secondFollowUp,note:'Kunde telefonisch erinnert'
  },admin);
  assert.equal(first.followUpCount,1);
  assert.equal(first.followUpDate,secondFollowUp);
  assert.equal(first.followUpHistory[0].note,'Kunde telefonisch erinnert');
  assert.equal(first.followUpHistory[0].by,admin.email);
  const accepted=await store.update('offerten',offer.id,{status:'Angenommen'},admin);
  assert.equal(accepted.status,'Angenommen');
  assert.equal((await store.get('leads',lead.id)).status,'Gewonnen');
  assert.equal((await store.list('kunden')).length,1);
  assert.equal((await store.list('projekte')).length,1);
  await assert.rejects(store.recordOfferFollowUp(offer.id,{followUpDate:secondFollowUp},admin),{status:409});
  await assert.rejects(store.update('offerten',offer.id,{status:'Abgelehnt'},admin),{status:403});
});
test('declined sent offer marks lead lost; duplicate sent requests cannot resend',async()=>{
  const store=buildStore(fakeFirestore(),'lszh_crm_v2_staging_');
  const lead=await store.create('leads',newLead(),admin);
  await store.update('leads',lead.id,{status:'Qualifiziert'},admin);
  const offer=(await store.list('offerten'))[0];
  const validUntil=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const followUpDate=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  await store.update('offerten',offer.id,{
    status:'Bereit',validUntil,
    items:[{title:'Setup',mode:'monatlich',qty:1,unitPriceCHF:199}]
  },admin);
  await store.recordOfferDispatch(offer.id,{followUpDate},admin);
  await store.update('offerten',offer.id,{status:'Abgelehnt'},admin);
  assert.equal((await store.get('leads',lead.id)).status,'Verloren');
  assert.equal((await store.get('offerten',offer.id)).status,'Abgelehnt');
  await assert.rejects(store.recordOfferDispatch(offer.id,{followUpDate},admin),{status:409});
});

test('directly qualified lead creates an offer with blank description; explicit manual description persists',async()=>{
  const store=buildStore(fakeFirestore(),'lszh_crm_v2_staging_');
  const lead=await store.create('leads',{
    ...newLead('Beispiel AG'),status:'Qualifiziert',currentProcess:'Excel',
    systems:'ERP',desiredResult:'Schnellerer Workflow',qualificationNotes:'Intern'
  },admin);
  const offers=await store.list('offerten');
  assert.equal(offers.length,1);
  assert.equal(offers[0].description,'');
  await store.update('offerten',offers[0].id,{description:'Manuell erstellte Leistungsbeschreibung'},admin);
  assert.equal((await store.get('offerten',offers[0].id)).description,'Manuell erstellte Leistungsbeschreibung');
  assert.equal((await store.get('leads',lead.id)).currentProcess,'Excel');
  await store.update('leads',lead.id,{qualificationNotes:'Geändert'},admin);
  assert.equal((await store.get('offerten',offers[0].id)).description,'Manuell erstellte Leistungsbeschreibung');
});

test('automatic quote send is reserved atomically and blocks changes until Gmail confirms',async()=>{
  const store=buildStore(fakeFirestore(),'lszh_crm_v2_staging_');
  const lead=await store.create('leads',newLead(),admin);
  await store.update('leads',lead.id,{status:'Qualifiziert'},admin);
  const offer=(await store.list('offerten'))[0];
  const validUntil=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const followUpDate=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  await store.update('offerten',offer.id,{
    status:'Bereit',validUntil,
    items:[{title:'LSZH Automation',qty:1,mode:'einmalig',unitPriceCHF:499}]
  },admin);
  const claim=await store.claimOfferSend(offer.id,{followUpDate},admin);
  assert.equal(claim.to,lead.email);
  assert.equal(claim.offer.status,'Bereit');
  assert.match(claim.attemptId,/^[a-f0-9-]{36}$/);
  assert.equal((await store.get('offerten',offer.id)).offerDispatchState,'sending');
  await assert.rejects(store.claimOfferSend(offer.id,{followUpDate},admin),{status:409});
  await assert.rejects(store.update('offerten',offer.id,{title:'Changed during send'},admin),{status:409});
  await assert.rejects(store.recordOfferDispatch(offer.id,{followUpDate},admin),{status:409});
  await assert.rejects(store.finishOfferSend(offer.id,'wrong','confirmed','fake'),{status:409});
  const done=await store.finishOfferSend(offer.id,claim.attemptId,'confirmed','gmail-ABC');
  assert.equal(done.status,'Versendet');
  assert.equal(done.offerDispatchState,'confirmed');
  assert.equal(done.offerDispatchProviderId,'gmail-ABC');
  assert.equal(done.sentTo,lead.email);
  assert.equal(done.followUpDate,followUpDate);
  await assert.rejects(store.claimOfferSend(offer.id,{followUpDate},admin),{status:409});
  const accepted=await store.update('offerten',offer.id,{status:'Angenommen'},admin);
  assert.equal(accepted.status,'Angenommen');
  assert.equal((await store.list('kunden')).length,1);
  assert.equal((await store.list('projekte')).length,1);
});
test('lost Make receipt requires manual reconciliation and never silently retries',async()=>{
  const store=buildStore(fakeFirestore(),'lszh_crm_v2_staging_');
  const lead=await store.create('leads',newLead(),admin);
  await store.update('leads',lead.id,{status:'Qualifiziert'},admin);
  const offer=(await store.list('offerten'))[0];
  const validUntil=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const followUpDate=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  await store.update('offerten',offer.id,{
    status:'Bereit',validUntil,
    items:[{title:'Automation',qty:1,mode:'monatlich',unitPriceCHF:189}]
  },admin);
  let claim=await store.claimOfferSend(offer.id,{followUpDate},admin);
  await store.finishOfferSend(offer.id,claim.attemptId,'manual_review','delivery_unconfirmed');
  assert.equal((await store.get('offerten',offer.id)).offerDispatchState,'manual_review');
  await assert.rejects(store.claimOfferSend(offer.id,{followUpDate},admin),{status:409});
  await assert.rejects(store.update('offerten',offer.id,{title:'Unsafe'},admin),{status:409});
  await assert.rejects(store.recordOfferDispatch(offer.id,{followUpDate},admin),{status:409});
  const reviewed=await store.resolveOfferSend(offer.id,'not_sent',admin);
  assert.equal(reviewed.status,'Bereit');
  assert.equal(reviewed.offerDispatchState,'not_sent');
  claim=await store.claimOfferSend(offer.id,{followUpDate},admin);
  assert.notEqual(claim.attemptId,reviewed.offerDispatchAttemptId);
  await store.finishOfferSend(offer.id,claim.attemptId,'manual_review');
  const confirmed=await store.resolveOfferSend(offer.id,'confirmed',admin);
  assert.equal(confirmed.status,'Versendet');
  assert.equal(confirmed.offerDispatchProviderId,'manual_verification');
  await assert.rejects(store.resolveOfferSend(offer.id,'not_sent',admin),{status:409});
});
test('PDF preparation failure unlocks safe new send attempt without pretending to mail',async()=>{
  const store=buildStore(fakeFirestore(),'lszh_crm_v2_staging_');
  const lead=await store.create('leads',newLead(),admin);
  await store.update('leads',lead.id,{status:'Qualifiziert'},admin);
  const offer=(await store.list('offerten'))[0];
  const until=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const due=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  await store.update('offerten',offer.id,{status:'Bereit',validUntil:until,
    items:[{title:'Setup',qty:1,mode:'einmalig',unitPriceCHF:100}]},admin);
  let claim=await store.claimOfferSend(offer.id,{followUpDate:due},admin);
  const prepared=await store.finishOfferSend(offer.id,claim.attemptId,'preparation_failed');
  assert.equal(prepared.status,'Bereit');
  assert.equal(prepared.offerDispatchState,'preparation_failed');
  claim=await store.claimOfferSend(offer.id,{followUpDate:due},admin);
  assert.ok(claim.attemptId);
});

test('crashed send attempt remains non-retryable until five-minute manual review',async()=>{
  const db=fakeFirestore(),store=buildStore(db,'lszh_crm_v2_staging_');
  const lead=await store.create('leads',newLead(),admin);
  await store.update('leads',lead.id,{status:'Qualifiziert'},admin);
  const offer=(await store.list('offerten'))[0];
  const due=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  const until=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  await store.update('offerten',offer.id,{
    status:'Bereit',validUntil:until,
    items:[{title:'Automationen',qty:1,unitPriceCHF:100,mode:'einmalig'}]
  },admin);
  await store.claimOfferSend(offer.id,{followUpDate:due},admin);
  await assert.rejects(store.resolveOfferSend(offer.id,'not_sent',admin),{status:409});
  const raw=db.storage.get('lszh_crm_v2_staging_offerten/'+offer.id);
  raw.offerDispatchRequestedAt=new Date(Date.now()-6*60000).toISOString();
  const reconciled=await store.resolveOfferSend(offer.id,'not_sent',admin);
  assert.equal(reconciled.offerDispatchState,'not_sent');
  assert.equal(reconciled.status,'Bereit');
  const second=await store.claimOfferSend(offer.id,{followUpDate:due},admin);
  assert.ok(second.attemptId);
});

test('invoice send transaction locks the snapshot, confirms delivery only once, then allows marking paid',async()=>{
  const db=fakeFirestore(),store=buildStore(db,'lszh_crm_v2_staging_');
  const customer=await store.create('kunden',{company:'Buerro AG',email:'rechnung@buerro.ch',
    street:'Marktgasse 5',postalCode:'8000',city:'Zuerich',country:'CH'},admin);
  const inv=await store.create('rechnungen',{customerId:customer.id,description:'Service',
    dueDate:'2026-11-30',status:'Offen',items:[{title:'Consulting',qty:1,unitPriceCHF:250}]},admin);
  const claim=await store.claimInvoiceSend(inv.id,admin);
  assert.equal(claim.invoice.number,inv.number);
  assert.equal(claim.to,customer.email);
  assert.equal((await store.get('rechnungen',inv.id)).invoiceDispatchState,'sending');
  await assert.rejects(store.claimInvoiceSend(inv.id,admin),{status:409});
  await assert.rejects(store.update('rechnungen',inv.id,{items:[{title:'Andere',qty:1,unitPriceCHF:99}]},admin),{status:409});
  const done=await store.finishInvoiceSend(inv.id,claim.attemptId,'confirmed','gmail-RE1000');
  assert.equal(done.invoiceDispatchState,'confirmed');
  assert.equal(done.invoiceDispatchProviderId,'gmail-RE1000');
  assert.equal(done.status,'Offen','invoice payment status never changes on email send');
  assert.equal(done.invoiceSentTo,customer.email);
  await assert.rejects(store.finishInvoiceSend(inv.id,claim.attemptId,'confirmed','gmail-second'),{status:409});
  await assert.rejects(store.claimInvoiceSend(inv.id,admin),{status:409});
  await assert.rejects(store.update('rechnungen',inv.id,{description:'Changed'},admin),{status:409});
  const paid=await store.recordInvoicePayment(inv.id,{paymentId:'00000000-0000-4000-8000-000000000002',
    amountCHF:'250.00',paidOn:'2026-10-24',method:'TWINT',reference:'TWINT-250'},admin);
  assert.equal(paid.status,'Bezahlt');assert.ok(paid.paidAt);
  assert.equal(paid.invoiceSentTo,customer.email);
});
test('invoice preparation_failed releases claim; uncertain delivery needs manual mailbox review',async()=>{
  const db=fakeFirestore(),store=buildStore(db,'lszh_crm_v2_staging_');
  const customer=await store.create('kunden',{company:'Demo AG',email:'rechnung@demo.ch',
    street:'Strasse 1',postalCode:'5610',city:'Wohlen',country:'CH'},admin);
  const inv=await store.create('rechnungen',{customerId:customer.id,description:'Consulting',
    dueDate:'2026-11-20',status:'Offen',items:[{title:'Setup',qty:2,unitPriceCHF:30}]},admin);
  const one=await store.claimInvoiceSend(inv.id,admin);
  await store.finishInvoiceSend(inv.id,one.attemptId,'preparation_failed');
  const two=await store.claimInvoiceSend(inv.id,admin);
  assert.notEqual(one.attemptId,two.attemptId);
  await store.finishInvoiceSend(inv.id,two.attemptId,'manual_review','delivery_unconfirmed');
  await assert.rejects(store.claimInvoiceSend(inv.id,admin),{status:409});
  await assert.rejects(store.update('rechnungen',inv.id,{status:'Bezahlt'},admin),{status:409});
  const resolved=await store.resolveInvoiceSend(inv.id,'not_sent',admin);
  assert.equal(resolved.invoiceDispatchState,'not_sent');
  const three=await store.claimInvoiceSend(inv.id,admin);
  await store.finishInvoiceSend(inv.id,three.attemptId,'manual_review');
  const reviewed=await store.resolveInvoiceSend(inv.id,'confirmed',admin);
  assert.equal(reviewed.invoiceDispatchState,'confirmed');
  assert.equal(reviewed.invoiceDispatchProviderId,'manual_verification');
  await assert.rejects(store.resolveInvoiceSend(inv.id,'not_sent',admin),{status:409});
});
test('invoice dispatch validates linked customer email and complete address before writing a claim',async()=>{
  const store=buildStore(fakeFirestore(),'lszh_crm_v2_staging_');
  const customer=await store.create('kunden',{company:'Adresse fehlt',email:'rechnung@adresse.ch'},admin);
  const inv=await store.create('rechnungen',{customerId:customer.id,description:'Leistung',
    dueDate:'2026-11-30',status:'Offen',items:[{title:'Setup',qty:1,unitPriceCHF:35}]},admin);
  await assert.rejects(store.claimInvoiceSend(inv.id,admin),{status:409});
  assert.equal((await store.get('rechnungen',inv.id)).invoiceDispatchState,undefined);
});

test('invoice send rejects a customer street without Swiss QR house number',async()=>{
  const store=buildStore(fakeFirestore(),'lszh_crm_v2_staging_');
  const c=await store.create('kunden',{company:'Daten AG',email:'billing@daten.ch',
    street:'Musterstrasse',postalCode:'8000',city:'Zuerich',country:'CH'},admin);
  const inv=await store.create('rechnungen',{customerId:c.id,description:'Service',
    dueDate:'2026-11-30',status:'Offen',items:[{title:'Setup',qty:1,unitPriceCHF:100}]},admin);
  await assert.rejects(store.claimInvoiceSend(inv.id,admin),{status:409});
  assert.equal((await store.get('rechnungen',inv.id)).invoiceDispatchState,undefined);
});

test('invoice settlement requires confirmed send, books partial amounts, never double-posts a retry',async()=>{
  const db=fakeFirestore(),store=buildStore(db,'lszh_crm_v2_staging_');
  const c=await store.create('kunden',{company:'Teilzahlung GmbH'},admin);
  const inv=await store.create('rechnungen',{customerId:c.id,description:'Jahresservice',
    status:'Offen',dueDate:'2026-11-30',items:[{title:'Dienstleistung',qty:1,unitPriceCHF:199.95}]},admin);
  const first={paymentId:'00000000-0000-4000-8000-000000000003',amountCHF:'50.00',
    paidOn:'2026-10-24',method:'Banküberweisung',reference:'BANK-TEIL-1'};
  await assert.rejects(store.recordInvoicePayment(inv.id,first,admin),{status:409});
  db.storage.get('lszh_crm_v2_staging_rechnungen/'+inv.id).invoiceDispatchState='confirmed';
  const partial=await store.recordInvoicePayment(inv.id,first,admin);
  assert.equal(partial.status,'Teilbezahlt');
  assert.equal(partial.paidAmountCHF,50);
  assert.equal(partial.outstandingCHF,149.95);
  assert.equal(partial.paymentHistory.length,1);
  const replay=await store.recordInvoicePayment(inv.id,first,admin);
  assert.equal(replay.paymentHistory.length,1);
  await assert.rejects(store.recordInvoicePayment(inv.id,{...first,amountCHF:'60.00'},admin),{status:409});
  await assert.rejects(store.recordInvoicePayment(inv.id,{...first,
    paymentId:'00000000-0000-4000-8000-000000000004'},admin),{status:409});
  await assert.rejects(store.recordInvoicePayment(inv.id,{...first,
    paymentId:'00000000-0000-4000-8000-000000000005',reference:'NEW',amountCHF:'149.96'},admin),{status:409});
  await assert.rejects(store.update('rechnungen',inv.id,{status:'Storniert'},admin),{status:403});
  const finalPayment={paymentId:'00000000-0000-4000-8000-000000000006',amountCHF:'149.95',
    paidOn:'2026-10-24',method:'Banküberweisung',reference:'BANK-TEIL-2'};
  const done=await store.recordInvoicePayment(inv.id,finalPayment,admin);
  assert.equal(done.status,'Bezahlt');
  assert.equal(done.paidAmountCHF,199.95);
  assert.equal(done.outstandingCHF,0);
  assert.equal(done.paymentHistory.length,2);
  assert.ok(done.paidAt);
  const replayFinal=await store.recordInvoicePayment(inv.id,finalPayment,admin);
  assert.equal(replayFinal.paymentHistory.length,2);
  const correction={paymentId:finalPayment.paymentId,reversalId:'00000000-0000-4000-8000-000000000011',
    reason:'Betrag wurde irrtümlich verbucht'};
  const reversed=await store.reverseInvoicePayment(inv.id,correction,admin);
  assert.equal(reversed.status,'Teilbezahlt');
  assert.equal(reversed.paidAmountCHF,50);
  assert.equal(reversed.outstandingCHF,149.95);
  assert.equal(reversed.paidAt,null);
  assert.equal(reversed.paymentHistory.length,2);
  assert.ok(reversed.paymentHistory[1].voidedAt);
  assert.equal(reversed.paymentHistory[1].voidReason,correction.reason);
  const replayReverse=await store.reverseInvoicePayment(inv.id,correction,admin);
  assert.equal(replayReverse.paymentHistory.length,2);
  await assert.rejects(store.reverseInvoicePayment(inv.id,{...correction,
    reversalId:'00000000-0000-4000-8000-000000000012'},admin),{status:409});
  await assert.rejects(store.reverseInvoicePayment(inv.id,{...correction,
    paymentId:'00000000-0000-4000-8000-000000000013'},admin),{status:404});
});
test('invoice payment rejects future booking date, fake amount, unsafe fields and overpayment',async()=>{
  const db=fakeFirestore(),store=buildStore(db,'lszh_crm_v2_staging_');
  const c=await store.create('kunden',{company:'Kontroll AG'},admin);
  const inv=await store.create('rechnungen',{customerId:c.id,description:'Support',
    status:'Offen',dueDate:'2026-11-30',items:[{title:'Monat',qty:1,unitPriceCHF:80}]},admin);
  db.storage.get('lszh_crm_v2_staging_rechnungen/'+inv.id).invoiceDispatchState='confirmed';
  const payment={paymentId:'00000000-0000-4000-8000-000000000007',amountCHF:'12.00',
    paidOn:'2026-10-24',method:'Bar',reference:''};
  for(const invalid of [
    {...payment,paidOn:'2099-01-01'}, {...payment,paidOn:'2026-02-30'},
    {...payment,amountCHF:'12.001'}, {...payment,amountCHF:'0'},
    {...payment,method:'Bitcoin'}, {...payment,amountCHF:'81.00'},
    {...payment,admin:true},
  ])await assert.rejects(store.recordInvoicePayment(inv.id,invalid,admin));
  assert.equal((await store.get('rechnungen',inv.id)).paymentHistory,undefined);
});

test('manual invoice reminders require an overdue sent unpaid bill and are never automatic',async()=>{
  const db=fakeFirestore(),store=buildStore(db,'lszh_crm_v2_staging_');
  const customer=await store.create('kunden',{company:'Remind AG',email:'debitoren@remind.ch'},admin);
  const inv=await store.create('rechnungen',{customerId:customer.id,description:'Automation',
    invoiceDate:'2026-09-01',dueDate:'2026-10-01',status:'Offen',
    items:[{title:'Setup',qty:1,unitPriceCHF:100}]},admin);
  const first={reminderId:'00000000-0000-4000-8000-000000000008',kind:'Zahlungserinnerung'};
  await assert.rejects(store.recordInvoiceReminder(inv.id,first,admin),{status:409});
  db.storage.get('lszh_crm_v2_staging_rechnungen/'+inv.id).invoiceDispatchState='confirmed';
  const saved=await store.recordInvoiceReminder(inv.id,first,admin);
  assert.equal(saved.reminderHistory.length,1);
  assert.equal(saved.reminderHistory[0].delivery,'operator_confirmed_external');
  assert.equal(saved.reminderHistory[0].recipient,customer.email);
  assert.equal((await store.recordInvoiceReminder(inv.id,first,admin)).reminderHistory.length,1);
  await assert.rejects(store.recordInvoiceReminder(inv.id,{
    ...first,kind:'1. Mahnung'},admin),{status:409});
  await assert.rejects(store.recordInvoiceReminder(inv.id,{
    reminderId:'00000000-0000-4000-8000-000000000009',kind:'2. Mahnung'},admin),{status:409});
  await assert.rejects(store.recordInvoiceReminder(inv.id,{
    reminderId:'00000000-0000-4000-8000-000000000010',kind:'1. Mahnung'},admin),{status:409});
  assert.equal((await store.get('rechnungen',inv.id)).reminderHistory.length,1);
});


test('all three manual reminder stages: strict sequence, 7-day boundary, immutable receipts and idempotent retries',async()=>{
  // All date manipulation is restricted to this synthetic in-memory staging Firestore.
  // It simulates time passing; no Gmail/Make dispatch or productive collection exists.
  const db=fakeFirestore(),store=buildStore(db,'lszh_crm_v2_staging_');
  const customer=await store.create('kunden',{
    company:'TEST_ONLY Mahnstufen AG',email:'debitoren@qa.invalid'
  },admin);
  const invoice=await store.create('rechnungen',{
    customerId:customer.id,description:'TEST_ONLY Mahnstufenablauf',
    invoiceDate:'2020-01-01',dueDate:'2020-01-31',status:'Offen',
    items:[{title:'Test ohne Versand',qty:1,unitPriceCHF:199.95}]
  },admin);
  const raw=db.storage.get('lszh_crm_v2_staging_rechnungen/'+invoice.id);
  raw.invoiceDispatchState='confirmed'; // Synthetic receipt is in-memory only.
  const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
  const first={reminderId:uuid(201),kind:'Zahlungserinnerung'};
  const second={reminderId:uuid(202),kind:'1. Mahnung'};
  const third={reminderId:uuid(203),kind:'2. Mahnung'};
  const receipt=await store.recordInvoiceReminder(invoice.id,first,admin);
  assert.equal(receipt.reminderHistory.length,1);
  assert.deepEqual(receipt.reminderHistory.map(x=>x.kind),['Zahlungserinnerung']);
  assert.equal(receipt.lastReminderKind,'Zahlungserinnerung');
  assert.equal(receipt.reminderHistory[0].reminderId,first.reminderId);
  assert.equal(receipt.reminderHistory[0].recipient,customer.email);
  assert.equal(receipt.reminderHistory[0].by,admin.email);
  assert.equal(receipt.reminderHistory[0].outstandingCHF,199.95);
  assert.equal(receipt.reminderHistory[0].delivery,'operator_confirmed_external');
  assert.ok(Number.isFinite(Date.parse(receipt.reminderHistory[0].at)));
  assert.equal(receipt.status,'Offen');
  assert.equal(receipt.paidAmountCHF,undefined,'logging a reminder must not fabricate payment');
  const firstAt=receipt.reminderHistory[0].at;
  const repeat=await store.recordInvoiceReminder(invoice.id,first,admin);
  assert.equal(repeat.reminderHistory.length,1);
  assert.equal(repeat.reminderHistory[0].at,firstAt,'retry must keep audit timestamp');
  await assert.rejects(store.recordInvoiceReminder(invoice.id,{
    reminderId:first.reminderId,kind:'1. Mahnung'
  },admin),{status:409});
  await assert.rejects(store.recordInvoiceReminder(invoice.id,third,admin),{status:409});
  await assert.rejects(store.recordInvoiceReminder(invoice.id,second,admin),{status:409});
  // The fake transaction replaces the stored record object at each commit;
  // always refetch it after a reminder write before manipulating synthetic time.
  const saved=()=>db.storage.get('lszh_crm_v2_staging_rechnungen/'+invoice.id);
  // Just below seven full 24-hour periods: forbidden.
  saved().reminderHistory[0].at=new Date(Date.now()-7*86400000+120000).toISOString();
  await assert.rejects(store.recordInvoiceReminder(invoice.id,second,admin),{status:409});
  // Just above seven full 24-hour periods: allowed.
  saved().reminderHistory[0].at=new Date(Date.now()-7*86400000-120000).toISOString();
  const afterSecond=await store.recordInvoiceReminder(invoice.id,second,admin);
  assert.deepEqual(afterSecond.reminderHistory.map(x=>x.kind),['Zahlungserinnerung','1. Mahnung']);
  assert.equal(afterSecond.reminderHistory[1].by,admin.email);
  assert.equal(afterSecond.reminderHistory[1].outstandingCHF,199.95);
  assert.equal(afterSecond.reminderHistory[1].delivery,'operator_confirmed_external');
  assert.equal(afterSecond.reminderHistory[1].recipient,customer.email);
  assert.equal(afterSecond.lastReminderKind,'1. Mahnung');
  assert.equal((await store.recordInvoiceReminder(invoice.id,second,admin)).reminderHistory.length,2);
  await assert.rejects(store.recordInvoiceReminder(invoice.id,third,admin),{status:409});
  saved().reminderHistory[1].at=new Date(Date.now()-7*86400000+120000).toISOString();
  await assert.rejects(store.recordInvoiceReminder(invoice.id,third,admin),{status:409});
  saved().reminderHistory[1].at=new Date(Date.now()-7*86400000-120000).toISOString();
  const afterThird=await store.recordInvoiceReminder(invoice.id,third,admin);
  assert.deepEqual(afterThird.reminderHistory.map(x=>x.kind),[
    'Zahlungserinnerung','1. Mahnung','2. Mahnung'
  ]);
  assert.equal(afterThird.lastReminderKind,'2. Mahnung');
  assert.equal(afterThird.reminderHistory[2].outstandingCHF,199.95);
  assert.equal((await store.recordInvoiceReminder(invoice.id,third,admin)).reminderHistory.length,3);
  await assert.rejects(store.recordInvoiceReminder(invoice.id,{
    reminderId:uuid(204),kind:'2. Mahnung'
  },admin),{status:409});
  await assert.rejects(store.recordInvoiceReminder(invoice.id,{
    reminderId:uuid(205),kind:'3. Mahnung'
  },admin),{status:400});
  const completed=await store.get('rechnungen',invoice.id);
  assert.equal(completed.reminderHistory.length,3,'at most three audit entries');
  assert.equal(completed.paymentHistory,undefined,'dunning never posts cash');
  assert.equal(completed.status,'Offen','dunning never changes invoice status');
});

test('reminder prerequisites: no pending invoice send, no early dunning, no customer email, no settled invoice',async()=>{
  const db=fakeFirestore(),store=buildStore(db,'lszh_crm_v2_staging_');
  const customer=await store.create('kunden',{company:'TEST_ONLY Block AG',email:'a@qa.invalid'},admin);
  const missingEmail=await store.create('kunden',{company:'TEST_ONLY No Email AG'},admin);
  const mk=async(cId,dueDate,status='Offen')=>store.create('rechnungen',{
    customerId:cId,description:'TEST_ONLY blocked reminder',status,dueDate,
    items:[{title:'Test',qty:1,unitPriceCHF:90}]
  },admin);
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich',
    year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const delayed=await mk(customer.id,today);
  const stale=await mk(missingEmail.id,'2020-01-01');
  const paid=await mk(customer.id,'2020-01-01');
  const cancelled=await mk(customer.id,'2020-01-01');
  const noSend=await mk(customer.id,'2020-01-01');
  const coll='lszh_crm_v2_staging_rechnungen/';
  for(const x of [delayed,stale,paid,cancelled])
    db.storage.get(coll+x.id).invoiceDispatchState='confirmed';
  db.storage.get(coll+paid.id).status='Bezahlt';
  db.storage.get(coll+cancelled.id).status='Storniert';
  const payload={reminderId:'00000000-0000-4000-8000-000000000211',kind:'Zahlungserinnerung'};
  for(const invoice of [delayed,stale,paid,cancelled,noSend]){
    await assert.rejects(store.recordInvoiceReminder(invoice.id,payload,admin),{status:409});
    const fresh=await store.get('rechnungen',invoice.id);
    assert.equal(fresh.reminderHistory,undefined);
  }
  await assert.rejects(store.recordInvoiceReminder(noSend.id,{
    ...payload,evil:'ignored'
  },admin),{status:400});
});


test('manual reminder logs current remaining balance after partial payment and stops after settlement',async()=>{
  // Synthetic ledger only. No real bank actions or external sends.
  const db=fakeFirestore(),store=buildStore(db,'lszh_crm_v2_staging_');
  const customer=await store.create('kunden',{company:'TEST_ONLY Teilmahnung AG',email:'billing@qa.invalid'},admin);
  const inv=await store.create('rechnungen',{
    customerId:customer.id,description:'TEST_ONLY Mahnung nach Teilzahlung',
    invoiceDate:'2020-01-01',dueDate:'2020-01-31',status:'Offen',
    items:[{title:'Test Service',qty:1,unitPriceCHF:100}]
  },admin);
  const key='lszh_crm_v2_staging_rechnungen/'+inv.id;
  db.storage.get(key).invoiceDispatchState='confirmed';
  const first={reminderId:'00000000-0000-4000-8000-000000000301',kind:'Zahlungserinnerung'};
  const second={reminderId:'00000000-0000-4000-8000-000000000302',kind:'1. Mahnung'};
  const third={reminderId:'00000000-0000-4000-8000-000000000303',kind:'2. Mahnung'};
  let record=await store.recordInvoiceReminder(inv.id,first,admin);
  assert.equal(record.reminderHistory[0].outstandingCHF,100);
  const today=new Intl.DateTimeFormat('sv-SE',{
    timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'
  }).format(new Date());
  const firstPay=await store.recordInvoicePayment(inv.id,{
    paymentId:'00000000-0000-4000-8000-000000000311',
    amountCHF:'40.00',paidOn:today,method:'Banküberweisung',reference:'TEST_ONLY PART 1'
  },admin);
  assert.equal(firstPay.status,'Teilbezahlt');
  assert.equal(firstPay.outstandingCHF,60);
  db.storage.get(key).reminderHistory[0].at=new Date(Date.now()-7*86400000-120000).toISOString();
  record=await store.recordInvoiceReminder(inv.id,second,admin);
  assert.equal(record.reminderHistory[0].outstandingCHF,100,'first audit record unchanged');
  assert.equal(record.reminderHistory[1].outstandingCHF,60,'second stage uses current rest');
  assert.equal(record.status,'Teilbezahlt');
  const final=await store.recordInvoicePayment(inv.id,{
    paymentId:'00000000-0000-4000-8000-000000000312',
    amountCHF:'60.00',paidOn:today,method:'Banküberweisung',reference:'TEST_ONLY FINAL'
  },admin);
  assert.equal(final.status,'Bezahlt');
  assert.equal(final.outstandingCHF,0);
  db.storage.get(key).reminderHistory[1].at=new Date(Date.now()-7*86400000-120000).toISOString();
  await assert.rejects(store.recordInvoiceReminder(inv.id,third,admin),{status:409});
  const confirmed=await store.get('rechnungen',inv.id);
  assert.equal(confirmed.reminderHistory.length,2);
  assert.equal(confirmed.reminderHistory[0].outstandingCHF,100);
  assert.equal(confirmed.reminderHistory[1].outstandingCHF,60);
  assert.equal(confirmed.status,'Bezahlt');
});

test('paginated Firestore reads cover 230 records with stable ties, no duplicates, and safe cursors',async()=>{
  const db=fakeFirestore(),store=buildStore(db,'lszh_crm_v2_staging_');
  for(let i=0;i<230;i++)db.storage.set('lszh_crm_v2_staging_kunden/'+String(i).padStart(4,'0'),{
    company:'TEST_ONLY Customer '+i,createdAt:'2026-10-24T17:00:00.000Z',status:'Aktiv'
  });
  let cursor='',round=0;const ids=[];
  do{
    const page=await store.listPage('kunden',50,cursor);
    ids.push(...page.records.map(x=>x.id));
    round++;
    if(!page.hasMore)break;
    assert.ok(page.nextCursor);
    cursor=page.nextCursor;
    assert.ok(round<10);
  }while(true);
  assert.equal(round,5);
  assert.equal(ids.length,230);
  assert.equal(new Set(ids).size,230);
  assert.equal(ids[0],'0229');
  assert.equal(ids.at(-1),'0000');
  await assert.rejects(store.listPage('kunden',101),{status:400});
  await assert.rejects(store.listPage('kunden',50,'../../invalid'),{status:400});
  await assert.rejects(store.listPage('kunden',50,'does-not-exist'),{status:409});
  const count=[];
  for await(const row of store.scan('kunden'))count.push(row.id);
  assert.equal(count.length,230);
});
