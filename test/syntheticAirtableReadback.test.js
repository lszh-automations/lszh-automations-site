'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bindingFingerprint}=require('../syntheticAirtableBinding');
const {mockAirtableOffer}=require('./helpers/mockAirtableOffer');
const {fetchSyntheticReadback,verifySyntheticReadback,SyntheticReadbackRejected}=require('../syntheticAirtableReadback');
const H=x=>x.repeat(64);
const doc=x=>({mimeType:'application/pdf',sha256:H(x),driveFileId:x.repeat(24),archiveVerified:true});
function base(stage='issuance'){
 const s={testOnly:true,fixtureId:'LSZH-EMULATOR-20261015AAAA',
  airtableRecordId:'recTEST0000000000',offerNumber:'DEMO-OFF-20991231-999',
  recipientEmail:'fake-tester@example.invalid',validUntil:'2099-12-31',
  termsVersion:'TEST_ONLY_TERMS',avvRequired:true,avvVersion:'TEST_ONLY_AVV',
  documents:{offer:doc('2'),terms:doc('3'),avv:doc('4')},
  status:stage==='acceptance'?'ISSUED':'TEST_DRAFT_NOT_SENT',
  legallyApproved:stage==='acceptance',
  acceptanceEnabled:stage==='acceptance',
  deliveryConfirmed:stage==='acceptance',
  tokenHash:stage==='acceptance'?H('1'):null};
 s.airtableBinding={source:'SYNTHETIC_READ_ONLY',schemaVersion:1,
   boundAt:'2026-10-15T10:00:00Z',fingerprint:bindingFingerprint(s,s.airtableRecordId)};
 return s;
}
function verify(s,stage,edit={}){
 const r=mockAirtableOffer(s,stage);
 r.fields={...r.fields,...edit};
 return verifySyntheticReadback(s,r,stage);
}
test('only exact server-read synthetic quote/terms/AVV matches pass',()=>{
 for(const stage of ['issuance','acceptance'])
  assert.equal(verify(base(stage),stage),true);
});
test('stage mismatch and missing legal/sending evidence fail closed',()=>{
 assert.throws(()=>verify(base('issuance'),'acceptance'),SyntheticReadbackRejected);
 assert.throws(()=>verify(base('acceptance'),'issuance'),SyntheticReadbackRejected);
 for(const edit of [
  {Status:'Entwurf'},
  {'Vertragsunterlagen versendet':false},
  {'Online-Annahme rechtlich freigegeben':false},
  {'Online-Annahme Link gesendet am':null},
  {'Online-Annahme Token-Hash':H('5')},
  {'Online-Annahme Zeitstempel':'2026-10-15T10:00:00Z'}
 ])assert.throws(()=>verify(base('acceptance'),'acceptance',edit),SyntheticReadbackRejected);
});
test('newly changed contract, recipient, AVV and PDF archiving fail both stages',()=>{
 for(const stage of ['issuance','acceptance']){
  for(const edited of [
   {'Offertennummer':'DEMO-OFF-CHANGED'},
   {'Lead E-Mail':['fake-other@example.invalid']},
   {'Projektbedingungen Version':'TEST_ONLY_OTHER'},
   {'Gültig bis':'2099-12-30'},
   {'AVV erforderlich':'Nein'},
   {'Online-Annahme Offerten Drive ID':'Z'.repeat(24)},
   {'Online-Annahme Bedingungen-SHA256':H('f')},
   {'Online-Annahme AVV Drive ID':'Z'.repeat(24)},
   {'Online-Annahme AVV-Version':'OTHER'},
   {'Vertragsunterlagen akzeptiert':true},
   {'Online-Annahme Nachweis':'some prior record'}
  ])assert.throws(()=>verify(base(stage),stage,edited),SyntheticReadbackRejected);
 }
});
test('missing AVV is accepted only when both source and state explicitly agree',()=>{
 const s=base('issuance');s.avvRequired=false;s.avvVersion=null;
 delete s.documents.avv;
 s.airtableBinding.fingerprint=bindingFingerprint(s,s.airtableRecordId);
 assert.equal(verify(s,'issuance'),true);
 assert.throws(()=>verify(s,'issuance',{'Online-Annahme AVV-SHA256':H('4')}),SyntheticReadbackRejected);
});
test('readRecord is invoked once with exact pinned ID and result cloned',async()=>{
 const s=base('issuance'),source=mockAirtableOffer(s);
 let hits=0;
 const snapshot=await fetchSyntheticReadback(async id=>{hits++;assert.equal(id,s.airtableRecordId);return source},s.airtableRecordId);
 assert.equal(hits,1);
 source.fields.Status='CHANGED AFTER READ';
 assert.equal(snapshot.fields.Status,'Entwurf');
 assert.equal(verifySyntheticReadback(s,snapshot,'issuance'),true);
});
test('read errors, wrong record, missing field object and missing reader fail closed',async()=>{
 const id='recTEST0000000000';
 const checks=[null,async()=>{throw Error('private details')},
  async()=>null,async()=>({id:'recOTHER000000000',fields:{}}),
  async()=>({id,fields:null})];
 for(const readRecord of checks){
  await assert.rejects(fetchSyntheticReadback(readRecord,id),SyntheticReadbackRejected);
 }
});
