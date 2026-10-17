'use strict';
// LSZH STAGING: verify the existing onboarding/confirmation.js against the
// REAL Airtable REST API using exactly ONE GET for a fresh synthetic code.
// No Airtable writes, Firestore, Make, Cloud Run service changes or emails.
// The token arrives from stdin (never from CLI args, env, files or logs).
const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {verifyOnboardingState}=require('../../onboarding/confirmation');

const BASE='appzJiskpAdaR1HEv';
const TABLE='tblWIY4l4VASz8Vse';
const CODE_RE=/^ob_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

async function probe({token,env=process.env,fetchImpl=fetch,
                      freshCode=()=>('ob_'+randomUUID()),log=console.log}={}) {
  if(env.LSZH_AIRTABLE_REST_PROBE_ONLY!=='true')throw Error('probe_disabled');
  if(typeof token!=='string'||token.length<20||token.length>512||
     /[\r\n\x00]/.test(token))throw Error('invalid_read_only_token');
  const code=freshCode();
  if(typeof code!=='string'||!CODE_RE.test(code)||
     code==='ob_00000000-0000-4000-8000-000000000000')
    throw Error('unsafe_synthetic_code');
  let calls=0;
  const guardedFetch=async(input,options)=>{
    const url=new URL(input);
    if(calls!==0||url.protocol!=='https:'||url.hostname!=='api.airtable.com'||
       url.port!==''||url.pathname!==('/v0/'+BASE+'/'+TABLE)||
       options?.method!=='GET'||options?.body!==undefined||
       url.searchParams.get('filterByFormula')!=="{Projektcode}='"+code+"'"||
       url.searchParams.get('maxRecords')!=='2'||
       url.searchParams.has('offset')||
       options?.headers?.Authorization!=='Bearer '+token){
      throw Error('unexpected_airtable_request');
    }
    calls++;
    // No logging of the URL, code, bearer token or Airtable response content.
    const response=await fetchImpl(input,options);
    if(response.status===401||response.status===403)
      throw Error('airtable_token_not_authorized');
    if(response.status===429)throw Error('airtable_rate_limited');
    return response;
  };
  const result=await verifyOnboardingState(code,token,guardedFetch);
  if(calls!==1||result?.state!=='processing')
    throw Error('synthetic_absence_not_verified');
  log('PASS: Existing verifyOnboardingState() used Airtable REST via exactly one GET.');
  log('PASS: Fresh unprinted synthetic project code absent; processing (not completed).');
  log('PASS: No Airtable writes, Firestore operations, service changes or emails.');
  return true;
}
if(require.main===module){
  let token;
  try{
    token=fs.readFileSync(0,'utf8').replace(/\n$/,'');
    probe({token}).catch(e=>{
      const safe=new Set(['probe_disabled','invalid_read_only_token',
        'unsafe_synthetic_code','unexpected_airtable_request',
        'airtable_token_not_authorized','airtable_rate_limited',
        'synthetic_absence_not_verified','airtable_status_unavailable',
        'invalid_status_response']);
      console.error('STOP: '+(safe.has(e?.message)?e.message:'airtable_rest_probe_unavailable'));
      process.exitCode=2;
    });
  }catch{console.error('STOP: Could not read secret from private stdin.');process.exitCode=2;}
}
module.exports={probe};
