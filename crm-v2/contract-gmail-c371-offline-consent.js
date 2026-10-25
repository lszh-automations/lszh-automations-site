'use strict';
// C3.7.1 isolated local operator flow. Never part of a live CRM route.
// Sensitive OAuth results are passed only to a provided in-process writer.
const {randomBytes,createHash,timingSafeEqual}=require('node:crypto');
const {verifyReadOnlyTokenInfo,REDIRECT_URI,SCOPE}=
  require('./contract-gmail-c36-local-oauth');
const {createC35GmailApiReadOnlyAdapter}=
  require('./contract-gmail-c35-readonly-api-staging');
const {readSecretEnvelope,SECRET_PURPOSE,EXPECTED_MAILBOX}=
  require('./contract-gmail-c37-backend-staging');

const SENDERS=Object.freeze(['info@lszh-automations.ch']);
const RECIPIENTS=Object.freeze(['lars@lszh-automations.ch']);
const CID=/^[0-9]{8,30}-[a-z0-9-]{10,100}\.apps\.googleusercontent\.com$/;
function abort(code){const e=new Error('C3.7.1 blocked');e.safeCode=code;return e;}
function equal(a,b){
  if(typeof a!=='string'||typeof b!=='string')return false;
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length===y.length&&timingSafeEqual(x,y);
}
function createC371Consent({oauthClient,clientId,clientSecret,
  storeEnvelope,now=()=>Date.now(),entropy=randomBytes}={}){
  if(!CID.test(clientId||'')||typeof clientSecret!=='string'||
     clientSecret.length<10||typeof storeEnvelope!=='function'||
     typeof now!=='function'||typeof entropy!=='function'||
     !oauthClient||['generateAuthUrl','getToken','getTokenInfo',
       'setCredentials','request'].some(x=>typeof oauthClient[x]!=='function'))
    throw abort('INVALID_CONFIGURATION');
  const state=entropy(32).toString('base64url');
  const verifier=entropy(48).toString('base64url');
  if(!/^[A-Za-z0-9_-]{40,60}$/.test(state)||
     !/^[A-Za-z0-9_-]{43,128}$/.test(verifier))
    throw abort('INVALID_ENTROPY');
  const created=now();
  if(!Number.isFinite(created))throw abort('INVALID_CLOCK');
  const challenge=createHash('sha256').update(verifier).digest('base64url');
  let used=false;
  const authUrl=oauthClient.generateAuthUrl({
    access_type:'offline',prompt:'consent select_account',
    include_granted_scopes:false,scope:[SCOPE],state,
    login_hint:EXPECTED_MAILBOX,code_challenge:challenge,
    code_challenge_method:'S256'
  });
  const url=new URL(authUrl);
  if(url.origin!=='https://accounts.google.com'||
     url.pathname!=='/o/oauth2/v2/auth'||
     url.searchParams.get('redirect_uri')!==REDIRECT_URI||
     url.searchParams.get('client_id')!==clientId||
     url.searchParams.get('access_type')!=='offline'||
     url.searchParams.get('scope')!==SCOPE||
     url.searchParams.get('state')!==state||
     url.searchParams.get('code_challenge')!==challenge||
     url.searchParams.get('code_challenge_method')!=='S256'||
     !url.searchParams.get('prompt')?.split(' ').includes('consent'))
    throw abort('INVALID_AUTH_URL');
  async function complete({state:received,code,error}={}){
    if(used)throw abort('CALLBACK_ALREADY_USED');
    used=true;
    if(now()-created<0||now()-created>300000||
       !equal(received,state)||error!==undefined||
       typeof code!=='string'||code.length<4||code.length>2048||
       /\s/.test(code))
      throw abort(error==='access_denied'?'CONSENT_DENIED':'INVALID_CALLBACK');
    let secret;
    try{
      let issued;
      try{
        issued=await oauthClient.getToken({
          code,codeVerifier:verifier,redirect_uri:REDIRECT_URI
        });
      }catch{throw abort('TOKEN_EXCHANGE_FAILED');}
      const access=issued?.tokens?.access_token;
      const refresh=issued?.tokens?.refresh_token;
      if(typeof access!=='string'||access.length<10)
        throw abort('NO_ACCESS_TOKEN');
      if(typeof refresh!=='string'||refresh.length<20||refresh.length>2048)
        throw abort('NO_REFRESH_TOKEN');
      let info;
      try{info=await oauthClient.getTokenInfo(access)}
      catch{throw abort('TOKEN_INFO_FAILED')}
      try{verifyReadOnlyTokenInfo(info,clientId,now())}
      catch{throw abort('SCOPE_AUDIENCE_EXPIRED')}
      oauthClient.setCredentials({
        access_token:access,token_type:'Bearer',expiry_date:info.expiry_date
      });
      try{
        await createC35GmailApiReadOnlyAdapter({
          authClient:oauthClient,expectedMailbox:EXPECTED_MAILBOX
        }).verifyMailbox();
      }catch{throw abort('MAILBOX_NOT_VERIFIED')}
      secret=Buffer.from(JSON.stringify({
        version:1,purpose:SECRET_PURPOSE,
        expectedMailbox:EXPECTED_MAILBOX,clientId,clientSecret,
        refreshToken:refresh,approvedSenders:SENDERS,allowedRecipients:RECIPIENTS
      }),'utf8');
      try{readSecretEnvelope(secret.toString('utf8'))}
      catch{throw abort('SECRET_POLICY_INVALID')}
      try{await storeEnvelope(secret)}
      catch{throw abort('SECRET_STORE_FAILED')}
      return Object.freeze({stored:true,status:'SECRET_VERSION_STORED',
        mailbox:EXPECTED_MAILBOX,scopeVerified:true,sendPermitted:false});
    }finally{
      try{oauthClient.setCredentials({})}catch{}
      if(secret)secret.fill(0);
    }
  }
  return Object.freeze({authUrl,complete});
}
module.exports={createC371Consent,SENDERS,RECIPIENTS};
