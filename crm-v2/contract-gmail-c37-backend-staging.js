'use strict';
// C3.7 ISOLATED staging backend boundary. NOT imported into the live CRM routes.
// Credentials are supplied only by a trusted backend secret injection and
// NEVER logged, persisted, returned to a browser, or accepted from an HTTP body.
// This module never sends mail, creates draft mail or mutates Firestore/Make.
const {OAuth2Client}=require('google-auth-library');
const {blocked}=require('./contract-dispatch-release-staging');
const {verifyReadOnlyTokenInfo}=require('./contract-gmail-c36-local-oauth');
const {createC35ReadOnlyGmailVerifier}=
  require('./contract-gmail-c35-readonly-api-staging');

const SECRET_PURPOSE='LSZH_C37_GMAIL_READONLY_STAGING';
const SERVICE='lszh-crm-v2-c37-readonly-staging';
const PROJECT='lszh-automations';
const EXPECTED_MAILBOX='lars@lszh-automations.ch';
const SCOPE='https://www.googleapis.com/auth/gmail.readonly';
const CLIENT_ID=/^[0-9]{8,30}-[a-z0-9-]{10,100}\.apps\.googleusercontent\.com$/;
const MAILBOX=/^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;

function requireIsolatedStaging(runtime){
  if(!runtime||runtime.K_SERVICE!==SERVICE||
     runtime.GOOGLE_CLOUD_PROJECT!==PROJECT||
     runtime.LSZH_C37_READONLY_ENABLED!=='true'||
     runtime.LSZH_C37_TEST_ONLY!=='true'||
     runtime.LSZH_C37_ALLOW_CUSTOMER_MAIL==='true'||
     runtime.LSZH_C37_ENABLE_SENDING==='true')
    throw blocked('C3.7 isolated staging runtime required');
}
function exactList(values,name){
  if(!Array.isArray(values)||values.length<1||values.length>5||
     values.some(x=>typeof x!=='string'||!MAILBOX.test(x)||
       x!==x.toLowerCase()||x.length>254||x.endsWith('.invalid')||
       x.includes('*'))||new Set(values).size!==values.length)
    throw blocked('C3.7 exact '+name+' allowlist invalid');
  return Object.freeze([...values]);
}
function readSecretEnvelope(value){
  // Cloud Run secret mount/env supplies this opaque JSON. The user may never
  // supply it through an API request. No Firebase/Cloud credentials in GitHub.
  if(typeof value!=='string'||value.length<80||value.length>16384)
    throw blocked('C3.7 managed secret missing');
  let object;
  try{object=JSON.parse(value)}catch{
    throw blocked('C3.7 managed secret malformed');
  }
  if(!object||Array.isArray(object)||typeof object!=='object'||
     Object.keys(object).sort().join('|')!==[
       'allowedRecipients','approvedSenders','clientId','clientSecret',
       'expectedMailbox','purpose','refreshToken','version'
     ].sort().join('|')||
     object.version!==1||object.purpose!==SECRET_PURPOSE||
     object.expectedMailbox!==EXPECTED_MAILBOX||
     !CLIENT_ID.test(object.clientId||'')||
     typeof object.clientSecret!=='string'||
     object.clientSecret.length<10||object.clientSecret.length>1024||
     typeof object.refreshToken!=='string'||
     object.refreshToken.length<20||object.refreshToken.length>2048)
    throw blocked('C3.7 managed secret policy mismatch');
  return Object.freeze({
    clientId:object.clientId,clientSecret:object.clientSecret,
    refreshToken:object.refreshToken,
    expectedMailbox:object.expectedMailbox,
    approvedSenders:exactList(object.approvedSenders,'sender'),
    allowedRecipients:exactList(object.allowedRecipients,'recipient')
  });
}
function makeOAuthClient(clientId,clientSecret){
  return new OAuth2Client(clientId,clientSecret);
}
function createC37StagingGmailBackend({
  runtime=process.env,loadManagedSecret,
  makeClient=makeOAuthClient,now=()=>Date.now()
}={}){
  // Construction, not just request processing, must fail closed.
  requireIsolatedStaging(runtime);
  if(typeof loadManagedSecret!=='function'||
     typeof makeClient!=='function'||typeof now!=='function')
    throw blocked('C3.7 managed backend dependencies required');

  async function runReadOnly(operation){
    // Never cache a refresh token or authorization on the server between calls.
    let tokenClient,reader;
    try{
      const config=readSecretEnvelope(await loadManagedSecret());
      tokenClient=makeClient(config.clientId,config.clientSecret);
      if(!tokenClient||['setCredentials','getAccessToken','getTokenInfo'].some(
        x=>typeof tokenClient[x]!=='function'))
        throw blocked('C3.7 OAuth token manager invalid');
      tokenClient.setCredentials({refresh_token:config.refreshToken});
      const result=await tokenClient.getAccessToken();
      const token=typeof result==='string'?result:result?.token;
      if(typeof token!=='string'||token.length<10)
        throw blocked('C3.7 could not acquire short-lived token');
      const info=await tokenClient.getTokenInfo(token);
      verifyReadOnlyTokenInfo(info,config.clientId,now());
      // Construct a *separate access-token-only reader*. It has no refresh
      // credential, so a Gmail 401 cannot transparently obtain new grants.
      reader=makeClient(config.clientId,undefined);
      if(!reader||typeof reader.setCredentials!=='function'||
         typeof reader.request!=='function')
        throw blocked('C3.7 token-bound read client invalid');
      reader.setCredentials({
        access_token:token,token_type:'Bearer',expiry_date:info.expiry_date
      });
      const trusted=createC35ReadOnlyGmailVerifier({
        authClient:reader,expectedMailbox:config.expectedMailbox,
        approvedSenders:config.approvedSenders,
        allowedRecipients:config.allowedRecipients
      });
      return await operation(trusted,config);
    }catch{
      // Provider payloads may contain sensitive Google account details.
      // Fail without returning any secret or message content to the caller.
      return Object.freeze({verified:false,status:'BLOCKED'});
    }finally{
      try{reader?.setCredentials({})}catch{}
      try{tokenClient?.setCredentials({})}catch{}
    }
  }

  async function inspectAuthorisedMailbox(){
    return runReadOnly(async trusted=>{
      const result=await trusted.verifyMailbox();
      return Object.freeze({
        verified:result.mailbox===EXPECTED_MAILBOX,
        status:result.mailbox===EXPECTED_MAILBOX?'READONLY_MAILBOX_VERIFIED':'BLOCKED'
      });
    });
  }
  async function verifyExistingSentTestEvidence({receipt,expected}={}){
    // The only enabled operation reads an existing SENT Gmail message ID.
    // No reservation, send, retry, mail draft or mutation is provided here.
    if(!receipt||!expected||
       typeof receipt.messageId!=='string'||
       typeof expected.eventId!=='string'||
       !expected.eventId.startsWith('contract_send_pkg_test_')||
       expected.recipient===''){
      return Object.freeze({verified:false,status:'BLOCKED'});
    }
    return runReadOnly(async(trusted,config)=>{
      if(!config.allowedRecipients.includes(expected.recipient))
        return Object.freeze({verified:false,status:'BLOCKED'});
      const verified=await trusted.verifyGatewayReceipt({receipt,expected});
      return Object.freeze({
        verified:verified===true,
        status:verified===true?'READONLY_SENT_EVIDENCE_VERIFIED':'BLOCKED'
      });
    });
  }

  // Note: returns no OAuth credentials, token, Gmail bytes, customer data
  // or Firestore reservation method. No HTTP route or Cloud Run deployment.
  return Object.freeze({
    inspectAuthorisedMailbox,verifyExistingSentTestEvidence
  });
}
module.exports={
  SERVICE,PROJECT,SECRET_PURPOSE,EXPECTED_MAILBOX,SCOPE,
  requireIsolatedStaging,readSecretEnvelope,createC37StagingGmailBackend
};
