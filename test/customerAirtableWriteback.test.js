'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
async function mod(){return import('../cloud-run/offer-portal-production/customerAirtableWriteback.mjs');}
function fixture(mode='Nein'){
 const token='a'.repeat(64);
 const avv=mode==='Ja'?{id:'1CDEFGHIJKLMNOPQRSTUVWXYZ1234567',sha256:'d'.repeat(64)}:null;
 const offer={
  tokenHash:token,status:'accepted',approved:true,
  offerNumber:'LSZH-2026-0001',termsVersion:'v1.0',
  recipientEmail:'pilot@fictional.example',
  source:{kind:'LSZH_CUSTOMER_APPROVED_V1',baseId:'appzJiskpAdaR1HEv',
   tableId:'tbljeIUoD7wwKuSmS',recordId:'recABCDEFGH123456',
   legalApproved:true,liveApproved:true},
  bundle:{avv_required:mode,
   quote:{id:'1ABCDEFGHIJKLMNOPQRSTUVWX123456',sha256:'b'.repeat(64)},
   terms:{id:'1BCDEFGHIJKLMNOPQRSTUVWXYZ123456',sha256:'c'.repeat(64)},
   ...(avv?{avv}:{})},
  details:{...(avv?{avvVersion:'AVV-PILOT-1.0'}:{})},
  evidence:{
   method:'lszh_b2b_customer_v1',
   offer_number:'LSZH-2026-0001',
   accepted_at_utc:'2026-10-19T12:00:00.000Z',
   terms_version:'v1.0',email:'pilot@fictional.example',
   quote_pdf_sha256:'b'.repeat(64),terms_pdf_sha256:'c'.repeat(64),
   avv_required:mode==='Ja',
   avv_pdf_sha256:mode==='Ja'?'d'.repeat(64):null,
   avv_version:mode==='Ja'?'AVV-PILOT-1.0':null,
   name:'Pilot Testperson',authorized_confirmed:true,
   quote_confirmed:true,terms_confirmed:true,
   avv_confirmed:mode==='Ja'
  }
 };
 const fields={
  Offertennummer:offer.offerNumber,
  Status:'Versendet',
  'Projektbedingungen Version':'v1.0',
  'Online-Annahme Token-Hash':token,
  'AVV erforderlich':mode,
  'Online-Annahme rechtlich freigegeben':true,
  'Echtbetrieb – kein Test':true,
  'Versand freigegeben':true,
  'Vertragsunterlagen versendet':true,
  'Lead E-Mail':['pilot@fictional.example'],
  'Online-Annahme Offerten Drive ID':offer.bundle.quote.id,
  'Online-Annahme Offerten-SHA256':offer.bundle.quote.sha256,
  'Online-Annahme Bedingungen Drive ID':offer.bundle.terms.id,
  'Online-Annahme Bedingungen-SHA256':offer.bundle.terms.sha256,
  ...(avv?{'Online-Annahme AVV Drive ID':avv.id,
    'Online-Annahme AVV-SHA256':avv.sha256,
    'Online-Annahme AVV-Version':'AVV-PILOT-1.0'}:{})
 };
 return {offer,record:{id:offer.source.recordId,fields}};
}
test('accepted customer writes approved status and evidence to exactly one Airtable record',async()=>{
 const {executeCustomerAirtableAcceptanceWriteback:f}=await mod();
 const data=fixture(),r=data.record;let patched=0;
 const client={readRecord:async()=>structuredClone(r),
  patchRecord:async (addr,payload)=>{
   assert.equal(addr.recordId,r.id);
   patched++;
   Object.assign(r.fields,payload.fields);
   return structuredClone(r);
  }};
 const first=await f(data.offer,client);
 assert.equal(first.result,'customer_fields_patched');
 assert.equal(patched,1);
 assert.equal(r.fields.Status,'Angenommen');
 assert.equal(r.fields['Online-Annahme E-Mail'],'pilot@fictional.example');
 const second=await f(data.offer,client);
 assert.equal(second.result,'already_identical');
 assert.equal(patched,1);
});
test('AVV version and consent must match before Airtable write',async()=>{
 const {executeCustomerAirtableAcceptanceWriteback:f}=await mod();
 const data=fixture('Ja');let patched=0;
 const client={readRecord:async()=>data.record,
  patchRecord:async()=>{patched++;throw Error('unexpected_patch')}};
 data.record.fields['Online-Annahme AVV-Version']='other';
 await assert.rejects(()=>f(data.offer,client),/avv_changed/);
 assert.equal(patched,0);
});
test('changed customer email, false legal flag or conflicting acceptance fails closed',async()=>{
 const {executeCustomerAirtableAcceptanceWriteback:f}=await mod();
 for(const change of [
  r=>r.fields['Lead E-Mail']=['different@fictional.example'],
  r=>r.fields['Online-Annahme rechtlich freigegeben']=false,
  r=>r.fields['Versand freigegeben']=false,
  r=>r.fields.Status='Angenommen',
  r=>r.fields['Online-Annahme Nachweis']='stale_evidence'
 ]){
  const data=fixture();change(data.record);
  const client={readRecord:async()=>data.record,patchRecord:async()=>{throw Error('must not patch')}};
  await assert.rejects(()=>f(data.offer,client));
 }
});
test('invalid provider confirmation requires manual reconciliation',async()=>{
 const {executeCustomerAirtableAcceptanceWriteback:f}=await mod();
 const data=fixture();
 const client={readRecord:async()=>data.record,
  patchRecord:async()=>({id:data.record.id,fields:{Status:'Versendet'}})};
 await assert.rejects(()=>f(data.offer,client),/patch_unconfirmed/);
});

test('refuses to publish acceptance if evidence PDF hashes differ from approved archive bundle',async()=>{
 const {executeCustomerAirtableAcceptanceWriteback:f}=await mod();
 for(const mode of ['Nein','Ja']){
  for(const field of ['quote_pdf_sha256','terms_pdf_sha256',...(mode==='Ja'?['avv_pdf_sha256','avv_version']:[])]){
   const data=fixture(mode),record=data.record;
   data.offer.evidence[field]='tampered';
   let writes=0;
   const client={readRecord:async()=>record,patchRecord:async()=>{writes++;throw Error('must_not_patch')}};
   await assert.rejects(()=>f(data.offer,client),
    /invalid_accepted_source|avv_changed/);
   assert.equal(writes,0,mode+' '+field);
  }
 }
});
test('refuses unexpected AVV evidence when customer did not require AVV',async()=>{
 const {executeCustomerAirtableAcceptanceWriteback:f}=await mod();
 const data=fixture('Nein');
 data.offer.evidence.avv_confirmed=true;
 let writes=0;
 await assert.rejects(()=>f(data.offer,{
  readRecord:async()=>data.record,patchRecord:async()=>{writes++;throw Error('must_not_patch')}
 }),/unexpected_avv/);
 assert.equal(writes,0);
});
