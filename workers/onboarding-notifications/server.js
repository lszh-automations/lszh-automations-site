'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const {listCandidateCodes} = require('./airtable-candidates');
const {createFirestoreStore} = require('./firestore-store');
const {reconcile} = require('./outbox');
const {createPacedAirtableFetch} = require('./paced-fetch');

function safeEqual(a,b) {
  const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));
  return x.length>=32 && x.length===y.length && crypto.timingSafeEqual(x,y);
}

// Private Cloud Run only; IAM-verified invocations AND a separate Scheduler header.
// No delivery/send methods exist; intentionally STAGING-only and off by default.
function createServer({env=process.env, fetchImpl=fetch, list=listCandidateCodes,
                       store=createFirestoreStore(fetchImpl), work=reconcile}={}) {
  let running=false;
  const pacedAirtableFetch=createPacedAirtableFetch(fetchImpl);
  function respond(res,status,data) {
    res.writeHead(status,{
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      'X-Robots-Tag':'noindex, nofollow, noarchive'
    });
    res.end(JSON.stringify(data));
  }
  return http.createServer(async (req,res)=>{
    if (req.url==='/health' && req.method==='GET')
      return respond(res,200,{service:'lszh-onboarding-draft-outbox',
        enabled:env.LSZH_OUTBOX_STAGE_ENABLED==='true'});
    if (req.url!=='/internal/reconcile' || req.method!=='POST')
      return respond(res,404,{error:'not_found'});
    if (env.LSZH_OUTBOX_STAGE_ENABLED!=='true' ||
        env.FIRESTORE_PROJECT_ID!=='lszh-automations' ||
        !env.AIRTABLE_ONBOARDING_READ_TOKEN ||
        !env.OUTBOX_CONTROL_SECRET || env.OUTBOX_CONTROL_SECRET.length<32)
      return respond(res,503,{error:'outbox_disabled'});
    if (!safeEqual(req.headers['x-lszh-outbox-key'],env.OUTBOX_CONTROL_SECRET))
      return respond(res,403,{error:'forbidden'});
    if (Number(req.headers['content-length']||0)>0 || req.headers['transfer-encoding'])
      return respond(res,400,{error:'body_not_allowed'});
    if (running) return respond(res,503,{error:'busy'});
    running=true;
    try {
      const candidateCodes=await list(env.AIRTABLE_ONBOARDING_READ_TOKEN,pacedAirtableFetch);
      const counts=await work({
        candidateCodes,readToken:env.AIRTABLE_ONBOARDING_READ_TOKEN,
        fetchImpl:pacedAirtableFetch,store
      });
      // No addresses, tokens or record ids are included in response/logs.
      return respond(res,200,{ok:true,mode:'STAGING_DRAFT_ONLY',...counts});
    } catch {
      return respond(res,503,{error:'reconciliation_unavailable'});
    } finally {running=false;}
  });
}
if (require.main===module) {
  const server=createServer();
  server.listen(Number(process.env.PORT||8080),'0.0.0.0',
    ()=>console.log('LSZH notification draft outbox started (no email transport)'));
}
module.exports={createServer};
