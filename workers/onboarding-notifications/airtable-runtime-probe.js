'use strict';
// Separate Cloud Run *JOB*; one real read-only Airtable GET for a missing
// synthetic code. No real onboarding data, no Firestore, Make or mail.
const fs=require('node:fs');
const {probe}=require('./staging-airtable-rest-read');

const PROJECT='lszh-automations';
const JOB='lszh-airtable-read-probe-staging';
const SECRET_PATH='/var/secrets/lszh/airtable-read-pat';
function enabled(env) {
  return env.LSZH_AIRTABLE_RUNTIME_PROBE_ONLY==='true' &&
    env.LSZH_OUTBOX_STAGE_ENABLED==='false' &&
    env.GOOGLE_CLOUD_PROJECT===PROJECT &&
    env.CLOUD_RUN_JOB===JOB &&
    env.CLOUD_RUN_TASK_INDEX==='0' &&
    env.CLOUD_RUN_TASK_ATTEMPT==='0' &&
    !env.AIRTABLE_ONBOARDING_READ_TOKEN &&
    !env.AIRTABLE_PERSONAL_ACCESS_TOKEN &&
    !env.OUTBOX_CONTROL_SECRET &&
    !env.LSZH_STAGING_FIXTURE_CODES &&
    !env.FIRESTORE_PROJECT_ID &&
    !env.FIRESTORE_DATABASE_ID;
}
async function run({env=process.env,readSecret=fs.readFileSync,fetchImpl=fetch,
                    log=console.log,freshCode}={}) {
  if(!enabled(env))throw Error('airtable_runtime_probe_disabled');
  // Mount this one version of a Secret Manager secret as a read-only file,
  // scoped to an isolated service account with secretAccessor on this secret.
  // No secret value ever appears in env, command args, log or GitHub.
  let token=readSecret(SECRET_PATH,'utf8');
  if(typeof token!=='string')throw Error('airtable_secret_unavailable');
  // Secret Manager often stores a single terminal LF. Other whitespace is
  // NOT normalized, preventing accidental acceptance of mangled credentials.
  token=token.replace(/\n$/,'');
  return probe({
    token,env:{LSZH_AIRTABLE_REST_PROBE_ONLY:'true'},fetchImpl,log,
    ...(freshCode?{freshCode}:{})
  });
}
if(require.main===module){
  run().catch(e=>{
    const safe=new Set([
      'airtable_runtime_probe_disabled','airtable_secret_unavailable',
      'invalid_read_only_token','unsafe_synthetic_code',
      'unexpected_airtable_request','airtable_token_not_authorized',
      'airtable_rate_limited','synthetic_absence_not_verified',
      'airtable_status_unavailable','invalid_status_response'
    ]);
    console.error('STOP: '+(safe.has(e?.message)?e.message:'airtable_runtime_probe_unavailable'));
    process.exitCode=2;
  });
}
module.exports={run,enabled,SECRET_PATH,JOB};
