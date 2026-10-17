'use strict';
// Container entrypoint for an explicit ONE-TASK synthetic Cloud Run Job only.
// No scheduler and no automatic retries; no sensitive error/fixture logs.
const {sourceDispatchOnce}=require('./quarantine-handoff-source');
async function run({env=process.env,fetchImpl=globalThis.fetch,nowMs=Date.now()}={}){
 if(env.LSZH_SYNTHETIC_SOURCE_HANDOFF_ONCE!=='true' ||
    env.LSZH_SOURCE_HANDOFF_ENABLED!=='true' ||
    env.LSZH_OUTBOX_STAGE_ENABLED!=='false')
  throw Error('synthetic_source_job_disabled');
 const result=await sourceDispatchOnce({env,fetchImpl,nowMs});
 if(result.status!=='REVIEW_ONLY_HANDOFF_ACKNOWLEDGED')
  throw Error('synthetic_source_handoff_blocked');
 return Object.freeze({status:'PASS_SYNTHETIC_REVIEW_ONLY_HANDOFF',
  deliveryAllowed:false,retryAllowed:false});
}
if(require.main===module){
 if(process.argv.length!==2){
  console.error('STOP: No command-line arguments permitted.');
  process.exitCode=2;
 }else run().then(()=>{
  console.log('PASS: One synthetic private HMAC/OIDC handoff accepted for review only. No mail or case write.');
 }).catch(()=>{
  console.error('BLOCKED: Synthetic source handoff did not receive verified review-only acknowledgement. Never auto-retry.');
  process.exitCode=2;
 });
}
module.exports=Object.freeze({run});
