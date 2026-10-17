'use strict';
// STAGING-only, DISABLED-by-default, identity-pinned Firestore document readers.
// Purpose: prepare TWO SEPARATE runtime boundaries, never obtain combined grants.
// This module is NOT imported by server.js or a deployed process.
// No write verbs, role grants, impersonation, email, cloud scheduler or retries.
const {eventId}=require('./outbox');
const {decodeSnapshot,PROJECT:Q_PROJECT,DATABASE:Q_DATABASE,COLLECTION:Q_COLLECTION}=
 require('./firestore-quarantine-cas');
const {PROJECT:O_PROJECT,DATABASE:O_DATABASE,COLLECTION:O_COLLECTION}=
 require('./firestore-store');

const PROJECT='lszh-automations';
const API='https://firestore.googleapis.com/v1/';
const METADATA='http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/';
const ENABLE_FLAG='LSZH_SCOPED_STAGING_READER_ENABLED';
const ID=/^[0-9a-f]{64}$/;
const OUTBOX_KEYS=['schemaVersion','eventType','recordId','state',
 'testOnly','deliveryEnabled','emailSent','createdAt'];
const SCOPES=Object.freeze({
 outbox:Object.freeze({
  email:'lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com',
  database:'lszh-offers-staging',
  collection:'lszh_onboarding_notification_drafts_staging'
 }),
 quarantine:Object.freeze({
  email:'lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com',
  database:'lszh-quarantine-staging',
  collection:'lszh_onboarding_quarantine_cases_staging'
 })
});
if(O_PROJECT!==PROJECT || Q_PROJECT!==PROJECT ||
 O_DATABASE!==SCOPES.outbox.database || O_COLLECTION!==SCOPES.outbox.collection ||
 Q_DATABASE!==SCOPES.quarantine.database || Q_COLLECTION!==SCOPES.quarantine.collection)
 throw Error('scoped_reader_database_config_mismatch');
function fail(reason) { throw Error(reason); }
function exactly(obj,keys) {
 return !!obj && typeof obj==='object' && !Array.isArray(obj) &&
  Object.keys(obj).length===keys.length && keys.every(k=>Object.hasOwn(obj,k));
}
function auditDate(x) {
 if(typeof x!=='string' ||
   !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3}|\.\d{6}|\.\d{9})?Z$/.test(x))
  fail('outbox_document_invalid');
 const fraction=x.match(/\.(\d+)Z$/)?.[1]??'';
 if(fraction.length>3 && !/^0*$/.test(fraction.slice(3)))
  fail('outbox_document_invalid');
 const date=new Date(x);
 if(!Number.isFinite(date.getTime()) ||
  date.toISOString().slice(0,19)!==x.slice(0,19))
  fail('outbox_document_invalid');
 return date.toISOString();
}
function decodeOutboxDraft(document,documentId) {
 const name=API.replace('https://firestore.googleapis.com/v1/','')+
  'projects/'+PROJECT+'/databases/'+SCOPES.outbox.database+
  '/documents/'+SCOPES.outbox.collection+'/'+documentId;
 if(!ID.test(documentId) || document?.name!==name ||
  !exactly(document.fields,OUTBOX_KEYS))
  fail('outbox_document_invalid');
 const f=document.fields;
 const get=(key,type)=>{
  if(!exactly(f[key],[type]))fail('outbox_document_invalid');
  return f[key][type];
 };
 const recordId=get('recordId','stringValue');
 try {
  if(eventId(recordId)!==documentId)fail('outbox_document_invalid');
 }catch {fail('outbox_document_invalid');}
 if(get('schemaVersion','integerValue')!=='1' ||
    get('eventType','stringValue')!=='ONBOARDING_INPUT_PROCESSED_V1' ||
    get('state','stringValue')!=='DRAFT_NOT_SENT' ||
    get('testOnly','booleanValue')!==true ||
    get('deliveryEnabled','booleanValue')!==false ||
    get('emailSent','booleanValue')!==false)
   fail('outbox_document_invalid');
 return Object.freeze({
  schemaVersion:1,eventType:'ONBOARDING_INPUT_PROCESSED_V1',
  recordId,state:'DRAFT_NOT_SENT',testOnly:true,
  deliveryEnabled:false,emailSent:false,
  createdAt:auditDate(get('createdAt','timestampValue'))
 });
}
async function boundedText(response,max) {
 // In the *future* enabled runtime, accept only deliberately small responses.
 if(typeof response?.text!=='function')fail('scoped_reader_response_invalid');
 const size=Number(response.headers?.get?.('content-length'));
 if(Number.isFinite(size) && size>max)fail('scoped_reader_response_oversize');
 const body=await response.text();
 if(typeof body!=='string' || body.length>max)
  fail('scoped_reader_response_oversize');
 return body;
}
async function json(response) {
 let parsed;
 try {parsed=JSON.parse(await boundedText(response,16384));}
 catch {fail('scoped_reader_response_invalid');}
 if(!parsed || typeof parsed!=='object' || Array.isArray(parsed))
  fail('scoped_reader_response_invalid');
 return parsed;
}
function createScopedReader({scope,env=process.env,fetchImpl=globalThis.fetch}={}) {
 if(!Object.hasOwn(SCOPES,scope))fail('scoped_reader_scope_invalid');
 const config=SCOPES[scope];
 if(env[ENABLE_FLAG]!=='true' ||
    env.LSZH_OUTBOX_STAGE_ENABLED!=='false' ||
    env.LSZH_SCOPED_READER_SCOPE!==scope ||
    env.FIRESTORE_PROJECT_ID!==PROJECT ||
    env.FIRESTORE_DATABASE_ID!==config.database ||
    typeof fetchImpl!=='function')
  fail('scoped_reader_disabled');
 const name='projects/'+PROJECT+'/databases/'+config.database+
  '/documents/'+config.collection+'/';
 const metadataHeaders={'Metadata-Flavor':'Google'};
 async function getMetadata(path) {
  const res=await fetchImpl(METADATA+path,{
   method:'GET',headers:metadataHeaders,
   redirect:'manual',signal:AbortSignal.timeout(5000)
  });
  if(res.status!==200)fail('scoped_reader_identity_unavailable');
  return res;
 }
 async function read(documentId) {
  if(typeof documentId!=='string' || !ID.test(documentId))
   fail('scoped_reader_id_invalid');
  // Confirm actual runtime service-account identity BEFORE obtaining token.
  const identity=await boundedText(await getMetadata('email'),320);
  if(identity.trim()!==config.email)
   fail('scoped_reader_identity_mismatch');
  const tokenInfo=await json(await getMetadata('token'));
  if(typeof tokenInfo.access_token!=='string' ||
     tokenInfo.access_token.length<40 ||
     tokenInfo.token_type!=='Bearer' ||
     !Number.isSafeInteger(tokenInfo.expires_in) ||
     tokenInfo.expires_in<60)
   fail('scoped_reader_token_invalid');
  const url=API+name+documentId;
  const answer=await fetchImpl(url,{
   method:'GET',headers:{Authorization:'Bearer '+tokenInfo.access_token,Accept:'application/json'},
   redirect:'manual',signal:AbortSignal.timeout(10000)
  });
  if(answer.status===404) {
   if(scope==='outbox')fail('outbox_draft_missing');
   return Object.freeze({status:'MISSING',database:config.database,
    writesAllowed:false,deliveryAllowed:false});
  }
  if(answer.status!==200)fail('scoped_reader_document_unavailable');
  const raw=await json(answer);
  if(scope==='outbox') {
   const draft=decodeOutboxDraft(raw,documentId);
   return Object.freeze({status:'VERIFIED_DRAFT',draft,
    writesAllowed:false,deliveryAllowed:false});
  }
  let parsed;
  try {parsed=decodeSnapshot(raw,documentId);}
  catch{fail('quarantine_snapshot_invalid');}
  // The parsed record/updateTime is only read evidence, NOT write authority.
  // No raw credential, request headers or executable CAS request are returned.
  return Object.freeze({status:'VERIFIED_QUARANTINE_SNAPSHOT',
   snapshot:parsed,writesAllowed:false,deliveryAllowed:false});
 }
 return Object.freeze({read});
}
module.exports=Object.freeze({createScopedReader,decodeOutboxDraft,ENABLE_FLAG});
