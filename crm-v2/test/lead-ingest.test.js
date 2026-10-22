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
function fakeDb(){
  const documents=new Map();
  const db={collection(name){
    assert.equal(name,'lszh_crm_v2_leads');
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
test('validates optional field types and maximum lengths',()=>{
  assert.throws(()=>prepareWebsiteLead({...sample(),street:{nested:1}}),/invalid_street/);
  assert.throws(()=>prepareWebsiteLead({...sample(),postal_code:'A'.repeat(17)}),/too_long_postal_code/);
  assert.equal(prepareWebsiteLead({...sample(),country:''}).data.country,'Schweiz');
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
