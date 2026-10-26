'use strict';
// Dedicated read-only proof for ONE pinned synthetic PDF package.
const {readFile}=require('node:fs/promises');
const {OAuth2Client}=require('google-auth-library');
const {PROJECT,EXPECTED_MAILBOX,SECRET_MOUNT,readSecretEnvelope}=
  require('./contract-gmail-c37-backend-staging');
const {verifyReadOnlyTokenInfo}=require('./contract-gmail-c36-local-oauth');
const {createC35ReadOnlyGmailVerifier}=require('./contract-gmail-c35-readonly-api-staging');
const EXPECTED=require('./c373-sent-readback-expected.json');
const FROM='info@lszh-automations.ch';
const TO='lars.schulthess@outlook.com';
const JOB='lszh-crm-c373-contract-readback';
function blocked(){return Error('C3.7.3 SENT readback BLOCKED');}
function requireRuntime(runtime){
  if(!runtime||runtime.CLOUD_RUN_JOB!==JOB||
     !runtime.CLOUD_RUN_EXECUTION?.startsWith(JOB+'-')||
     runtime.CLOUD_RUN_TASK_INDEX!=='0'||runtime.CLOUD_RUN_TASK_COUNT!=='1'||
     runtime.CLOUD_RUN_TASK_ATTEMPT!=='0'||runtime.K_SERVICE!==undefined||
     runtime.GOOGLE_CLOUD_PROJECT!==PROJECT||
     runtime.LSZH_C37_READONLY_ENABLED!=='true'||runtime.LSZH_C37_TEST_ONLY!=='true'||
     runtime.LSZH_C37_ENABLE_SENDING!=='false'||runtime.LSZH_C37_ALLOW_CUSTOMER_MAIL!=='false')throw blocked();
  const mode=runtime.LSZH_C373_CHECK||'sent_pdf';
  if(!['policy_only','sent_pdf'].includes(mode)||
     (mode==='sent_pdf'&&!/^[A-Za-z0-9_-]{4,200}$/.test(runtime.LSZH_TEST_MESSAGE_ID||''))||
     (mode==='policy_only'&&runtime.LSZH_TEST_MESSAGE_ID!==undefined))throw blocked();
}
async function verifySentReadback({runtime=process.env,
  loadSecret=()=>readFile(SECRET_MOUNT,'utf8'),
  makeClient=(id,secret)=>new OAuth2Client(id,secret),
  makeVerifier=createC35ReadOnlyGmailVerifier,now=()=>Date.now()}={}){
  requireRuntime(runtime);
  let tokenClient,reader;
  try{
    const config=readSecretEnvelope(await loadSecret());
    if(!config.approvedSenders.includes(FROM)||!config.allowedRecipients.includes(TO)||
       EXPECTED.recipient!==TO)throw blocked();
    tokenClient=makeClient(config.clientId,config.clientSecret);
    tokenClient.setCredentials({refresh_token:config.refreshToken});
    const result=await tokenClient.getAccessToken();
    const access=typeof result==='string'?result:result?.token;
    if(typeof access!=='string'||access.length<10)throw blocked();
    verifyReadOnlyTokenInfo(await tokenClient.getTokenInfo(access),config.clientId,now());
    reader=makeClient(config.clientId,undefined);
    reader.setCredentials({access_token:access,token_type:'Bearer'});
    const verifier=makeVerifier({authClient:reader,expectedMailbox:EXPECTED_MAILBOX,
      approvedSenders:[FROM],allowedRecipients:[TO]});
    if(runtime.LSZH_C373_CHECK==='policy_only'){
      const profile=await verifier.verifyMailbox();
      if(profile.mailbox!==EXPECTED_MAILBOX)throw blocked();
      return Object.freeze({ready:true,status:'C373_READONLY_POLICY_PASS',
        sentEvidenceVerified:false,sendPermitted:false});
    }
    const expected=structuredClone(EXPECTED);
    const receipt={ok:true,eventId:expected.eventId,packageSha256:expected.packageSha256,
      to:TO,attachmentCount:expected.documentHashes.length,provider:'gmail',
      messageId:runtime.LSZH_TEST_MESSAGE_ID};
    if(await verifier.verifyGatewayReceipt({receipt,expected})!==true)throw blocked();
    return Object.freeze({verified:true,status:'C373_SENT_PDF_READONLY_PASS',
      attachmentCount:expected.documentHashes.length,sendPermitted:false});
  }catch{throw blocked();}
  finally{
    try{reader?.setCredentials({});}catch{}
    try{tokenClient?.setCredentials({});}catch{}
  }
}
if(require.main===module){
  verifySentReadback().then(result=>{
    process.stdout.write(result.status==='C373_READONLY_POLICY_PASS'
      ?'C3.7.3 READONLY POLICY PASS: designated test route authorised; no message read; zero sends.\n'
      :'C3.7.3 SENT PDF PASS: three exact TEST_ONLY PDFs verified; zero sends.\n');
  },()=>{
    process.stderr.write('C3.7.3 SENT PDF BLOCKED: evidence unverified; zero sends.\n');
    process.exitCode=1;
  });
}
module.exports={JOB,requireRuntime,verifySentReadback};
