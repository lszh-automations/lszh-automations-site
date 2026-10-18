'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../scripts/offer-cloud-synthetic-seed-once.mjs');
const HASH='55f035054bf4f5501cf134a9573075e2ef415ce8820290fbd154f017b1394083';
const record=()=>({
 Offertennummer:'TEST_CLOUD_E2E_20261018_NO_CONTRACT',
 Status:'Entwurf','Projektbedingungen Version':'TEST_v1.0_RC1',
 'AVV erforderlich':'Nein','Gültig bis':'2099-12-31',
 'Online-Annahme Token-Hash':HASH,
 'Online-Annahme Offerten Drive ID':'1gj6F7am7ouIj-M2kRMa53b7MMgtMgvIt',
 'Online-Annahme Offerten-SHA256':
   '1c337295c205697dd940668bfc2fb4141fbc67d9dc21f27e764d67ac02e48233',
 'Online-Annahme Bedingungen Drive ID':'1yPtsWTeEUclniKFWRM81EHEUMnu1E9nO',
 'Online-Annahme Bedingungen-SHA256':
   'baec0946db9b892da86e4009ade769863d5087d8961e16940d0dda420d1bf279',
 Lead:['recv49NbSCmc5nEu3'],
 'Lead E-Mail':['fake-lszh-e2e@example.invalid'],
 'Echtbetrieb – kein Test':false,
 'Online-Annahme rechtlich freigegeben':false,
 'Versand freigegeben':false,
 'Vertragsunterlagen akzeptiert':false,
 'Interne Notiz':'TEST ONLY / NO CONTRACT / NO EMAIL'
});
test('pinned real-business synthetic draft is accepted only if every source field matches',async()=>{
 const {checkBusinessDraft,toAirtableAppRecord}=await load();
 const original=record();
 assert.strictEqual(checkBusinessDraft(original),original);
 const mapped=toAirtableAppRecord(original);
 assert.equal(mapped.id,'recensIiczNGsoPeR');
 assert.equal(mapped.cellValuesByFieldId.fldNluaFeT1mWGMJY,original.Offertennummer);
 assert.equal(mapped.cellValuesByFieldId.fldBWHnMXuL46y5L9,HASH);
 assert.deepEqual(mapped.cellValuesByFieldId.flduZx5dzgpMfyXDu,
   {linkedRecordIds:['recv49NbSCmc5nEu3'],valuesByLinkedRecordId:{
     recv49NbSCmc5nEu3:['fake-lszh-e2e@example.invalid']
   }});
 const fields=[
  'Offertennummer','Status','Projektbedingungen Version','AVV erforderlich',
  'Gültig bis','Online-Annahme Token-Hash',
  'Online-Annahme Offerten Drive ID','Online-Annahme Offerten-SHA256',
  'Online-Annahme Bedingungen Drive ID','Online-Annahme Bedingungen-SHA256'
 ];
 for(const field of fields){
   const changed={...original,[field]:'MISMATCH'};
   assert.throws(()=>checkBusinessDraft(changed),/pinned_airtable_draft_changed/);
 }
 for(const field of ['Echtbetrieb – kein Test','Online-Annahme rechtlich freigegeben',
   'Versand freigegeben','Vertragsunterlagen akzeptiert']){
   assert.throws(()=>checkBusinessDraft({...original,[field]:true}),/pinned_airtable_draft_changed/);
 }
 assert.throws(()=>checkBusinessDraft({...original,
   'Lead E-Mail':['real@company.example']}),/pinned_airtable_draft_changed/);
});
test('Firestore REST payload supports atomic offer/index data including maps and booleans',async()=>{
 const {fieldsTyped}=await load();
 const result=fieldsTyped({
   status:'sent',approved:true,revision:1,
   evidence:null,source:{recordId:'recensIiczNGsoPeR'},
   bundle:{quote:{sha256:'a'.repeat(64)}},
   missing:undefined
 });
 assert.deepEqual(result.status,{stringValue:'sent'});
 assert.deepEqual(result.approved,{booleanValue:true});
 assert.deepEqual(result.revision,{integerValue:'1'});
 assert.deepEqual(result.evidence,{nullValue:null});
 assert.equal(result.source.mapValue.fields.recordId.stringValue,'recensIiczNGsoPeR');
 assert.equal(result.bundle.mapValue.fields.quote.mapValue.fields.sha256.stringValue,'a'.repeat(64));
 assert.equal('missing' in result,false);
});
