#!/usr/bin/env node
// One named non-binding pilot. Never prints the private invitation or credentials.
import {execFileSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {mapSyntheticAirtableOffer,SOURCE} from '../cloud-run/offer-portal-staging/airtableSyntheticImport.mjs';
import {INTERNAL_TEST_PILOT as P} from '../cloud-run/offer-portal-staging/internalTestPilot.mjs';
import {fieldsTyped} from './offer-cloud-synthetic-seed-once.mjs';
import {syntheticSourceIndexId,SYNTHETIC_SOURCE_INDEX} from '../cloud-run/offer-portal-staging/syntheticSourceIndex.mjs';
const RECORD='recR70ZSPynGqA1LS',LEAD='recP27RfNgnJzLM75';
const PROJECT='lszh-automations',DB='lszh-offers-staging';
const ROOT=`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DB}/documents`;
const ROW=`https://api.airtable.com/v0/${SOURCE.base}/${SOURCE.table}/${RECORD}`;
const STATE=homedir()+'/.lszh-internal-test-pilot-20261019.json';
const hash=x=>createHash('sha256').update(x).digest('hex');
function fail(code){throw Error(code);}
function cloud(...args){try{return execFileSync('gcloud',args,{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:30000}).trim();}catch{fail('cloud_command_failed');}}
async function api(url,token,method='GET',body){
 const r=await fetch(url,{method,redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 if(!r.ok)fail('provider_http_'+r.status);return r.json();
}
function decode(v){
 for(const k of ['stringValue','booleanValue','timestampValue','doubleValue'])if(k in v)return v[k];
 if('integerValue' in v)return Number(v.integerValue);if('nullValue' in v)return null;
 if(v.mapValue)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,v])=>[k,decode(v)]));
 if(v.arrayValue)return (v.arrayValue.values||[]).map(decode);fail('unknown_firestore_type');
}
const mode=process.argv[2];
try{
 if(!['--seed','--readback','--status'].includes(mode))fail('use_seed_or_readback');
 if(cloud('config','get-value','account')!=='lars@lszh-automations.ch')fail('wrong_account');
 const google=cloud('auth','print-access-token');
 const pat=cloud('secrets','versions','access','1','--secret=lszh-offer-cloud-e2e-airtable','--project='+PROJECT);
 const row=await api(ROW+'?returnFieldsByFieldId=true',pat);const f=row.fields;
 if(row.id!==RECORD||f[SOURCE.number]!==P.number||f[SOURCE.terms]!=='TEST_v1.0_RC1'||
  f[SOURCE.avvRequired]!=='Nein'||!String(f[SOURCE.internalNote]||'').includes(P.purpose)||
  ['prod','legal','released'].some(k=>f[SOURCE[k]]===true)||
  JSON.stringify(f[SOURCE.email])!==JSON.stringify([P.email])||
  JSON.stringify(f.fldLWovRzZmxG2h0N)!==JSON.stringify([LEAD])||f.fldb9HdUFDOFYyICg!==true)
  fail('source_identity_or_release_mismatch');
 let state=existsSync(STATE)?JSON.parse(readFileSync(STATE,'utf8')):null;
 if(mode==='--seed'){
  if(state)fail('private_state_exists_readback_before_retry');
  if(f[SOURCE.status]!=='Entwurf'||f[SOURCE.accepted]===true||f[SOURCE.tokenHash])fail('source_not_new');
  const code=randomBytes(36).toString('base64url');state={recordId:RECORD,code,tokenHash:hash(code)};
  // Persist private token BEFORE any mutation; exclusive file creation.
  writeFileSync(STATE,JSON.stringify(state),{mode:0o600,flag:'wx'});
  await api(ROW,pat,'PATCH',{fields:{[SOURCE.tokenHash]:state.tokenHash}});
  f[SOURCE.tokenHash]=state.tokenHash;
  const cells={...f,[SOURCE.email]:{linkedRecordIds:[LEAD],valuesByLinkedRecordId:{[LEAD]:[P.email]}}};
  const item=mapSyntheticAirtableOffer({id:RECORD,cellValuesByFieldId:cells},{internalPilotRecordId:RECORD});
  const index={schemaVersion:1,purpose:'LSZH_SYNTHETIC_LOCAL_SOURCE_INDEX_V1',sourceBaseId:SOURCE.base,
   sourceTableId:SOURCE.table,sourceRecordId:RECORD,tokenHash:state.tokenHash};
  const docs=[['lszh_staging_offers_v1/'+state.tokenHash,item],[SYNTHETIC_SOURCE_INDEX+'/'+syntheticSourceIndexId(RECORD),index]];
  await api(ROOT+':commit',google,'POST',{writes:docs.map(([path,value])=>({
   update:{name:ROOT.split('/v1/')[1]+'/'+path,fields:fieldsTyped(value)},currentDocument:{exists:false}}))});
  console.log('PASS: new TEST_ONLY source token hash and atomic staging offer/index created.');
 }
 if(!state||state.recordId!==RECORD||hash(state.code)!==state.tokenHash)fail('private_state_missing_or_invalid');
 const raw=await api(ROOT+'/lszh_staging_offers_v1/'+state.tokenHash,google);
 const s=Object.fromEntries(Object.entries(raw.fields).map(([k,v])=>[k,decode(v)]));
 if(s.source.recordId!==RECORD||s.source.internalPilot!==P.purpose||s.recipientEmail!==P.email||
  s.offerNumber!==P.number||s.details.company!==P.company||s.tokenHash!==state.tokenHash)fail('firestore_identity_mismatch');
 if(mode==='--readback'){
  const fresh=(await api(ROW,pat)).fields;
  if(s.status!=='accepted'||s.evidence?.name!=='Lars Schulthess'||s.evidence?.email!==P.email||
   s.evidence.quote_confirmed!==true||s.evidence.terms_confirmed!==true||s.evidence.authorized_confirmed!==true||
   s.evidence.avv_required!==false||s.evidence.quote_pdf_sha256!==s.bundle.quote.sha256||
   s.evidence.terms_pdf_sha256!==s.bundle.terms.sha256||fresh.Status!=='Angenommen'||
   fresh['Online-Annahme Person']!=='Lars Schulthess'||fresh['Online-Annahme E-Mail']!==P.email||
   fresh['Online-Annahme Offerten-SHA256']!==s.bundle.quote.sha256||
   fresh['Online-Annahme Bedingungen-SHA256']!==s.bundle.terms.sha256||
   Date.parse(fresh['Online-Annahme Zeitstempel'])!==Date.parse(s.acceptedAt)||
   fresh['Online-Annahme rechtlich freigegeben']===true||fresh['Echtbetrieb – kein Test']===true||
   fresh['Versand freigegeben']===true)fail('acceptance_readback_mismatch_manual_review');
  // Purely descriptive test evidence: no legal/operational release field.
  if(!fresh['Online-Annahme Nachweis'])await api(ROW,pat,'PATCH',{fields:{
   'Online-Annahme Nachweis':JSON.stringify({purpose:P.purpose,test_only:true,no_contract:true,
    sourceRecordId:RECORD,accepted_at_utc:s.acceptedAt,name:s.evidence.name,email:P.email,
    quote_confirmed:true,terms_confirmed:true,avv_required:false,
    quote_pdf_sha256:s.bundle.quote.sha256,terms_pdf_sha256:s.bundle.terms.sha256})}});
  console.log('PASS: independent Firestore/Airtable acceptance, person, consents, hashes and timestamps match.');
 }else console.log('PASS: independent staging offer readback; private invitation remains only in operator file. Status: '+s.status);
}catch(e){console.error('STOP: '+(/^[a-z0-9_]+$/.test(e.message)?e.message:'internal_pilot_failed_inspect_without_replay'));process.exitCode=1;}
