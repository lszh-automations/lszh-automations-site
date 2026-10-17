'use strict';
// STAGING-only private Cloud Run target. Google Cloud Run MUST enforce OIDC
// audience and service-level IAM with exactly the outbox SA as invoker.
// A caller-controlled Authorization/identity header is NOT authentication.
// This server never writes a quarantine case, sends mail, or accepts customers.
const http=require('node:http');
const {parseHandoffHttpRequest,PATH,MAX_BYTES}=require('./quarantine-handoff-http-contract');
const {inspectDestinationHandoff}=require('./quarantine-handoff-offline-flow');
const {createDurableReplayClaimOnce}=require('./quarantine-handoff-replay-runtime');
function flags(env) {
 return env.LSZH_QUARANTINE_HANDOFF_HTTP_ENABLED==='true' &&
  env.LSZH_QUARANTINE_REPLAY_WRITE_ENABLED==='true' &&
  env.LSZH_SCOPED_STAGING_READER_ENABLED==='true' &&
  env.LSZH_SCOPED_READER_SCOPE==='quarantine' &&
  env.LSZH_OUTBOX_STAGE_ENABLED==='false' &&
  env.LSZH_QUARANTINE_HANDOFF_MODE==='REVIEW_ONLY' &&
  env.FIRESTORE_PROJECT_ID==='lszh-automations' &&
  env.FIRESTORE_DATABASE_ID==='lszh-quarantine-staging';
}
function decodeSecret(env) {
 const x=env.LSZH_QUARANTINE_HMAC_B64;
 if(typeof x!=='string' || !/^(?:[A-Za-z0-9+/]{4}){10}[A-Za-z0-9+/]{3}=$/.test(x))
  return null;
 const value=Buffer.from(x,'base64');
 if(value.length!==32 || value.toString('base64')!==x)return null;
 return value;
}
function respond(res,status,payload){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
  'X-Robots-Tag':'noindex, nofollow, noarchive'});
 res.end(JSON.stringify(payload));
}
async function readSmall(req,length){
 const chunks=[];let size=0;
 for await (const chunk of req){
  size+=chunk.length;
  if(size>MAX_BYTES || size>length)throw Error('size_exceeded');
  chunks.push(chunk);
 }
 if(size!==length)throw Error('length_mismatch');
 return Buffer.concat(chunks,size);
}
function createHandoffReceiver({
 env=process.env,fetchImpl=globalThis.fetch,
 claimFactory=createDurableReplayClaimOnce,
 inspect=inspectDestinationHandoff,nowMs=()=>Date.now()
}={}) {
 const server=http.createServer(async(req,res)=>{
  if(req.url!==PATH || req.method!=='POST')
   return respond(res,404,{error:'not_found'});
  const secret=flags(env)?decodeSecret(env):null;
  if(!secret)return respond(res,503,{error:'handoff_disabled'});
  // No chunked/compressed bodies, redirects, queries, or oversized requests.
  const n=req.headers['content-length'];
  if(typeof n!=='string' || !/^[1-9]\d{0,3}$/.test(n) ||
     Number(n)>MAX_BYTES || Number(n)<2 ||
     req.headers['transfer-encoding']!==undefined ||
     req.headers['content-encoding']!==undefined ||
     req.headers['content-type']!=='application/json')
   return respond(res,400,{error:'bad_request'});
  let body;
  try{body=await readSmall(req,Number(n));}
  catch{return respond(res,400,{error:'bad_request'});}
  const parsed=parseHandoffHttpRequest({
   method:req.method,path:req.url,headers:req.headers,body,env
  });
  if(parsed.status!=='UNAUTHENTICATED_ENVELOPE_PARSED_NOT_ACCEPTED')
   return respond(res,400,{error:'bad_request'});
  // 'UNAUTHENTICATED' means the parser does not authenticate the request.
  // Never deploy this service with --allow-unauthenticated. Cloud Run IAM
  // must authenticate Google ID tokens before this code receives any request.
  try {
   const claimOnce=claimFactory({env,fetchImpl});
   const result=await inspect({
    envelope:parsed.envelope,secret,nowMs:nowMs(),claimOnce,
    destinationEnv:env,destinationFirestoreFetch:fetchImpl
   });
   if(result.status==='OFFLINE_CAS_REVIEW_REQUIRED' ||
      result.status==='NO_CHANGE')
    return respond(res,202,{mode:'STAGING_REVIEW_ONLY',
     status:'MANUAL_REVIEW_REQUIRED',deliveryAllowed:false});
  }catch{/* No error details, IDs, signatures or credentials in responses. */}
  return respond(res,403,{error:'handoff_blocked'});
 });
 server.requestTimeout=10000;
 server.headersTimeout=12000;
 server.maxRequestsPerSocket=20;
 return server;
}
if(require.main===module){
 const server=createHandoffReceiver();
 server.listen(Number(process.env.PORT||8080),'0.0.0.0',
  ()=>console.log('LSZH private quarantine handoff STAGING receiver started (off by default; no email)'));
}
module.exports=Object.freeze({createHandoffReceiver,decodeSecret});
