'use strict';
// One-task, zero-retry, SYNTHETIC-ONLY Cloud Run source E2E.
// Strict order: private Secret Manager fixture -> current Airtable absence GET ->
// staging Firestore CREATE once -> independent scoped GET/readback -> signed
// single OIDC/HMAC POST to private review-only receiver. No mail, no customer,
// no automatic retry; any uncertainty stops and requires manual inspection.
const {createHash}=require('node:crypto');
const {eventId}=require('./outbox');
const {createFirestoreStore,toFirestore}=require('./firestore-store');
const {createScopedReader}=require('./firestore-scoped-readers');
const {sourceDispatchOnce,targetBase}=require('./quarantine-handoff-source');
const SOURCE='lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com';
const META='http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email';
const AIRTABLE='https://api.airtable.com/v0/appzJiskpAdaR1HEv/tblWIY4l4VASz8Vse';
const CODE=/^ob_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA=/^[a-f0-9]{64}$/;
const RECORD=/^rec[A-Za-z0-9]{14}$/;
const FIELDS=['schemaVersion','syntheticOnly','airtableExpectedState',
 'airtableAbsenceVerified','firestorePersisted','project','database','collection',
 'documentId','projectCode','fixtureAllowlist','draft','firestoreBody'];
const DRAFT=['schemaVersion','eventType','recordId','state','testOnly',
 'deliveryEnabled','emailSent','createdAt'];
function exact(value,fields){
 return !!value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).length===fields.length&&fields.every(k=>Object.hasOwn(value,k));
}
function error(message){throw Error(message);}
function load(env) {
 const raw=env?.LSZH_SYNTHETIC_FIXTURE_JSON;
 if(typeof raw!=='string'||Buffer.byteLength(raw,'utf8')>8192||raw.length<100)
  error('fixture_secret_invalid');
 let x;try{x=JSON.parse(raw);}catch{error('fixture_secret_invalid');}
 if(!exact(x,FIELDS) || x.schemaVersion!==1 || x.syntheticOnly!==true ||
    x.airtableExpectedState!=='processing' ||
    x.airtableAbsenceVerified!==false || x.firestorePersisted!==false ||
    x.project!=='lszh-automations' || x.database!=='lszh-offers-staging' ||
    x.collection!=='lszh_onboarding_notification_drafts_staging' ||
    typeof x.projectCode!=='string'||!CODE.test(x.projectCode)||
    x.fixtureAllowlist!==x.projectCode ||
    typeof env.LSZH_EXPECTED_FIXTURE_SHA256!=='string' ||
    !SHA.test(env.LSZH_EXPECTED_FIXTURE_SHA256) ||
    createHash('sha256').update(x.projectCode,'utf8').digest('hex')!==
      env.LSZH_EXPECTED_FIXTURE_SHA256 ||
    !exact(x.draft,DRAFT) || !RECORD.test(x.draft.recordId) ||
    x.draft.schemaVersion!==1 ||
    x.draft.eventType!=='ONBOARDING_INPUT_PROCESSED_V1'||
    x.draft.state!=='DRAFT_NOT_SENT'||x.draft.testOnly!==true||
    x.draft.deliveryEnabled!==false||x.draft.emailSent!==false||
    typeof x.draft.createdAt!=='string' ||
    !Number.isFinite(Date.parse(x.draft.createdAt)) ||
    new Date(x.draft.createdAt).toISOString()!==x.draft.createdAt ||
    eventId(x.draft.recordId)!==x.documentId ||
    !exact(x.firestoreBody,['fields']) ||
    JSON.stringify(x.firestoreBody)!==JSON.stringify(toFirestore(x.draft)))
  error('fixture_secret_invalid');
 return x;
}
function safeEnv(env) {
 return env?.LSZH_SYNTHETIC_SOURCE_E2E_ONCE==='true' &&
  env.LSZH_SOURCE_HANDOFF_ENABLED==='true' &&
  env.LSZH_OUTBOX_STAGE_ENABLED==='false' &&
  env.LSZH_SCOPED_STAGING_READER_ENABLED==='true' &&
  env.LSZH_SCOPED_READER_SCOPE==='outbox' &&
  env.FIRESTORE_PROJECT_ID==='lszh-automations' &&
  env.FIRESTORE_DATABASE_ID==='lszh-offers-staging' &&
  env.LSZH_QUARANTINE_HANDOFF_MODE==='REVIEW_ONLY' &&
  env.CLOUD_RUN_JOB==='lszh-quarantine-source-e2e-staging' &&
  env.CLOUD_RUN_TASK_INDEX==='0' &&
  env.CLOUD_RUN_TASK_COUNT==='1' &&
  env.CLOUD_RUN_TASK_ATTEMPT==='0' &&
  targetBase(env.LSZH_QUARANTINE_SERVICE_URL)===env.LSZH_QUARANTINE_SERVICE_URL;
}
async function airtableAbsent(code,token,fetchImpl) {
 if(!CODE.test(code)||typeof token!=='string'||token.length<20||
    token.length>512||typeof fetchImpl!=='function')error('airtable_input_invalid');
 const u=new URL(AIRTABLE);
 u.searchParams.set('filterByFormula',"{Projektcode}='"+code+"'");
 u.searchParams.set('maxRecords','2');
 u.searchParams.append('fields[]','Projektcode');
 const res=await fetchImpl(u.href,{
  method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},
  redirect:'manual',signal:AbortSignal.timeout(8000)
 });
 if(res.status!==200)error('airtable_absence_not_verified');
 const len=Number(res.headers?.get?.('content-length'));
 if(Number.isFinite(len)&&len>4096)error('airtable_absence_not_verified');
 const raw=await res.text();
 if(typeof raw!=='string'||Buffer.byteLength(raw,'utf8')>4096)
  error('airtable_absence_not_verified');
 let data;try{data=JSON.parse(raw);}catch{error('airtable_absence_not_verified');}
 if(!exact(data,['records'])||!Array.isArray(data.records)||
    data.records.length!==0)error('airtable_absence_not_verified');
 return true;
}
async function run({env=process.env,fetchImpl=globalThis.fetch,
 storeFactory=createFirestoreStore,
 scopedFactory=createScopedReader,dispatch=sourceDispatchOnce}={}) {
 if(!safeEnv(env)||typeof fetchImpl!=='function')
  error('synthetic_e2e_disabled');
 const x=load(env);
 if(typeof env.AIRTABLE_ONBOARDING_READ_TOKEN!=='string'||
    typeof env.LSZH_QUARANTINE_HMAC_B64!=='string')
  error('secret_inputs_unavailable');
 const identity=await fetchImpl(META,{
  method:'GET',headers:{'Metadata-Flavor':'Google'},
  redirect:'manual',signal:AbortSignal.timeout(5000)
 });
 if(identity.status!==200||(await identity.text()).trim()!==SOURCE)
  error('source_identity_mismatch');
 await airtableAbsent(x.projectCode,env.AIRTABLE_ONBOARDING_READ_TOKEN,fetchImpl);
 // No mutation until the live authenticated Airtable API explicitly returns [].
 const result=await storeFactory(fetchImpl).createOnce(x.documentId,x.draft);
 if(result!=='created')error('synthetic_draft_not_new');
 const reader=scopedFactory({scope:'outbox',env,fetchImpl});
 const readback=await reader.read(x.documentId);
 if(readback.status!=='VERIFIED_DRAFT' ||
    JSON.stringify(readback.draft)!==JSON.stringify(x.draft))
  error('synthetic_outbox_readback_invalid');
 const transportEnv={
  ...env,
  LSZH_STAGING_DOCUMENT_ID:x.documentId,
  LSZH_STAGING_PROJECT_CODE:x.projectCode,
  LSZH_STAGING_FIXTURE_CODES:x.fixtureAllowlist
 };
 const ack=await dispatch({env:transportEnv,fetchImpl});
 if(ack.status!=='REVIEW_ONLY_HANDOFF_ACKNOWLEDGED'||
    ack.deliveryAllowed!==false||ack.retryAllowed!==false||
    ack.writeAllowed!==false)
  error('private_handoff_not_acknowledged');
 return Object.freeze({status:'PASS_SYNTHETIC_SOURCE_E2E_REVIEW_ONLY',
  deliveryAllowed:false,automaticRetry:false,customerDataProcessed:false});
}
if(require.main===module){
 if(process.argv.length!==2){
  console.error('BLOCKED: E2E CLI arguments forbidden. Do not retry.');
  process.exitCode=2;
 }else{
  run().then(()=>{
   console.log('PASS_SYNTHETIC_SOURCE_E2E_REVIEW_ONLY');
   console.log('PASS: One new staged draft was verified and private review-only receiver acknowledged.');
   console.log('PASS: No customer, mail or contract delivery. Never rerun the job.');
  }).catch(()=>{
   console.error('BLOCKED_SYNTHETIC_SOURCE_E2E: Outcome may be partially committed. Never rerun; inspect staged artifacts.');
   process.exitCode=2;
  });
 }
}
module.exports=Object.freeze({run,load,safeEnv,airtableAbsent});
