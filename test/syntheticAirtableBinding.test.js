'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {bindSyntheticAirtableRecordOnce,SyntheticBindingRejected,
 LOCK_COLLECTION}=require('../syntheticAirtableBinding');
const fixtureId='LSZH-EMULATOR-20261015AAAA';
const secondId='LSZH-EMULATOR-20261015BBBB';
const recordId='recTEST0000000000';
const sha=x=>x.repeat(64), drive=x=>x.repeat(24);
const now=new Date('2026-10-15T12:00:00Z');
const docs={offer:{mimeType:'application/pdf',sha256:sha('2'),driveFileId:drive('1'),archiveVerified:true},
 terms:{mimeType:'application/pdf',sha256:sha('3'),driveFileId:drive('2'),archiveVerified:true},
 avv:{mimeType:'application/pdf',sha256:sha('4'),driveFileId:drive('3'),archiveVerified:true}};
function draft(id=fixtureId,extra={}){
 return {schemaVersion:1,testOnly:true,fixtureId:id,offerNumber:'DEMO-OFF-20991231-999',
   status:'TEST_DRAFT_NOT_SENT',recipientEmail:'fake-tester@example.invalid',
   validUntil:'2099-12-31',termsVersion:'TEST_ONLY_TERMS',
   avvRequired:true,avvVersion:'TEST_ONLY_AVV',documents:docs,tokenHash:null,
   issuedAt:null,expiresAt:null,acceptedAt:null,acceptanceEvidence:null,
   reconciliationStatus:'NOT_STARTED',legallyApproved:false,acceptanceEnabled:false,
   deliveryEnabled:false,deliveryConfirmed:false,requiresManualReview:true,
   airtableRecordId:null,airtableBinding:null,...extra};
}
function record(extra={},id=recordId){
 return {id,fields:{
  Status:'Entwurf',Offertennummer:'DEMO-OFF-20991231-999',
  'Gültig bis':'2099-12-31','Projektbedingungen Version':'TEST_ONLY_TERMS',
  'Lead E-Mail':['fake-tester@example.invalid'],
  'AVV erforderlich':'Ja','Vertragsunterlagen akzeptiert':false,
  'Vertragsunterlagen versendet':false,
  'Online-Annahme rechtlich freigegeben':false,
  'Online-Annahme Offerten-SHA256':sha('2'),'Online-Annahme Offerten Drive ID':drive('1'),
  'Online-Annahme Bedingungen-SHA256':sha('3'),'Online-Annahme Bedingungen Drive ID':drive('2'),
  'Online-Annahme AVV-SHA256':sha('4'),'Online-Annahme AVV Drive ID':drive('3'),
  'Online-Annahme AVV-Version':'TEST_ONLY_AVV',...extra}};
}
function memory(records=[draft(),draft(secondId)]){
 const docsDb=new Map(records.map(s=>['stagingOfferFixtures/'+s.fixtureId,structuredClone(s)]));
 let transaction=Promise.resolve(),writes=0;
 return {db:{doc:path=>({path}),runTransaction:fn=>{
  const job=transaction.then(async()=>{
   const pending=[];
   const tx={get:async r=>({exists:docsDb.has(r.path),
    data:()=>structuredClone(docsDb.get(r.path))}),
    create:(r,value)=>{pending.push(['create',r.path,structuredClone(value)])},
    update:(r,value)=>{pending.push(['update',r.path,structuredClone(value)])}};
   const result=await fn(tx);
   for(const [action,p,value]of pending){
    if(action==='create'){assert.equal(docsDb.has(p),false);docsDb.set(p,value);}
    else{assert.equal(docsDb.has(p),true);docsDb.set(p,{...docsDb.get(p),...value})}
    writes++;
   }
   return result;
  });
  transaction=job.catch(()=>{});return job;
 }},get:id=>docsDb.get('stagingOfferFixtures/'+id),
 lock:()=>docsDb.get(LOCK_COLLECTION+'/'+recordId),writes:()=>writes};
}
const inputs={fixtureId,airtableRecordId:recordId,now,testMode:'offline-or-emulator-only'};
async function denied(store,override={},reason){
 await assert.rejects(bindSyntheticAirtableRecordOnce({db:store.db,
    readRecord:async id=>record({},id),...inputs,...override}),e=>{
   assert.ok(e instanceof SyntheticBindingRejected);
   if(reason)assert.equal(e.reason,reason);
   return true;
 });
 assert.equal(store.writes(),0);
}
test('verifies exact Airtable record then creates unique lock and frozen fixture binding',async()=>{
 const s=memory();let reads=0;
 const result=await bindSyntheticAirtableRecordOnce({...inputs,db:s.db,
  readRecord:async id=>{reads++;assert.equal(id,recordId);return record();}});
 assert.equal(reads,1);
 assert.equal(result.bound,true);
 assert.equal(result.remoteWritePerformed,false);
 assert.equal(s.get(fixtureId).airtableRecordId,recordId);
 assert.equal(s.get(fixtureId).airtableBinding.fingerprint,result.fingerprint);
 assert.equal(s.get(fixtureId).status,'TEST_DRAFT_NOT_SENT');
 assert.equal(s.get(fixtureId).acceptanceEnabled,false);
 assert.equal(s.get(fixtureId).legallyApproved,false);
 assert.equal(s.lock().fixtureId,fixtureId);
 assert.equal(s.writes(),2);
 assert.match(result.fingerprint,/^[a-f0-9]{64}$/);
});
test('two simultaneous fixtures cannot bind same CRM record ID',async()=>{
 const s=memory();const readRecord=async()=>record();
 const rs=await Promise.allSettled([fixtureId,secondId].map(id=>
  bindSyntheticAirtableRecordOnce({...inputs,fixtureId:id,db:s.db,readRecord})));
 assert.equal(rs.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(rs.filter(r=>r.status==='rejected').length,1);
 assert.equal(rs.find(r=>r.status==='rejected').reason.reason,'record_already_bound');
 assert.equal(s.writes(),2);
 const win=rs.find(r=>r.status==='fulfilled').value.fixtureId;
 assert.equal(s.lock().fixtureId,win);
});
test('replay of bound fixture is rejected and never changes the fingerprint',async()=>{
 const s=memory();const readRecord=async()=>record();
 const first=await bindSyntheticAirtableRecordOnce({...inputs,db:s.db,readRecord});
 await assert.rejects(bindSyntheticAirtableRecordOnce({...inputs,db:s.db,readRecord}),
  e=>e.reason==='already_bound');
 assert.equal(s.get(fixtureId).airtableBinding.fingerprint,first.fingerprint);
 assert.equal(s.writes(),2);
});
test('recipient, offer, version, validity and document mismatch are fail-closed',async()=>{
 for(const fields of [
   {'Lead E-Mail':['not-owner@example.invalid']},
   {'Lead E-Mail':['fake-tester@example.invalid','fake-second@example.invalid']},
   {Offertennummer:'DEMO-OFF-WRONG'}, {'Gültig bis':'2099-12-30'},
   {'Projektbedingungen Version':'OTHER'},
   {'Online-Annahme Offerten-SHA256':sha('f')},
   {'Online-Annahme Bedingungen Drive ID':drive('x')},
   {'Online-Annahme AVV-SHA256':sha('a')},
   {'Online-Annahme AVV Drive ID':drive('z')},
   {'Online-Annahme AVV-Version':'TEST_ONLY_WRONG'},
   {'AVV erforderlich':'Nein'},{Status:'Versendet'},
   {'Vertragsunterlagen akzeptiert':true},
   {'Online-Annahme Zeitstempel':'2026-10-15T12:00:00Z'},
   {'Online-Annahme Token-Hash':sha('a')},
   {'Vertragsunterlagen versendet':true},
   {'Online-Annahme rechtlich freigegeben':true}
 ]){
  const s=memory();
  await denied(s,{readRecord:async()=>record(fields)},'record_mismatch');
 }
});
test('wrong/missing record identity or untrusted record response rejected',async()=>{
 for(const remote of [null,{},record({},'recWRONG000000000'),{id:recordId,fields:null}]){
  const s=memory();await denied(s,{readRecord:async()=>remote},'record_mismatch');
 }
});
test('never bind live, already issued or accepted records',async()=>{
 for(const extra of [{testOnly:false},{schemaVersion:3},
  {legallyApproved:true},{deliveryConfirmed:true},{acceptanceEnabled:true},
  {status:'ISSUED'},{status:'ACCEPTED'},{issuedAt:now.toISOString()},
  {tokenHash:sha('a')},{reconciliationStatus:'PENDING'},
  {recipientEmail:'real@example.com'}, {airtableRecordId:'recOTHER000000000'}]){
  const s=memory([draft(fixtureId,extra)]);
  await denied(s,{},'not_eligible');
 }
});
test('no test intent, real project identity, bad fixture or bad record ID',async()=>{
 for(const value of [{testMode:'production'},{airtableRecordId:'recINVALID'},
  {fixtureId:'customer1234567890'}])await denied(memory(),value,'invalid_input');
 for(const env of ['K_SERVICE','GOOGLE_CLOUD_PROJECT','GCLOUD_PROJECT']){
  const saved=process.env[env];
  try{
   process.env[env]=env==='K_SERVICE'?'lszh-offer-acceptance-staging':'lszh-automations';
   await denied(memory(),{},'not_test_environment');
  }finally{if(saved===undefined)delete process.env[env];else process.env[env]=saved;}
 }
});
test('record retrieval errors never touch Firestore',async()=>{
 const s=memory();
 await assert.rejects(bindSyntheticAirtableRecordOnce({...inputs,db:s.db,
  readRecord:async()=>{throw Error('synthetic reader failed');}}),/synthetic reader failed/);
 assert.equal(s.writes(),0);
});
test('non-AVV case enforces absence of unrelated AVV documents',async()=>{
 const base=draft(fixtureId,{avvRequired:false,avvVersion:null,
  documents:{offer:docs.offer,terms:docs.terms}});
 const s=memory([base]);
 const bare=record({'AVV erforderlich':'Nein',
   'Online-Annahme AVV Drive ID':null,'Online-Annahme AVV-SHA256':null,
   'Online-Annahme AVV-Version':null});
 const result=await bindSyntheticAirtableRecordOnce({...inputs,db:s.db,
   readRecord:async()=>bare});
 assert.equal(result.bound,true);
 const invalid=memory([base]);
 await denied(invalid,{readRecord:async()=>record({'AVV erforderlich':'Nein'})},'record_mismatch');
});
