'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {prepareWebsiteLead,saveWebsiteLead}=require('../lead-ingest');

const sample=()=>({
  submission_id:'12345678-1234-4234-9234-1234567890ab',
  name:'Max Muster',company:'Muster AG',email:'max@firma.ch',
  street:'Hauptstrasse 12',postal_code:'5610',city:'Wohlen',country:'Schweiz',
  message:'Offerten automatisieren',current_process:'Alles manuell',
  systems:'Excel und Outlook',main_problem:'Hoher Zeitaufwand',
  frequency:'Täglich',desired_result:'Schnellere Bearbeitung'
});
function fakeDb(collectionName='lszh_crm_v2_leads'){
  const documents=new Map();
  const db={collection(name){
    assert.equal(name,collectionName);
    return {doc(id){
      return {
        async create(value){
          if(documents.has(id))throw Object.assign(new Error('already exists'),{code:6});
          documents.set(id,{...value});
        },
        async get(){
          const value=documents.get(id);
          return {exists:!!value,data:()=>value};
        }
      };
    }};
  }};
  return {db,documents};
}

test('maps website form address to CRM field names',()=>{
  const p=prepareWebsiteLead(sample());
  assert.equal(p.data.postalCode,'5610');
  assert.equal(p.data.street,'Hauptstrasse 12');
  assert.equal(p.data.city,'Wohlen');
  assert.equal(p.data.country,'Schweiz');
  assert.match(p.id,/^web_[0-9a-f]{32}$/);
});
test('rejects missing mandatory data and bad email',()=>{
  assert.throws(()=>prepareWebsiteLead({...sample(),email:''}),/missing_email/);
  assert.throws(()=>prepareWebsiteLead({...sample(),email:'invalid'}),/invalid_email/);
  assert.throws(()=>prepareWebsiteLead({...sample(),message:''}),/missing_message/);
  assert.throws(()=>prepareWebsiteLead({...sample(),submission_id:'not-a-uuid'}),/invalid_submission_id/);
});
test('requires all business address fields and enforces length limits',()=>{
  assert.throws(()=>prepareWebsiteLead({...sample(),street:{nested:1}}),/invalid_street/);
  assert.throws(()=>prepareWebsiteLead({...sample(),postal_code:'A'.repeat(17)}),/too_long_postal_code/);
  for(const key of ['street','postal_code','city','country']){
    assert.throws(()=>prepareWebsiteLead({...sample(),[key]:''}),new RegExp('missing_'+key));
    const missing=sample();delete missing[key];
    assert.throws(()=>prepareWebsiteLead(missing),new RegExp('missing_'+key));
  }
});
test('persists one lead and confirms retry without duplication',async()=>{
  const {db,documents}=fakeDb();
  const first=await saveWebsiteLead(db,sample());
  const second=await saveWebsiteLead(db,sample());
  assert.equal(first.created,true);
  assert.equal(second.created,false);
  assert.equal(first.id,second.id);
  assert.equal(documents.size,1);
  assert.equal(documents.get(first.id).status,'Neu');
  assert.equal(documents.get(first.id).source,'LSZH Automations Website');
});
test('rejects changed data with reused submission id',async()=>{
  const {db,documents}=fakeDb();
  await saveWebsiteLead(db,sample());
  await assert.rejects(saveWebsiteLead(db,{...sample(),message:'completely different'}),/submission_id_conflict/);
  assert.equal(documents.size,1);
});
test('propagates storage failures and never confirms them',async()=>{
  const db={collection(){return {doc(){return {async create(){throw new Error('database unavailable');}};}};}};
  await assert.rejects(saveWebsiteLead(db,sample()),/database unavailable/);
});

test('staging website lead goes only into the staging collection, not the live one',async()=>{
  const {db,documents}=fakeDb('lszh_crm_v2_staging_leads');
  const created=await saveWebsiteLead(db,sample(),'2026-10-23T12:00:00Z','lszh_crm_v2_staging_leads');
  assert.equal(created.created,true);
  assert.equal(created.id,'web_123456781234423492341234567890ab');
  assert.equal(documents.size,1);
  const repeat=await saveWebsiteLead(db,sample(),'2026-10-23T12:01:00Z','lszh_crm_v2_staging_leads');
  assert.equal(repeat.created,false);
  assert.equal(repeat.id,created.id);
  assert.equal(documents.size,1);
  assert.equal(documents.get(created.id).createdAt,'2026-10-23T12:00:00Z');
  assert.equal(documents.get(created.id).status,'Neu');
  assert.equal(documents.get(created.id).postalCode,'5610');
});
test('a changed retry in staging returns HTTP 409 and leaves original untouched',async()=>{
  const {db,documents}=fakeDb('lszh_crm_v2_staging_leads');
  await saveWebsiteLead(db,sample(),undefined,'lszh_crm_v2_staging_leads');
  const changed={...sample(),main_problem:'Nicht identisch'};
  await assert.rejects(saveWebsiteLead(db,changed,undefined,'lszh_crm_v2_staging_leads'),
    {status:409});
  assert.equal(documents.size,1);
  assert.equal([...documents.values()][0].mainProblem,'Hoher Zeitaufwand');
});
test('only live and isolated staging collections are permitted',async()=>{
  const {db}=fakeDb();
  for(const untrusted of ['other_collection','lszh_crm_v2_staging_kunden','lszh_crm_v2_offerten','']){
    await assert.rejects(saveWebsiteLead(db,sample(),undefined,untrusted),
      /unapproved_intake_collection/);
  }
});
