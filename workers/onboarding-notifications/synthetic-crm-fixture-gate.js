'use strict';
// OFFLINE-ONLY guard for the specifically approved LSZH synthetic Airtable CRM
// test-record envelope. No SDK, API, network calls, Airtable writes or credentials.
// This is a necessary preflight and not proof that unseen automations won't fire.
const crypto=require('node:crypto');
const CODE=/^ob_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const ID=/^rec[A-Za-z0-9]{14}$/;
const LABEL='LSZH SYNTHETISCH – NUR TEST – E2E';
const EMAIL='synthetisch@example.invalid';
const ADDRESS={
 'Rechnungsstrasse':'Testweg 1','Rechnungs-PLZ':'0000',
 'Rechnungsort':'Musterstadt','Rechnungsland':'Schweiz',
 'Rechnungs-E-Mail':EMAIL
};
const SAFE_ORDER={
 'Leistung':'Beratung','Status':'Pausiert',
 'Abrechnungsmodell':'Individuell',
 'Nächste Fakturierung':null,
 'Einmalig CHF':0,'Monatlich CHF':0,
 'Standardaufgaben erstellt':true,
 'Projektabschluss durchgeführt':false,
 'Verbindungen erforderlich':true,
 'AVV erforderlich':'Prüfen',
 'Make-Kontostatus':'Noch kein Make-Konto',
 'Make-Organisation':'',
 'Make-Einladungsstatus':'Noch nicht eingeladen',
 'Make-Zugriff bestätigt':false
};
const SAFE_ONBOARDING={
 'Status':'Eingegangen','Sensible Daten':'Nein',
 'Make-Konto Status':'Noch kein Make-Konto',
 'Make-Organisation':'',
 'Make-Einladung Status':'Noch nicht eingeladen'
};
function isRealFreshToken(v) {
 return typeof v==='string'&&CODE.test(v)&&
  v!=='ob_00000000-0000-4000-8000-000000000000';
}
function strictFields(obj,expected,label){
 if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error(label+'_missing');
 for(const key of Object.keys(expected)){
  if(!Object.hasOwn(obj,key)||obj[key]!==expected[key])
   throw Error(label+'_unsafe_'+key.replace(/[^A-Za-z]/g,'_'));
 }
 for(const key of Object.keys(obj)){
  if(!Object.hasOwn(expected,key))throw Error(label+'_unexpected_field');
 }
}
function buildPlan({projectCode,customerId,orderId}={}) {
 if(!isRealFreshToken(projectCode))throw Error('unsafe_fixture_project_code');
 if(!ID.test(customerId||''))throw Error('invalid_synthetic_customer_id');
 if(!ID.test(orderId||''))throw Error('invalid_synthetic_order_id');
 if(customerId===orderId)throw Error('synthetic_link_identity_conflict');
 const customer={
  'Firma':LABEL,'Ansprechpartner':'Fiktive Testperson','E-Mail':EMAIL,
  ...ADDRESS
 };
 const order={
  'Auftrag':LABEL,'Kunde':[customerId],
  'Onboarding-Token':projectCode,...SAFE_ORDER
 };
 const onboarding={
  'Onboarding':LABEL,'Projektcode':projectCode,
  'Auftrag':[orderId],'Kunde':[customerId],...ADDRESS,
  ...SAFE_ONBOARDING
 };
 return {customer,order,onboarding};
}
function validateBeforeWrite({projectCode,customerId,orderId,proposed}={}) {
 const baseline=buildPlan({projectCode,customerId,orderId});
 if(!proposed||typeof proposed!=='object')throw Error('fixture_plan_missing');
 for(const key of ['customer','order','onboarding']){
  const actual=proposed[key],expected=baseline[key];
  if(!actual||typeof actual!=='object'||Array.isArray(actual))throw Error('bad_'+key);
  // Verify all fields exactly; linked-record arrays compare by value.
  for(const field of Object.keys(expected)){
   if(!Object.hasOwn(actual,field)||
      JSON.stringify(actual[field])!==JSON.stringify(expected[field]))
      throw Error('unsafe_'+key+'_field');
  }
  if(Object.keys(actual).length!==Object.keys(expected).length)
   throw Error('unexpected_'+key+'_fields');
 }
 for(const key of Object.keys(proposed))if(!Object.hasOwn(baseline,key))
  throw Error('unexpected_record_kind');
 return true;
}
module.exports={isRealFreshToken,buildPlan,validateBeforeWrite,SAFE_ORDER,SAFE_ONBOARDING};
