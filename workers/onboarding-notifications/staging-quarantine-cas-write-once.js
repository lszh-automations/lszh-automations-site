'use strict';
// One synthetic Firestore Quarantine CAS CREATE + conditional UPDATE in STAGING.
// Standalone process (not website, not Cloud Run, no scheduler or email).
// Must be explicitly gated by caller and paired with a separately timed SA-IAM
// impersonation lease. No delete (the SA intentionally has no delete right).
// Never automatically retry a failed or ambiguous write.
const {randomBytes}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {STATUS}=require('./draft-review-gate');
const {
 PROJECT,DATABASE,COLLECTION,buildQuarantineRead,
 prepareQuarantineCAS,assessQuarantineCommit
}=require('./quarantine-cas-offline-cycle');

const SA='lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com';
const FLAG='LSZH_SYNTHETIC_QUARANTINE_CAS_WRITE_ONCE';
const API='https://firestore.googleapis.com/v1/';
const ROOT='projects/'+PROJECT+'/databases/'+DATABASE+'/documents/'+COLLECTION+'/';
const REVIEW_COMPLETE=Object.freeze({
 status:STATUS.CURRENTLY_COMPLETE,reason:'FRESH_COMPLETE_EVIDENCE',
 quarantineRecommended:false,deliveryAllowed:false,requiresManualApproval:true
});
const REVIEW_HOLD=Object.freeze({
 status:STATUS.QUARANTINE,reason:'ONBOARDING_NOT_COMPLETE',
 quarantineRecommended:true,deliveryAllowed:false,requiresManualApproval:true
});
function mintToken() {
 const result=spawnSync('gcloud',[
  'auth','print-access-token','--impersonate-service-account='+SA,
  '--project='+PROJECT,'--quiet'
 ],{encoding:'utf8',timeout:30000,maxBuffer:4096});
 if(result.error || result.status!==0 || typeof result.stdout!=='string' ||
    result.stdout.trim().length<40 || !/^[A-Za-z0-9._~-]+$/.test(result.stdout.trim()))
  throw Error('impersonation_unavailable');
 return result.stdout.trim();
}
function verifyRequestShape(request,draftId,expectedPrecondition) {
 if(request?.method!=='POST' ||
    request.url!==API+'projects/'+PROJECT+'/databases/'+DATABASE+'/documents:commit' ||
    request.body?.writes?.length!==1 ||
    request.body.writes[0]?.update?.name!==ROOT+draftId ||
    JSON.stringify(request.body.writes[0].currentDocument)!==JSON.stringify(expectedPrecondition) ||
    request.body.writes[0].update.fields?.deliveryAllowed?.booleanValue!==false ||
    request.body.writes[0].update.fields?.requiresManualApproval?.booleanValue!==true)
  throw Error('invalid_commit_request');
}
function finiteJsonString(obj) {
 const text=JSON.stringify(obj);
 if(!text || text.length>16000)throw Error('request_body_invalid');
 return text;
}
async function limitedJson(response) {
 const text=await response.text();
 if(typeof text!=='string' || text.length>65536)throw Error('response_size_invalid');
 return JSON.parse(text);
}
async function run({
 env=process.env,fetchImpl=globalThis.fetch,
 tokenProvider=mintToken,nonceFactory=()=>randomBytes(32).toString('hex'),
 now=()=>new Date().toISOString(),log=console.log
}={}) {
 if(env[FLAG]!=='true' || env.LSZH_OUTBOX_STAGE_ENABLED!=='false')
  throw Error('synthetic_cas_write_disabled');
 if(typeof fetchImpl!=='function' || typeof tokenProvider!=='function')
  throw Error('synthetic_cas_runtime_invalid');
 const draftId=nonceFactory();
 if(typeof draftId!=='string' || !/^[a-f0-9]{64}$/.test(draftId))
  throw Error('synthetic_fixture_id_invalid');
 const token=tokenProvider();
 if(typeof token!=='string' || token.length<40)
  throw Error('impersonation_unavailable');
 const headers={Authorization:'Bearer '+token,Accept:'application/json'};
 const docReq=buildQuarantineRead(draftId);
 const documentURL=docReq.url;
 const call=async(method,url,body)=>{
  if(url!==documentURL && url!==API+'projects/'+PROJECT+'/databases/'+DATABASE+'/documents:commit')
   throw Error('unexpected_firestore_target');
  if((url===documentURL && (method!=='GET' || body!==undefined)) ||
     (url!==documentURL && (method!=='POST' || typeof body!=='string')))
   throw Error('unexpected_firestore_method');
  return fetchImpl(url,{
   method,headers:body===undefined?headers:{...headers,'Content-Type':'application/json'},
   ...(body===undefined?{}:{body}),redirect:'manual',signal:AbortSignal.timeout(12000)
  });
 };
 // Safe to log opaque random test identity, never the token or response body.
 log('FIXTURE_ID: '+draftId);
 log('FIXTURE_DB: '+DATABASE+'; FIXTURE_COLLECTION: '+COLLECTION);
 log('FIXTURE_POLICY: No automatic deletion; retain synthetic case for approved later cleanup.');
 const initial=await call('GET',documentURL);
 if(initial.status!==404)throw Error('initial_absence_not_verified');
 log('PASS: Random synthetic document verified absent (404).');
 const first=prepareQuarantineCAS({
  draftId,review:REVIEW_COMPLETE,reviewedAt:now(),readStatus:404
 });
 if(first.status!=='READY_TO_COMMIT_ONCE' || first.proposal.outcome!=='created')
  throw Error('create_plan_unavailable');
 verifyRequestShape(first.request,draftId,{exists:false});
 const created=await call('POST',first.request.url,finiteJsonString(first.request.body));
 if(created.status!==200)throw Error('create_commit_not_acknowledged');
 const receipt1=await limitedJson(created);
 const createRead=await call('GET',documentURL);
 if(createRead.status!==200)throw Error('create_readback_not_verified');
 const document1=await limitedJson(createRead);
 const check1=assessQuarantineCommit({
  prepared:first,commitStatus:created.status,commitResponse:receipt1,
  readbackStatus:createRead.status,readbackDocument:document1
 });
 if(check1.status!=='READBACK_VERIFIED' || check1.revision!==1)
  throw Error('create_readback_not_verified');
 log('PASS: CREATE committed conditionally (exists:false); revision 1 read back and verified.');
 const second=prepareQuarantineCAS({
  draftId,review:REVIEW_HOLD,reviewedAt:now(),
  readStatus:200,document:document1
 });
 if(second.status!=='READY_TO_COMMIT_ONCE' ||
    second.proposal.outcome!=='updated' || second.proposal.record.revision!==2)
  throw Error('update_plan_unavailable');
 const priorVersion=document1.updateTime;
 verifyRequestShape(second.request,draftId,{updateTime:priorVersion});
 const updated=await call('POST',second.request.url,finiteJsonString(second.request.body));
 if(updated.status!==200)throw Error('update_commit_not_acknowledged');
 const receipt2=await limitedJson(updated);
 const updateRead=await call('GET',documentURL);
 if(updateRead.status!==200)throw Error('update_readback_not_verified');
 const document2=await limitedJson(updateRead);
 const check2=assessQuarantineCommit({
  prepared:second,commitStatus:updated.status,commitResponse:receipt2,
  readbackStatus:updateRead.status,readbackDocument:document2
 });
 if(check2.status!=='READBACK_VERIFIED' || check2.revision!==2)
  throw Error('update_readback_not_verified');
 if(second.proposal.record.deliveryAllowed!==false ||
    second.proposal.record.requiresManualApproval!==true)
  throw Error('unsafe_final_case');
 log('PASS: UPDATE committed with exact old updateTime; revision 2 verified.');
 log('DONE: One synthetic CREATE, one conditional UPDATE, three GETs, no deletes.');
 log('DONE: Case stays quarantined, send-disabled and requires manual approval.');
 return Object.freeze({completed:true,draftId,revision:2,deliveryAllowed:false});
}
if(require.main===module){
 if(process.argv.length!==2){
  console.error('STOP: Probe accepts no command-line arguments.');
  process.exitCode=2;
 }else run().catch(error=>{
  // Do not leak token, OAuth stderr, REST payload, or document fields.
  const safe=new Set([
   'synthetic_cas_write_disabled','synthetic_cas_runtime_invalid',
   'synthetic_fixture_id_invalid','impersonation_unavailable',
   'unexpected_firestore_target','unexpected_firestore_method',
   'request_body_invalid','response_size_invalid','invalid_commit_request',
   'initial_absence_not_verified','create_plan_unavailable',
   'create_commit_not_acknowledged','create_readback_not_verified',
   'update_plan_unavailable','update_commit_not_acknowledged',
   'update_readback_not_verified','unsafe_final_case'
  ]);
  console.error('BLOCKED: '+(safe.has(error?.message)?error.message:'synthetic_cas_test_ambiguous'));
  console.error('A synthetic fixture MAY exist. Never rerun or auto-delete; inspect by FIXTURE_ID only.');
  process.exitCode=2;
 });
}
module.exports={run,FLAG,SA};
