'use strict';
// One-shot STAGING source side: verified Outbox/Airtable read, HMAC envelope,
// Google metadata-issued OIDC ID token, then ONE private Cloud Run POST.
// Never a scheduler, customer workflow, email or quarantine write.
const {prepareSourceHandoff}=require('./quarantine-handoff-offline-flow');
const {decodeSecret}=require('./quarantine-handoff-receiver');
const SOURCE='lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com';
const META='http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/';
const PATH='/internal/quarantine/handoff';
const ID=/^[a-f0-9]{64}$/;
function targetBase(value){
 if(typeof value!=='string')return null;
 try {
  const u=new URL(value);
  if(u.protocol!=='https:' || u.username || u.password ||
     u.pathname!=='/' || u.search || u.hash || u.port ||
     !/^lszh-quarantine-handoff-staging-[a-z0-9-]+\.(?:[a-z0-9-]+\.)?run\.app$/.test(u.hostname) ||
     value!==u.origin)return null;
  return u.origin;
 }catch{return null;}
}
function sourceEnabled(env){
 return env.LSZH_SOURCE_HANDOFF_ENABLED==='true' &&
  env.LSZH_OUTBOX_STAGE_ENABLED==='false' &&
  env.LSZH_SCOPED_STAGING_READER_ENABLED==='true' &&
  env.LSZH_SCOPED_READER_SCOPE==='outbox' &&
  env.FIRESTORE_PROJECT_ID==='lszh-automations' &&
  env.FIRESTORE_DATABASE_ID==='lszh-offers-staging' &&
  env.LSZH_QUARANTINE_HANDOFF_MODE==='REVIEW_ONLY';
}
function stopped(reason){
 return Object.freeze({status:'BLOCKED_NO_SOURCE_DISPATCH',reason,
  retryAllowed:false,deliveryAllowed:false,writeAllowed:false});
}
async function sourceDispatchOnce({
 env=process.env,fetchImpl=globalThis.fetch,nowMs=Date.now()
}={}){
 const url=targetBase(env?.LSZH_QUARANTINE_SERVICE_URL);
 const secret=decodeSecret(env??{});
 if(!sourceEnabled(env??{}) || !url || !secret ||
    typeof fetchImpl!=='function' ||
    typeof env.AIRTABLE_ONBOARDING_READ_TOKEN!=='string' ||
    !ID.test(env.LSZH_STAGING_DOCUMENT_ID??''))
  return stopped('SOURCE_DISABLED_OR_INCOMPLETE');
 const reviewed=await prepareSourceHandoff({
  documentId:env.LSZH_STAGING_DOCUMENT_ID,
  projectCode:env.LSZH_STAGING_PROJECT_CODE,
  fixtureAllowlist:env.LSZH_STAGING_FIXTURE_CODES,
  readToken:env.AIRTABLE_ONBOARDING_READ_TOKEN,
  secret,sourceEnv:env,sourceFirestoreFetch:fetchImpl,
  airtableFetch:fetchImpl,nowMs
 });
 if(reviewed.status!=='SIGNED_NOT_SENT')return stopped('SOURCE_REVIEW_UNAVAILABLE');
 const body=JSON.stringify(reviewed.envelope);
 if(Buffer.byteLength(body,'utf8')>2048)return stopped('BODY_TOO_LARGE');
 const h={'Metadata-Flavor':'Google'};
 try {
  const identity=await fetchImpl(META+'email',{method:'GET',headers:h,
   redirect:'manual',signal:AbortSignal.timeout(5000)});
  if(identity.status!==200 || (await identity.text()).trim()!==SOURCE)
   return stopped('SOURCE_IDENTITY_INVALID');
  const oidc=await fetchImpl(META+'identity?audience='+encodeURIComponent(url),{
   method:'GET',headers:h,redirect:'manual',signal:AbortSignal.timeout(5000)
  });
  if(oidc.status!==200)return stopped('OIDC_UNAVAILABLE');
  const token=await oidc.text();
  if(typeof token!=='string' || token.length<60 || token.length>8192 ||
     !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
   return stopped('OIDC_INVALID');
  const response=await fetchImpl(url+PATH,{
   method:'POST',headers:{Authorization:'Bearer '+token,
    'Content-Type':'application/json',
    'Content-Length':String(Buffer.byteLength(body,'utf8'))},
   body,redirect:'manual',signal:AbortSignal.timeout(12000)
  });
  if(response.status!==202)return stopped('TARGET_NOT_ACCEPTED');
  const text=await response.text();
  if(typeof text!=='string' || Buffer.byteLength(text)>1024)
   return stopped('TARGET_REPLY_INVALID');
  const ack=JSON.parse(text);
  if(ack?.mode!=='STAGING_REVIEW_ONLY' ||
     ack?.status!=='MANUAL_REVIEW_REQUIRED' ||
     ack?.deliveryAllowed!==false ||
     Object.keys(ack).length!==3)
   return stopped('TARGET_REPLY_INVALID');
  return Object.freeze({status:'REVIEW_ONLY_HANDOFF_ACKNOWLEDGED',
   deliveryAllowed:false,writeAllowed:false,retryAllowed:false});
 }catch{return stopped('NETWORK_OR_ACK_UNCERTAIN');}
}
module.exports=Object.freeze({sourceDispatchOnce,targetBase});
