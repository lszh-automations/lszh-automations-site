'use strict';
// C3.7.2: Cloud Run JOB entrypoint, never imported into CRM or HTTP services.
// A single task performs one Gmail-profile GET after strict OAuth checks.
// Does not inspect messages/attachments, send/draft mail, or modify any data.
const {readFile}=require('node:fs/promises');
const {OAuth2Client}=require('google-auth-library');
const {
  PROJECT,EXPECTED_MAILBOX,SECRET_MOUNT,readSecretEnvelope
}=require('./contract-gmail-c37-backend-staging');
const {verifyReadOnlyTokenInfo}=
  require('./contract-gmail-c36-local-oauth');
const {createC35GmailApiReadOnlyAdapter}=
  require('./contract-gmail-c35-readonly-api-staging');

const JOB='lszh-crm-c372-profile-probe';
function blocked(){return Error('C3.7.2 profile probe BLOCKED');}
function requireJobRuntime(runtime){
  if(!runtime||runtime.CLOUD_RUN_JOB!==JOB||
     typeof runtime.CLOUD_RUN_EXECUTION!=='string'||
     !runtime.CLOUD_RUN_EXECUTION.startsWith(JOB+'-')||
     runtime.CLOUD_RUN_TASK_INDEX!=='0'||
     runtime.CLOUD_RUN_TASK_COUNT!=='1'||
     runtime.CLOUD_RUN_TASK_ATTEMPT!=='0'||
     runtime.K_SERVICE!==undefined||
     runtime.GOOGLE_CLOUD_PROJECT!==PROJECT||
     runtime.LSZH_C37_READONLY_ENABLED!=='true'||
     runtime.LSZH_C37_TEST_ONLY!=='true'||
     runtime.LSZH_C37_ENABLE_SENDING!=='false'||
     runtime.LSZH_C37_ALLOW_CUSTOMER_MAIL!=='false')
    throw blocked();
}
async function probeProfile({
  runtime=process.env,
  loadSecret=()=>readFile(SECRET_MOUNT,'utf8'),
  makeClient=(clientId,clientSecret)=>new OAuth2Client(clientId,clientSecret),
  now=()=>Date.now()
}={}){
  // Run-time validation MUST precede even the first secret read.
  requireJobRuntime(runtime);
  if(typeof loadSecret!=='function'||typeof makeClient!=='function'||
     typeof now!=='function')throw blocked();
  let tokenClient,reader;
  try{
    const config=readSecretEnvelope(await loadSecret());
    tokenClient=makeClient(config.clientId,config.clientSecret);
    if(!tokenClient||typeof tokenClient.setCredentials!=='function'||
       typeof tokenClient.getAccessToken!=='function'||
       typeof tokenClient.getTokenInfo!=='function')throw blocked();
    tokenClient.setCredentials({refresh_token:config.refreshToken});
    const result=await tokenClient.getAccessToken();
    const access=typeof result==='string'?result:result?.token;
    if(typeof access!=='string'||access.length<10)throw blocked();
    const info=await tokenClient.getTokenInfo(access);
    verifyReadOnlyTokenInfo(info,config.clientId,now());
    reader=makeClient(config.clientId,undefined);
    if(!reader||typeof reader.setCredentials!=='function'||
       typeof reader.request!=='function')throw blocked();
    reader.setCredentials({
      access_token:access,token_type:'Bearer',expiry_date:info.expiry_date
    });
    const profile=await createC35GmailApiReadOnlyAdapter({
      authClient:reader,expectedMailbox:EXPECTED_MAILBOX
    }).verifyMailbox();
    if(profile.mailbox!==EXPECTED_MAILBOX)throw blocked();
    return Object.freeze({verified:true,status:'C372_PROFILE_READONLY_PASS',
      gmailGetCount:1,sendPermitted:false});
  }catch{
    // No provider errors, token details, mailbox details or payloads in logs.
    throw blocked();
  }finally{
    try{reader?.setCredentials({})}catch{}
    try{tokenClient?.setCredentials({})}catch{}
  }
}
async function main(){
  try{
    const result=await probeProfile();
    if(result.verified!==true)throw blocked();
    process.stdout.write('C3.7.2 JOB PASS: Gmail readonly profile verified; zero sends.\n');
  }catch{
    process.stderr.write('C3.7.2 JOB BLOCKED: Gmail readonly check unsuccessful; zero sends.\n');
    process.exitCode=1;
  }
}
if(require.main===module)void main();
module.exports={JOB,requireJobRuntime,probeProfile};
