'use strict';
// Dedicated STAGING quarantine receiver: one durable Firestore exists:false
// replay claim + independent readback, NEVER a quarantine-case write or mail.
// No retries after ambiguous commit. Never log metadata tokens or responses.
const {planReplayClaim,verifiedReplayClaim,COLLECTION}=require('./quarantine-handoff-replay-cas');
const PROJECT='lszh-automations';
const DATABASE='lszh-quarantine-staging';
const SA='lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com';
const META='http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/';
const API='https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/'+DATABASE+
 '/documents/'+COLLECTION+'/';
const ID=/^[a-f0-9]{64}$/;
function enabled(env) {
 return env.LSZH_QUARANTINE_REPLAY_WRITE_ENABLED==='true' &&
  env.LSZH_QUARANTINE_HANDOFF_HTTP_ENABLED==='true' &&
  env.LSZH_OUTBOX_STAGE_ENABLED==='false' &&
  env.LSZH_QUARANTINE_HANDOFF_MODE==='REVIEW_ONLY' &&
  env.LSZH_SCOPED_STAGING_READER_ENABLED==='true' &&
  env.LSZH_SCOPED_READER_SCOPE==='quarantine' &&
  env.FIRESTORE_PROJECT_ID===PROJECT &&
  env.FIRESTORE_DATABASE_ID===DATABASE;
}
async function limitedText(response,max=4096) {
 const header=response?.headers?.get?.('content-length');
 if(header!==undefined && header!==null && Number(header)>max)throw Error('response_too_large');
 if(typeof response?.text!=='function')throw Error('invalid_response');
 const body=await response.text();
 if(typeof body!=='string' || Buffer.byteLength(body,'utf8')>max)throw Error('response_too_large');
 return body;
}
async function strictJson(response,max=4096) {
 const data=JSON.parse(await limitedText(response,max));
 if(!data || typeof data!=='object' || Array.isArray(data))throw Error('invalid_response_json');
 return data;
}
function createDurableReplayClaimOnce({env=process.env,fetchImpl=globalThis.fetch,
 now=()=>new Date().toISOString()}={}) {
 if(!enabled(env) || typeof fetchImpl!=='function' || typeof now!=='function')
  throw Error('replay_runtime_disabled');
 async function metadata(path) {
  const res=await fetchImpl(META+path,{
   method:'GET',headers:{'Metadata-Flavor':'Google'},
   redirect:'manual',signal:AbortSignal.timeout(5000)
  });
  if(res.status!==200)throw Error('metadata_unavailable');
  return res;
 }
 return async function claimOnce(key) {
  // No attempt is permitted for an invalid key or disabled runtime.
  if(!enabled(env) || typeof key!=='string' || !ID.test(key))return false;
  try {
   const plan=planReplayClaim({replayKey:key,claimedAt:now()});
   const email=(await limitedText(await metadata('email'),320)).trim();
   if(email!==SA)return false;
   const info=await strictJson(await metadata('token'),2048);
   if(info.token_type!=='Bearer' || typeof info.access_token!=='string' ||
      info.access_token.length<40 || !Number.isSafeInteger(info.expires_in) ||
      info.expires_in<60)return false;
   const headers={Authorization:'Bearer '+info.access_token,Accept:'application/json'};
   // Exactly one POST, with Firestore's atomic currentDocument.exists=false.
   const commit=await fetchImpl(plan.request.url,{
    method:'POST',headers:{...headers,'Content-Type':'application/json'},
    body:JSON.stringify(plan.request.body),redirect:'manual',
    signal:AbortSignal.timeout(10000)
   });
   if(commit.status!==200)return false;
   const ack=await strictJson(commit);
   // Readback occurs only after the exact successful commit acknowledgment.
   const read=await fetchImpl(API+key,{
    method:'GET',headers,redirect:'manual',signal:AbortSignal.timeout(10000)
   });
   if(read.status!==200)return false;
   const document=await strictJson(read);
   return verifiedReplayClaim({plan,commitStatus:200,commitResponse:ack,
    readStatus:200,document}).status==='CLAIM_READBACK_VERIFIED';
  }catch{return false;}
 };
}
module.exports=Object.freeze({createDurableReplayClaimOnce});
