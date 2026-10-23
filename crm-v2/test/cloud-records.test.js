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
    constructor(name,filter=null,order=null,limit=200){this.name=name;this.filter=filter;this.order=order;this.max=limit;}
    where(field,operator,value){
      assert.equal(operator,'==');
      return new Query(this.name,{field,value},this.order,this.max);
    }
    limit(n){return new Query(this.name,this.filter,this.order,n);}
    orderBy(field,direction){return new Query(this.name,this.filter,{field,direction},this.max);}
    async get(){
      let docs=[...storage.keys()].filter(key=>key.startsWith(this.name+'/'))
        .map(key=>{const id=key.slice(this.name.length+1);return snapshot(new Doc({name:this.name},id));});
      if(this.filter)docs=docs.filter(x=>x.data()[this.filter.field]===this.filter.value);
      if(this.order)docs.sort((a,b)=>{
        const x=String(a.data()[this.order.field]||'');
        const y=String(b.data()[this.order.field]||'');
        return this.order.direction==='desc'?y.localeCompare(x):x.localeCompare(y);
      });
      docs=docs.slice(0,this.max);
      return {docs,empty:docs.length===0};
    }
  }
  class Col{
    constructor(name){this.name=name;}
    doc(id){return new Doc(this,id||('generated-'+(++seq)));}
    where(field,op,value){return new Query(this.name).where(field,op,value);}
    orderBy(field,direction){return new Query(this.name).orderBy(field,direction);}
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
  const store=buildStore(fakeFirestore(),'lszh_crm_v2_staging_');
  const customer=await store.create('kunden',{company:'Kunde AG'},admin);
  const invoice=await store.create('rechnungen',{
    customerId:customer.id,description:'Leistung',dueDate:'2026-11-30',status:'Entwurf',
    items:[{title:'Einrichtung',qty:2,unitPriceCHF:249.95}]
  },admin);
  assert.equal(invoice.number,'RE-1000');
  assert.equal(invoice.amountCHF,499.9);
  await store.update('rechnungen',invoice.id,{status:'Offen'},admin);
  const paid=await store.update('rechnungen',invoice.id,{status:'Bezahlt'},admin);
  assert.equal(paid.status,'Bezahlt');
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
  assert.match(offers[0].description,/Anfrage: Automationen prüfen/);
  assert.match(offers[0].description,/Heutiger Ablauf: Excel/);
  assert.doesNotMatch(offers[0].description,/Budgetrahmen/);
  assert.doesNotMatch(offers[0].description,/Qualifizierungsnotizen/);
  assert.doesNotMatch(offers[0].description,/MVP zuerst/);
  await store.update('leads',lead.id,{qualificationNotes:'Später ergänzt'},admin);
  assert.equal((await store.list('offerten'))[0].description,offers[0].description);
  await store.update('leads',lead.id,{nextAction:'',followUpDate:''},admin);
  const done=await store.get('leads',lead.id);
  assert.equal(done.nextAction,'');
  assert.equal(done.followUpDate,'');
  assert.equal((await store.list('offerten')).length,1);
});
