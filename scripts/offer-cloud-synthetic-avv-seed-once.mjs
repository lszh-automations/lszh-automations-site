#!/usr/bin/env node
// One real, operator-approved synthetic Firestore seed; no customer data.
// --check is offline. --apply does EXACTLY TWO atomic create-only Firestore
// writes after re-reading the pinned business Airtable draft; never deploys.
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {mapSyntheticAirtableOffer,SOURCE} from
  '../cloud-run/offer-portal-staging/airtableSyntheticImport.mjs';
import {syntheticSourceIndexId,SYNTHETIC_SOURCE_INDEX} from
  '../cloud-run/offer-portal-staging/syntheticSourceIndex.mjs';
import {STAGING_COLLECTION} from
  '../cloud-run/offer-portal-staging/firestoreOfferStore.mjs';
const PROJECT='lszh-automations',DATABASE='lszh-offers-staging';
const RECORD='recktLXj5wUxLmHFQ';
const LEAD='recv49NbSCmc5nEu3';
const NUMBER='TEST_CLOUD_AVV_JA_20261019_NO_CONTRACT';
let TOKEN_HASH=null;
const QUOTE='1-GQyj0cKC4aAJD_9wrxanckCJisEy0nB';
const QUOTE_HASH='2dd5c5377461c969b9a436f36999150dc53cf159f02e4985e2f2536b683b004c';
const TERMS='1yPtsWTeEUclniKFWRM81EHEUMnu1E9nO';
const TERMS_HASH='baec0946db9b892da86e4009ade769863d5087d8961e16940d0dda420d1bf279';
const AVV='1p2ZRrPuSuaICH9W4N0afK5xt8xeOeKZI';
const AVV_HASH='53f9deda2000e219f79e0496b33f1e74df8ac00eac09f221b2436c3fd848d060';
const AVV_VERSION='TEST_ONLY_AVV_v1.0_RC1';
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
 if(!m||(TOKEN_HASH!==null&&hash(m[1])!==TOKEN_HASH))fail('token_identity_mismatch');
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
   f['AVV erforderlich']==='Ja' &&
   f['Online-Annahme AVV Drive ID']===AVV &&
   f['Online-Annahme AVV-SHA256']===AVV_HASH &&
   f['Online-Annahme AVV-Version']===AVV_VERSION &&
   f['Gültig bis']==='2099-12-31' &&
   (TOKEN_HASH===null||f['Online-Annahme Token-Hash']===TOKEN_HASH) &&
   f['Online-Annahme Offerten Drive ID']===QUOTE &&
   f['Online-Annahme Offerten-SHA256']===QUOTE_HASH &&
   f['Online-Annahme Bedingungen Drive ID']===TERMS &&
   f['Online-Annahme Bedingungen-SHA256']===TERMS_HASH &&
   f['Echtbetrieb – kein Test']!==true &&
   f['Online-Annahme rechtlich freigegeben']!==true &&
   f['Versand freigegeben']!==true &&
   f['Vertragsunterlagen akzeptiert']!==true &&
   f['Online-Annahme AVV ausdrücklich akzeptiert']!==true &&
   !f['Online-Annahme Beleg Drive ID'] &&
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
   [SOURCE.avvId]:f['Online-Annahme AVV Drive ID'],
   [SOURCE.avvSha]:f['Online-Annahme AVV-SHA256'],
   [SOURCE.avvVersion]:f['Online-Annahme AVV-Version'],
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
 try {
 const [mode,tokenFile]=process.argv.slice(2);
 if(mode!=='--apply'||!tokenFile?.startsWith('/'))fail('usage: --apply /absolute/private-token.txt');
 if(process.env.FIRESTORE_EMULATOR_HOST||process.env.K_SERVICE)fail('operator_shell_required');
 if(command('config','get-value','account')!=='lars@lszh-automations.ch'||
    command('config','get-value','project')!==PROJECT)fail('wrong_business_cloud_account');
 const pat=command('secrets','versions','access','1','--secret=lszh-offer-cloud-e2e-airtable','--project='+PROJECT);
 const auth=command('auth','print-access-token');
 const rowUrl='https://api.airtable.com/v0/'+SOURCE.base+'/'+SOURCE.table+'/'+RECORD;
 let r=await http(rowUrl,pat);
 if(!r.ok)fail('airtable_read_failed');
 let row=await r.json();
 if(row.id!==RECORD)fail('wrong_record');
 checkBusinessDraft(row.fields);
 const existingHash=row.fields['Online-Annahme Token-Hash'];
 if(existingHash&&!existsSync(tokenFile))fail('existing_hash_requires_original_local_token_file');
 if(!existsSync(tokenFile)){
   writeFileSync(tokenFile,'Single-use invitation code: '+randomBytes(32).toString('base64url')+'\n',{mode:0o600,flag:'wx'});
 }
 chmodSync(tokenFile,0o600);
 const code=tokenFromFile(tokenFile);
 TOKEN_HASH=hash(code);
 if(existingHash&&existingHash!==TOKEN_HASH)fail('local_token_does_not_match_record');
 const indexId=syntheticSourceIndexId(RECORD);
 const prefix='projects/'+PROJECT+'/databases/'+DATABASE+'/documents/';
 const offerName=prefix+STAGING_COLLECTION+'/'+TOKEN_HASH;
 const indexName=prefix+SYNTHETIC_SOURCE_INDEX+'/'+indexId;
 // Inspect before any Airtable mutation; never seed over a previous source.
 for(const name of [offerName,indexName]){
   const check=await http('https://firestore.googleapis.com/v1/'+name,auth);
   if(check.status!==404)fail(check.ok?'source_already_seeded_do_not_repeat':'firestore_preflight_failed');
 }
 if(!existingHash){
   r=await http(rowUrl,pat,'PATCH',{fields:{'Online-Annahme Token-Hash':TOKEN_HASH}});
   if(!r.ok)fail('hash_write_uncertain_inspect_before_retry');
 }
 r=await http(rowUrl,pat);
 if(!r.ok)fail('airtable_readback_failed');
 row=await r.json();
 if(row.id!==RECORD)fail('wrong_readback_record');
 const item=mapSyntheticAirtableOffer(toAirtableAppRecord(checkBusinessDraft(row.fields)));
 if(item.bundle.avv_required!=='Ja'||item.source.recordId!==RECORD||item.tokenHash!==TOKEN_HASH)
   fail('mapped_offer_mismatch');
 const index={schemaVersion:1,purpose:'LSZH_SYNTHETIC_LOCAL_SOURCE_INDEX_V1',
   sourceBaseId:SOURCE.base,sourceTableId:SOURCE.table,sourceRecordId:RECORD,tokenHash:TOKEN_HASH};
 const writes=[{update:{name:offerName,fields:fieldsTyped(item)},currentDocument:{exists:false}},
   {update:{name:indexName,fields:fieldsTyped(index)},currentDocument:{exists:false}}];
 r=await http(API+':commit',auth,'POST',{writes});
 if(!r.ok)fail('atomic_commit_uncertain_read_back_before_retry');
 for(const [name,expected] of [[offerName,item],[indexName,index]]){
   r=await http('https://firestore.googleapis.com/v1/'+name,auth);
   if(!r.ok)fail('firestore_readback_failed');
   const got=await r.json();
   if(got.name!==name)fail('firestore_wrong_document');
   for(const [key,value] of Object.entries(fieldsTyped(expected))){
     if(JSON.stringify(got.fields[key])!==JSON.stringify(value)){
       // Object key order is not significant in Firestore mapValue responses.
       const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?
         Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
       if(stable(got.fields[key])!==stable(value))fail('firestore_readback_value_mismatch');
     }
   }
 }
 console.log('PASS: AVV-Ja-Testtoken lokal gespeichert; kein Token ausgegeben.');
 console.log('PASS: exakt ein AVV-Ja-Firestore-Testfall samt Quellindex atomar angelegt und zurueckgelesen.');
 console.log('Kein Deployment, keine Annahme, kein Make-Lauf, keine E-Mail. Seed nicht wiederholen.');
 }catch(e){console.error('STOP:',/^CLOUD_TEST_NO_GO:/.test(e.message)?e.message:'provider_or_local_operation_failed');
 console.error('Bei unklarem Schreibstatus zuerst pruefen, nicht blind wiederholen.');process.exitCode=1;}
}
