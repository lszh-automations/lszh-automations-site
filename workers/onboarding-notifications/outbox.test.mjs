import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {eventId,makeDraft,reconcile,TYPE}=require('./outbox');
const CODE='ob_00000000-0000-4000-8000-000000000000';
const ID='rec'+'A'.repeat(14),ORDER='rec'+'B'.repeat(14),CUSTOMER='rec'+'C'.repeat(14),TASK='rec'+'D'.repeat(14);

function fakeAirtable({hasRecord=true, correctCustomer=true, taskNeeded=false,
                       taskPresent=true, duplicate=false, broken=false}={}) {
  let calls=0;
  const fields={
    Projektcode:CODE,Auftrag:[ORDER],Status:'Eingegangen',
    'Sensible Daten':taskNeeded?'Unsicher':'Nein',
    'Make-Konto Status':'Noch kein Make-Konto',
    'Make-Organisation':'','Make-Einladung Status':'Noch nicht eingeladen',
    'Rechnungsstrasse':'Test 1','Rechnungs-PLZ':'5610','Rechnungsort':'Wohlen',
    'Rechnungsland':'Schweiz','Rechnungs-E-Mail':'test@example.invalid'
  };
  return {
    calls:()=>calls,
    fetchImpl:async (url,opts)=>{
      calls++;assert.equal(opts.method,'GET');
      assert.equal(opts.headers.Authorization,'Bearer SYNTHETIC');
      if(broken) return {ok:false,status:503};
      const pathname=new URL(url).pathname;
      let body;
      if(pathname.endsWith('/tblWIY4l4VASz8Vse')){
        body={records:hasRecord?[{id:ID,fields},...(duplicate?[{id:TASK,fields}]:[])]:[]};
      } else if(pathname.endsWith('/tblXUogIvWbulxfnN/'+ORDER)){
        body={id:ORDER,fields:{
          'Onboarding-Token':CODE,'Kunden-Onboarding':[ID],Kunde:[CUSTOMER],
          'Verbindungen erforderlich':true,'AVV erforderlich':'Prüfen',
          'Make-Kontostatus':'Noch kein Make-Konto','Make-Organisation':'',
          'Make-Einladungsstatus':'Noch nicht eingeladen'
        }};
      } else if(pathname.endsWith('/tbl8cUUfFVqsjj2Z0/'+CUSTOMER)){
        body={id:CUSTOMER,fields:{
          'Rechnungsstrasse':'Test 1','Rechnungs-PLZ':'5610',
          'Rechnungsort':correctCustomer?'Wohlen':'Anderswo',
          'Rechnungsland':'Schweiz','Rechnungs-E-Mail':'test@example.invalid'
        }};
      } else if(pathname.endsWith('/tblwbAszWFlFJGmgQ')){
        body={records:taskPresent?[{id:TASK,fields:{
          Aufgabencode:ORDER+'-DSG-01',Auftrag:[ORDER]}}]:[]};
      } else throw Error('Unexpected URL '+url);
      return {ok:true,json:async()=>body};
    }
  };
}
function memoryStore() {
  const docs=new Map();
  let calls=0;
  return {
    docs,calls:()=>calls,
    async createOnce(id,draft) {
      calls++;
      assert.equal(id,eventId(draft.recordId));
      assert.equal(draft.state,'DRAFT_NOT_SENT');
      assert.equal(draft.deliveryEnabled,false);
      assert.equal(draft.emailSent,false);
      assert.equal(draft.testOnly,true);
      assert.ok(!('email' in draft));
      assert.ok(!('project_code' in draft));
      if(docs.has(id))return 'exists';
      docs.set(id,draft);return 'created';
    }
  };
}
const work=(fetchImpl,store,candidateCodes=[CODE])=>
  reconcile({candidateCodes,readToken:'SYNTHETIC',fetchImpl,store});

test('only complete saved workflow creates persistent no-send draft',async()=>{
  const fake=fakeAirtable(),store=memoryStore();
  const result=await work(fake.fetchImpl,store);
  assert.equal(result.created,1);
  assert.equal(result.completed,1);
  assert.equal(store.docs.size,1);
  const [id,doc]=[...store.docs][0];
  assert.equal(id,eventId(ID));
  assert.equal(doc.eventType,TYPE);
  assert.equal(doc.recordId,ID);
  assert.equal(doc.state,'DRAFT_NOT_SENT');
});
test('repeated reconciliation is idempotent, even after simulated restart',async()=>{
  const fake=fakeAirtable(),store=memoryStore();
  const [a,b]=await Promise.all([work(fake.fetchImpl,store),work(fake.fetchImpl,store)]);
  assert.equal(a.created+b.created,1);
  assert.equal(a.alreadyExisting+b.alreadyExisting,1);
  assert.equal(store.docs.size,1);
  const later=await work(fake.fetchImpl,store);
  assert.equal(later.created,0);assert.equal(later.alreadyExisting,1);
});
test('no completed state, no record => never create draft',async()=>{
  const store=memoryStore(),fake=fakeAirtable({hasRecord:false});
  const result=await work(fake.fetchImpl,store);
  assert.equal(result.processing,1);
  assert.equal(store.calls(),0);
});
test('incomplete customer record => no draft',async()=>{
  const store=memoryStore(),fake=fakeAirtable({correctCustomer:false});
  const result=await work(fake.fetchImpl,store);
  assert.equal(result.processing,1);
  assert.equal(store.calls(),0);
});
test('missing mandatory DSG task => no draft; present task => draft',async()=>{
  const store=memoryStore(),fake=fakeAirtable({taskNeeded:true,taskPresent:false});
  const result=await work(fake.fetchImpl,store);assert.equal(result.processing,1);
  assert.equal(store.docs.size,0);
  const complete=fakeAirtable({taskNeeded:true,taskPresent:true});
  assert.equal((await work(complete.fetchImpl,store)).created,1);
});
test('duplicate records request manual review without any draft',async()=>{
  const store=memoryStore(),fake=fakeAirtable({duplicate:true});
  assert.equal((await work(fake.fetchImpl,store)).requiresReview,1);
  assert.equal(store.docs.size,0);
});
test('Airtable outage fails closed without creating draft',async()=>{
  const store=memoryStore(),fake=fakeAirtable({broken:true});
  assert.equal((await work(fake.fetchImpl,store)).unavailable,1);
  assert.equal(store.docs.size,0);
});
test('Firestore outage is observable, repeat can recover without assuming delivery',async()=>{
  const fake=fakeAirtable();
  const result=await work(fake.fetchImpl,{createOnce:async()=>{throw Error('unavailable');}});
  assert.equal(result.unavailable,1);
  const store=memoryStore();
  assert.equal((await work(fake.fetchImpl,store)).created,1);
});
test('dedup candidate list before reads, invalid tokens fail closed',async()=>{
  const fake=fakeAirtable(),store=memoryStore();
  const r=await work(fake.fetchImpl,store,[CODE,CODE,'invalid']);
  assert.equal(r.candidates,2);
  assert.equal(r.created,1);
  assert.equal(r.requiresReview,1);
});
test('event IDs are deterministic, opaque and namespaced',()=>{
  assert.match(eventId(ID),/^[0-9a-f]{64}$/);
  assert.equal(eventId(ID),eventId(ID));
  assert.notEqual(eventId(ID),eventId(ORDER));
  assert.throws(()=>eventId('recWrong'),/invalid_record_id/);
  const draft=makeDraft(ID,new Date('2026-10-16T12:00:00Z'));
  assert.equal(draft.createdAt,'2026-10-16T12:00:00.000Z');
  assert.equal(Object.keys(draft).includes('recipient'),false);
});
