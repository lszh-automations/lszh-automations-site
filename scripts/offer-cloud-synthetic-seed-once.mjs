#!/usr/bin/env node
// One real, operator-approved synthetic Firestore seed; no customer data.
// --check is offline. --apply does EXACTLY TWO atomic create-only Firestore
// writes after re-reading the pinned business Airtable draft; never deploys.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {mapSyntheticAirtableOffer,SOURCE} from
  '../cloud-run/offer-portal-staging/airtableSyntheticImport.mjs';
import {syntheticSourceIndexId,SYNTHETIC_SOURCE_INDEX} from
  '../cloud-run/offer-portal-staging/syntheticSourceIndex.mjs';
import {STAGING_COLLECTION} from
  '../cloud-run/offer-portal-staging/firestoreOfferStore.mjs';
const PROJECT='lszh-automations',DATABASE='lszh-offers-staging';
const RECORD='recensIiczNGsoPeR';
const LEAD='recv49NbSCmc5nEu3';
const NUMBER='TEST_CLOUD_E2E_20261018_NO_CONTRACT';
const TOKEN_HASH='55f035054bf4f5501cf134a9573075e2ef415ce8820290fbd154f017b1394083';
const QUOTE='1gj6F7am7ouIj-M2kRMa53b7MMgtMgvIt';
const QUOTE_HASH='1c337295c205697dd940668bfc2fb4141fbc67d9dc21f27e764d67ac02e48233';
const TERMS='1yPtsWTeEUclniKFWRM81EHEUMnu1E9nO';
const TERMS_HASH='baec0946db9b892da86e4009ade769863d5087d8961e16940d0dda420d1bf279';
const EMAIL='fake-lszh-e2e@example.invalid';
const API='https://firestore.googleapis.com/v1/projects/'+PROJECT+
 '/databases/'+DATABASE+'/documents';
function fail(code){throw Error('CLOUD_TEST_NO_GO:'+code);}
function command(...args){
 try{return execFileSync('gcloud',args,{encoding:'utf8',
   timeout:15000,stdio:['ignore','pipe','ignore']}).trim();}
 catch{fail('business_gcloud_auth_required');}
}
const hash=x=>createHash('sha256').update(x).digest('hex');
const tokenFromFile=path=>{
 if(!path||!path.startsWith('/'))fail('absolute_private_token_file_required');
 let body;
 try{body=readFileSync(path,'utf8');}catch{fail('token_file_missing');}
 const m=body.match(/^Single-use invitation code: ([A-Za-z0-9_-]{40,80})$/m);
 if(!m||hash(m[1])!==TOKEN_HASH)fail('token_identity_mismatch');
 return m[1];
};
function typed(v){
 if(v===null)return {nullValue:null};
 if(typeof v==='string')return {stringValue:v};
 if(typeof v==='boolean')return {booleanValue:v};
 if(typeof v==='number'&&Number.isSafeInteger(v))return {integerValue:String(v)};
 if(typeof v==='number'&&Number.isFinite(v))return {doubleValue:v};
 if(Array.isArray(v))return {arrayValue:{values:v.map(typed)}};
 if(v&&typeof v==='object')return {mapValue:{fields:fieldsTyped(v)}};
 fail('unsupported_firestore_value');
}
function fieldsTyped(v){
 return Object.fromEntries(Object.entries(v).filter(([,value])=>
   value!==undefined).map(([key,value])=>[key,typed(value)]));
}
function checkBusinessDraft(f){
 const matches=f.Offertennummer===NUMBER && f.Status==='Entwurf' &&
   f['Projektbedingungen Version']==='TEST_v1.0_RC1' &&
   f['AVV erforderlich']==='Nein' &&
   f['Gültig bis']==='2099-12-31' &&
   f['Online-Annahme Token-Hash']===TOKEN_HASH &&
   f['Online-Annahme Offerten Drive ID']===QUOTE &&
   f['Online-Annahme Offerten-SHA256']===QUOTE_HASH &&
   f['Online-Annahme Bedingungen Drive ID']===TERMS &&
   f['Online-Annahme Bedingungen-SHA256']===TERMS_HASH &&
   f['Echtbetrieb – kein Test']!==true &&
   f['Online-Annahme rechtlich freigegeben']!==true &&
   f['Versand freigegeben']!==true &&
   f['Vertragsunterlagen akzeptiert']!==true &&
   f['Online-Annahme Bestätigung gesendet am']==null &&
   Array.isArray(f.Lead) && f.Lead.length===1 && f.Lead[0]===LEAD &&
   Array.isArray(f['Lead E-Mail']) &&
   f['Lead E-Mail'].length===1 && f['Lead E-Mail'][0]===EMAIL &&
   /TEST ONLY/i.test(f['Interne Notiz']||'') &&
   /NO CONTRACT/i.test(f['Interne Notiz']||'');
 if(!matches)fail('pinned_airtable_draft_changed');
 return f;
}
function toAirtableAppRecord(f){
 const email={linkedRecordIds:[LEAD],valuesByLinkedRecordId:{[LEAD]:[EMAIL]}};
 return {id:RECORD,cellValuesByFieldId:{
   [SOURCE.number]:f.Offertennummer,
   [SOURCE.status]:{name:f.Status},
   [SOURCE.terms]:f['Projektbedingungen Version'],
   [SOURCE.avvRequired]:{name:f['AVV erforderlich']},
   [SOURCE.validUntil]:f['Gültig bis'],
   [SOURCE.email]:email,
   [SOURCE.tokenHash]:f['Online-Annahme Token-Hash'],
   [SOURCE.quoteId]:f['Online-Annahme Offerten Drive ID'],
   [SOURCE.quoteSha]:f['Online-Annahme Offerten-SHA256'],
   [SOURCE.termsId]:f['Online-Annahme Bedingungen Drive ID'],
   [SOURCE.termsSha]:f['Online-Annahme Bedingungen-SHA256'],
   [SOURCE.prod]:false,[SOURCE.legal]:false,[SOURCE.released]:false,
   [SOURCE.accepted]:false,[SOURCE.avvAccepted]:false,
   [SOURCE.internalNote]:f['Interne Notiz']
 }};
}
async function http(url,auth,method='GET',body){
 const r=await fetch(url,{
   method,headers:{Authorization:'Bearer '+auth,
     ...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),
   redirect:'error',signal:AbortSignal.timeout(20000)});
 return r;
}
export {checkBusinessDraft,fieldsTyped,toAirtableAppRecord,tokenFromFile};
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const [mode,tokenFile]=process.argv.slice(2);
 if(!['--check','--apply'].includes(mode)||!tokenFile)
   fail('usage: --check|--apply /absolute/path/to/private-token.txt');
 const code=tokenFromFile(tokenFile);
 if(hash(code)!==TOKEN_HASH)fail('mismatched_test_token');
 if(mode==='--check'){
   console.log('PASS: pinned synthetic invitation code matches the known business Airtable draft.');
   console.log('NO Cloud Run, Firestore, Airtable, Drive or Make request executed.');
 }else{
   if(process.env.LSZH_SINGLE_SYNTHETIC_SEED_APPROVED!=='YES'||
      process.env.FIRESTORE_EMULATOR_HOST||process.env.K_SERVICE)
     fail('explicit_single_seed_approval_required');
   if(command('config','get-value','account')!=='lars@lszh-automations.ch'||
      command('config','get-value','project')!==PROJECT)
     fail('wrong_business_cloud_account');
   const airtableToken=process.env.LSZH_AIRTABLE_ACCESS_TOKEN;
   if(typeof airtableToken!=='string'||airtableToken.length<12)
     fail('business_airtable_token_required');
   const source=await http('https://api.airtable.com/v0/'+SOURCE.base+'/'+
      SOURCE.table+'/'+RECORD,airtableToken);
   if(!source.ok)fail('business_airtable_get_failed');
   const row=await source.json();
   if(row.id!==RECORD)fail('source_record_mismatch');
   const item=mapSyntheticAirtableOffer(toAirtableAppRecord(
     checkBusinessDraft(row.fields)));
   if(item.tokenHash!==TOKEN_HASH||item.source.recordId!==RECORD)
     fail('mapped_synthetic_source_mismatch');
   const googleToken=command('auth','print-access-token');
   const indexId=syntheticSourceIndexId(RECORD);
   const offerName='projects/'+PROJECT+'/databases/'+DATABASE+
     '/documents/'+STAGING_COLLECTION+'/'+TOKEN_HASH;
   const indexName='projects/'+PROJECT+'/databases/'+DATABASE+
     '/documents/'+SYNTHETIC_SOURCE_INDEX+'/'+indexId;
   // Read both first; any ambiguous response or already-present record STOP.
   for(const name of [offerName,indexName]){
     const check=await http('https://firestore.googleapis.com/v1/'+name,googleToken);
     if(check.status!==404)fail(check.ok?'synthetic_source_already_seeded':
       'firestore_preflight_unavailable');
   }
   const index={
     schemaVersion:1,purpose:'LSZH_SYNTHETIC_LOCAL_SOURCE_INDEX_V1',
     sourceBaseId:SOURCE.base,sourceTableId:SOURCE.table,
     sourceRecordId:RECORD,tokenHash:TOKEN_HASH
   };
   // A single Firestore :commit is atomic. Both writes are create-only.
   const writes=[
     {update:{name:offerName,fields:fieldsTyped(item)},currentDocument:{exists:false}},
     {update:{name:indexName,fields:fieldsTyped(index)},currentDocument:{exists:false}}
   ];
   const result=await http('https://firestore.googleapis.com/v1/projects/'+
     PROJECT+'/databases/'+DATABASE+'/documents:commit',googleToken,'POST',{writes});
   if(!result.ok)fail('firestore_atomic_commit_failed_read_back_before_any_retry');
   for(const name of [offerName,indexName]){
     const r=await http('https://firestore.googleapis.com/v1/'+name,googleToken);
     if(!r.ok)fail('firestore_readback_failed');
     const obj=await r.json();
     if(obj.name!==name)fail('firestore_readback_wrong_document');
   }
   console.log('PASS: exactly one TEST_ONLY Firestore offer plus source index atomically created.');
   console.log('PASS: Firestore readback succeeded. NO Cloud Run deploy, Airtable PATCH or email.');
 }
}
