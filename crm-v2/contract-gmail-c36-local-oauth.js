'use strict';
// C3.6: One-time LOCAL OAuth identity/scope probe, not a production auth callback.
// Never sends Gmail mail, persists tokens, requests offline access or writes to Firestore.
// Real network use requires explicit invocation of the separate local CLI by the operator.
const {randomBytes,createHash,timingSafeEqual}=require('node:crypto');
const {createServer}=require('node:http');
const {SCOPE,createC35GmailApiReadOnlyAdapter}=
  require('./contract-gmail-c35-readonly-api-staging');
const {blocked}=require('./contract-dispatch-release-staging');
const HOST='127.0.0.1';
const PORT=8789;
const CALLBACK='/oauth2/callback';
const REDIRECT_URI='http://'+HOST+':'+PORT+CALLBACK;
const CLIENT_ID=/^[0-9]{8,30}-[a-z0-9-]{10,100}\.apps\.googleusercontent\.com$/;
const MAILBOX=/^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
function safeCode(error,code){
  // Machine-readable, static error label only. NEVER embed OAuth code, token,
  // Google response body, authorization URL, email, or credentials.
  if(error&&typeof error==='object')error.c36SafeCode=code;
  return error;
}
function parseOAuthCallbackParameters(params){
  // RFC 6749 requires clients to ignore unrecognized response parameters.
  // Google can include hd/iss/other harmless metadata in addition to code and
  // state. Reject parameter pollution ONLY for security-bearing fields.
  if(!(params instanceof URLSearchParams)||
     ['state','code','error'].some(k=>params.getAll(k).length>1)||
     (params.has('code')&&params.has('error')))
    throw safeCode(blocked('C3.6 duplicate or contradictory OAuth callback parameters'),
      'CALLBACK_PARAMETERS_REJECTED');
  return {
    state:params.get('state'),
    code:params.get('code'),
    error:params.has('error')?params.get('error'):undefined
  };
}
function shaBase64(value){
  return createHash('sha256').update(value).digest('base64url');
}
function equal(a,b){
  if(typeof a!=='string'||typeof b!=='string')return false;
  const left=Buffer.from(a),right=Buffer.from(b);
  return left.length===right.length&&timingSafeEqual(left,right);
}
function verifyReadOnlyTokenInfo(info,clientId,now=Date.now()){
  // The Gmail /profile endpoint proves identity, NOT the effective OAuth scope.
  // A separate tokeninfo inspection must prove exact audience and narrow scope.
  const reason=!info||info.aud!==clientId?'CLIENT_AUDIENCE_MISMATCH':
    !Array.isArray(info.scopes)||info.scopes.length!==1||
    info.scopes[0]!==SCOPE?'TOKEN_SCOPE_MISMATCH':
    !Number.isFinite(info.expiry_date)||info.expiry_date<=now+30_000?
      'TOKEN_EXPIRED_OR_INVALID':null;
  if(reason)throw safeCode(blocked(
    'C3.6 OAuth audience, expiry or exact readonly scope not verified'
  ),reason);
  return true;
}
function createC36OAuthSession({
  oauthClient,clientId,expectedMailbox,now=()=>Date.now(),
  entropy=randomBytes
}={}){
  if(typeof clientId!=='string'||!CLIENT_ID.test(clientId)||
     typeof expectedMailbox!=='string'||!MAILBOX.test(expectedMailbox)||
     expectedMailbox.endsWith('.invalid')||
     !oauthClient||['generateAuthUrl','getToken','getTokenInfo','setCredentials',
       'request'].some(k=>typeof oauthClient[k]!=='function')||
     typeof now!=='function'||typeof entropy!=='function')
    throw blocked('C3.6 local OAuth configuration incomplete');
  const state=entropy(32).toString('base64url');
  const codeVerifier=entropy(48).toString('base64url');
  if(!/^[A-Za-z0-9_-]{40,60}$/.test(state)||
     !/^[A-Za-z0-9_-]{43,128}$/.test(codeVerifier))
    throw blocked('C3.6 secure challenge unavailable');
  const created=now();
  if(!Number.isFinite(created))throw blocked('C3.6 invalid clock');
  let consumed=false;
  const authUrl=oauthClient.generateAuthUrl({
    access_type:'online',include_granted_scopes:false,
    scope:[SCOPE],state,login_hint:expectedMailbox,
    prompt:'select_account',code_challenge:shaBase64(codeVerifier),
    code_challenge_method:'S256'
  });
  // Never accept a third-party redirect or non-Google OAuth URL from a
  // replaced client implementation.
  const parsed=new URL(authUrl);
  if(parsed.origin!=='https://accounts.google.com'||
     parsed.pathname!=='/o/oauth2/v2/auth'||
     parsed.searchParams.get('state')!==state||
     parsed.searchParams.get('redirect_uri')!==REDIRECT_URI||
     parsed.searchParams.get('scope')!==SCOPE||
     parsed.searchParams.get('access_type')!=='online'||
     parsed.searchParams.get('code_challenge_method')!=='S256')
    throw blocked('C3.6 OAuth authorization URL invalid');
  async function complete({state:received,code,error}={}){
    if(consumed)throw blocked('C3.6 callback already used');
    consumed=true; // Even a failed attempt permanently closes this session.
    if(now()-created<0||now()-created>300_000||
       !equal(state,received)||
       error!==undefined||
       typeof code!=='string'||code.length<4||code.length>2048||
       /[\s]/.test(code))
      throw safeCode(blocked('C3.6 expired or invalid OAuth callback'),
        error==='access_denied'?'CONSENT_DENIED':
        error!==undefined?'GOOGLE_CONSENT_ERROR':
        'CALLBACK_EXPIRED_OR_INVALID');
    try{
      let result;
      try{
        result=await oauthClient.getToken({code,codeVerifier,
          redirect_uri:REDIRECT_URI});
      }catch(e){throw safeCode(e,'TOKEN_EXCHANGE_FAILED');}
      const access=result?.tokens?.access_token;
      if(typeof access!=='string'||access.length<10)
        throw safeCode(blocked('C3.6 exchange returned no access token'),
          'TOKEN_NOT_RETURNED');
      let info;
      try{info=await oauthClient.getTokenInfo(access);}
      catch(e){throw safeCode(e,'TOKEN_INFO_FAILED');}
      verifyReadOnlyTokenInfo(info,clientId,now());
      // No refresh_token or other obtained credentials enter the verifier.
      oauthClient.setCredentials({
        access_token:access,token_type:'Bearer',
        expiry_date:info.expiry_date
      });
      let profile;
      try{
        profile=await createC35GmailApiReadOnlyAdapter({
          authClient:oauthClient,expectedMailbox
        }).verifyMailbox();
      }catch(e){
        throw safeCode(e,e?.message?.includes('Gmail OAuth identity')?
          'GMAIL_ACCOUNT_MISMATCH':'GMAIL_PROFILE_READ_FAILED');
      }
      return Object.freeze({verified:true,mailbox:profile.mailbox,
        scopeVerified:true,scope:SCOPE,tokenPersisted:false,
        sendPermitted:false});
    }finally{
      oauthClient.setCredentials({}); // No long-term access; memory only.
    }
  }
  return Object.freeze({authUrl,complete});
}
function startC36LocalCallback({session,onDone,port=PORT}={}){
  if(!session||typeof session.authUrl!=='string'||
     typeof session.complete!=='function'||typeof onDone!=='function'||
     !Number.isSafeInteger(port)||port!==PORT)
    throw blocked('C3.6 callback listener not correctly configured');
  let completed=false;
  const server=createServer(async(req,res)=>{
    const send=(status,message,type='text/plain; charset=utf-8')=>{
      res.writeHead(status,{'Content-Type':type,
        'Cache-Control':'no-store, max-age=0',
        'Referrer-Policy':'no-referrer',
        'Content-Security-Policy':"default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        'X-Content-Type-Options':'nosniff'});
      res.end(message);
    };
    if(req.method!=='GET'||req.headers.host!==HOST+':'+PORT||
       typeof req.url!=='string'||req.url.length>3500){
      send(400,'Ungueltige lokale Anfrage.');return;
    }
    const url=new URL(req.url,'http://'+HOST+':'+PORT);
    if(url.pathname==='/'&&url.search===''){
      const safe=session.authUrl.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
      send(200,'<!doctype html><html lang="de"><meta charset="utf-8">'+
        '<title>LSZH OAuth C3.6</title><h1>LSZH Test – Gmail nur lesen</h1>'+
        '<p>Einmalige Kontopruefung. Keine E-Mails und keine Token-Speicherung.</p>'+
        '<a rel="noreferrer" href="'+safe+'">Google-Anmeldung oeffnen</a></html>',
        'text/html; charset=utf-8');
      return;
    }
    if(url.pathname!==CALLBACK||completed){
      send(404,'Nicht verfuegbar.');return;
    }
    completed=true;
    try{
      // Additional Google response parameters are not authorization claims.
      // Only the state, code and error values reach the one-shot verifier.
      const result=await session.complete(
        parseOAuthCallbackParameters(url.searchParams)
      );
      send(200,'LSZH C3.6: Gmail-Konto und Leserechte geprueft. Keine Tokens gespeichert.');
      onDone(null,result);
    }catch(error){
      // The status code is deliberately static and does not reveal secrets.
      // Suppress provider error strings, tokens and query parameters.
      const code=/^[A-Z_]{5,40}$/.test(error?.c36SafeCode||'')?
        error.c36SafeCode:'OAUTH_VERIFICATION_FAILED';
      send(400,'LSZH C3.6: Pruefung nicht erfolgreich ('+code+'). Kein Versand.');
      onDone(safeCode(new Error(
        'C3.6 identity or readonly-scope verification failed'
      ),code));
    }finally{
      server.close();
    }
  });
  server.listen(PORT,HOST);
  return server;
}
module.exports={HOST,PORT,CALLBACK,REDIRECT_URI,SCOPE,
  verifyReadOnlyTokenInfo,parseOAuthCallbackParameters,
  createC36OAuthSession,startC36LocalCallback};
