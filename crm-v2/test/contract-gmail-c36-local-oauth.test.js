'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {SCOPE,REDIRECT_URI,
  createC36OAuthSession,verifyReadOnlyTokenInfo,
  parseOAuthCallbackParameters,startC36LocalCallback
}=require('../contract-gmail-c36-local-oauth');
const {options,readLocalCredentials}=require('../scripts/c36-local-oauth-probe.cjs');
const CID='470613067122-c35oauthprobefixture.apps.googleusercontent.com';
const ACCOUNT='lars@lszh-automations.ch';
const NOW=1792920000000;
function fixture(overrides={}){
  let identity=ACCOUNT;
  let scopes=[SCOPE];
  let audience=CID;
  let expires=NOW+3_600_000;
  const calls={tokens:0,info:0,profile:0,set:[],params:null};
  const oauthClient={
    generateAuthUrl:opts=>{
      calls.params=opts;
      const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id',CID);
      url.searchParams.set('redirect_uri',REDIRECT_URI);
      url.searchParams.set('scope',opts.scope.join(' '));
      url.searchParams.set('state',opts.state);
      url.searchParams.set('access_type',opts.access_type);
      url.searchParams.set('response_type','code');
      url.searchParams.set('code_challenge',opts.code_challenge);
      url.searchParams.set('code_challenge_method',opts.code_challenge_method);
      return url.toString();
    },
    getToken:async opts=>{
      calls.tokens++;
      if(overrides.tokenError)throw Error('synthetic OAuth exchange unavailable');
      assert.equal(opts.code,'AUTH_CODE_0001');
      assert.equal(opts.redirect_uri,REDIRECT_URI);
      assert.ok(opts.codeVerifier.length>=43);
      const sha=createHash('sha256').update(opts.codeVerifier).digest('base64url');
      assert.equal(sha,calls.params.code_challenge);
      return {tokens:{access_token:'synthetic_access_token_0001',
        refresh_token:'SHOULD_NOT_BE_PERSISTED'}};
    },
    getTokenInfo:async token=>{
      calls.info++;assert.equal(token,'synthetic_access_token_0001');
      return {aud:audience,scopes,expiry_date:expires};
    },
    setCredentials:v=>{calls.set.push({...v})},
    request:async ({url,method})=>{
      calls.profile++;
      assert.equal(url,'https://gmail.googleapis.com/gmail/v1/users/me/profile');
      assert.equal(method,'GET');
      return {data:{emailAddress:identity}};
    }
  };
  const session=createC36OAuthSession({
    oauthClient,clientId:CID,expectedMailbox:ACCOUNT,
    now:()=>NOW,entropy:n=>Buffer.alloc(n,7)
  });
  const state=new URL(session.authUrl).searchParams.get('state');
  return {session,calls,
    run:(opts={})=>session.complete({
      state,code:'AUTH_CODE_0001',...opts
    }),
    identity:value=>{identity=value},
    scopes:value=>{scopes=value},
    audience:value=>{audience=value},
    expires:value=>{expires=value}};
}
test('C3.6 local OAuth URL requests only gmail.readonly, online access, PKCE and fixed loopback',()=>{
  const f=fixture(),url=new URL(f.session.authUrl);
  assert.equal(url.searchParams.get('redirect_uri'),REDIRECT_URI);
  assert.equal(url.searchParams.get('scope'),SCOPE);
  assert.equal(url.searchParams.get('access_type'),'online');
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.equal(f.calls.params.include_granted_scopes,false);
  assert.equal(f.calls.params.prompt,'select_account');
  assert.equal(f.calls.params.login_hint,ACCOUNT);
  assert.notEqual(url.searchParams.get('state'),url.searchParams.get('code_challenge'));
});
test('C3.6 valid one-time callback independently verifies exact scope, audience and mailbox',async()=>{
  const f=fixture();
  const result=await f.run();
  assert.deepEqual(result,{
    verified:true,mailbox:ACCOUNT,scopeVerified:true,scope:SCOPE,
    tokenPersisted:false,sendPermitted:false
  });
  assert.equal(f.calls.tokens,1);
  assert.equal(f.calls.info,1);
  assert.equal(f.calls.profile,1);
  assert.equal(f.calls.set.length,2);
  assert.equal('refresh_token' in f.calls.set[0],false);
  assert.deepEqual(f.calls.set[1],{});
  await assert.rejects(f.run(),/already used/);
  assert.equal(f.calls.tokens,1);
});
test('C3.6 rejects forged state before OAuth token exchange, consumes callback',async()=>{
  const f=fixture();
  await assert.rejects(f.run({state:'forged'}),/invalid OAuth callback/);
  await assert.rejects(f.run(),/already used/);
  assert.equal(f.calls.tokens,0);
  assert.equal(f.calls.info,0);
});
test('C3.6 consent denial and missing or invalid authorization code fail without a token',async()=>{
  for(const args of [
    {error:'access_denied',code:null},{code:''},{code:'no / whitespace'}
  ]){
    const f=fixture();
    await assert.rejects(f.run(args),/invalid OAuth callback/);
    assert.equal(f.calls.tokens,0);
  }
});
test('C3.6 refuses broader Gmail write scope and other unexpected OAuth scopes',async()=>{
  for(const list of [[SCOPE,'https://www.googleapis.com/auth/gmail.send'],
    ['https://www.googleapis.com/auth/gmail.modify'],[],
    ['openid',SCOPE]]){
    const f=fixture();f.scopes(list);
    await assert.rejects(f.run(),/exact readonly scope not verified/);
    assert.equal(f.calls.profile,0);
    assert.deepEqual(f.calls.set.at(-1),{});
  }
});
test('C3.6 invalid audience, expired token and personal Gmail account fail closed',async()=>{
  const badAudience=fixture();badAudience.audience('another-client');
  await assert.rejects(badAudience.run(),/readonly scope not verified/);
  assert.equal(badAudience.calls.profile,0);
  const expired=fixture();expired.expires(NOW+1000);
  await assert.rejects(expired.run(),/readonly scope not verified/);
  assert.equal(expired.calls.profile,0);
  const personal=fixture();personal.identity('personal@example.com');
  await assert.rejects(personal.run(),/Gmail OAuth identity/);
  assert.deepEqual(personal.calls.set.at(-1),{});
});
test('C3.6 failed provider exchange never persists tokens or retries',async()=>{
  const f=fixture({tokenError:true});
  await assert.rejects(f.run(),/exchange unavailable/);
  assert.equal(f.calls.tokens,1);
  assert.deepEqual(f.calls.set.at(-1),{});
  await assert.rejects(f.run(),/already used/);
});
test('C3.6 tokeninfo requires strict OAuth audience, expiry and no more than one scope',()=>{
  assert.equal(verifyReadOnlyTokenInfo({
    aud:CID,scopes:[SCOPE],expiry_date:NOW+3600000
  },CID,NOW),true);
  for(const info of [null,{},{
    aud:CID,scopes:[SCOPE,'openid'],expiry_date:NOW+3600000
  },{aud:'other',scopes:[SCOPE],expiry_date:NOW+3600000}]){
    assert.throws(()=>verifyReadOnlyTokenInfo(info,CID,NOW),/not verified/);
  }
});
test('C3.6 CLI refuses implicit network operation and requires absolute external JSON path',()=>{
  assert.throws(()=>options([]),/opt in missing/);
  assert.throws(()=>options(['--credentials','file.json','--expected-mailbox',ACCOUNT]),
    /opt in missing/);
  assert.throws(()=>options(['--enable-live-readonly-probe']),/opt in missing/);
  assert.throws(()=>readLocalCredentials('client.json'),/absolute local path/);
  assert.throws(()=>startC36LocalCallback({}),/not correctly configured/);
});
test('C3.6 refuses secret JSON located inside git checkout even if syntactically valid',()=>{
  const scriptDir=path.resolve(__dirname,'../scripts');
  const src=path.join(scriptDir,'c36-local-oauth-probe.cjs');
  assert.throws(()=>readLocalCredentials(src),/outside git checkout/);
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lszh-c36-fixture-'));
  try{
    const file=path.join(tmp,'synthetic-web.json');
    fs.writeFileSync(file,JSON.stringify({web:{
      client_id:CID,client_secret:'TEST_ONLY_EXAMPLE_DO_NOT_USE',
      auth_uri:'https://accounts.google.com/o/oauth2/auth',
      token_uri:'https://oauth2.googleapis.com/token'
    }}));
    const parsed=readLocalCredentials(file);
    assert.equal(parsed.clientId,CID);
    assert.equal(parsed.clientSecret,'TEST_ONLY_EXAMPLE_DO_NOT_USE');
  }finally{
    fs.rmSync(tmp,{recursive:true,force:true});
  }
});
test('C3.6 modules cannot send, mutate Gmail, deploy, or import into production CRM',()=>{
  const modulePath=path.join(__dirname,'../contract-gmail-c36-local-oauth.js');
  const source=fs.readFileSync(modulePath,'utf8');
  const script=fs.readFileSync(path.join(__dirname,
    '../scripts/c36-local-oauth-probe.cjs'),'utf8');
  for(const file of ['server.js','offer-send.js']){
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),
      /contract-gmail-c36-local-oauth|c36-local-oauth-probe/);
  }
  assert.doesNotMatch(source+script,/gmail\.send|sendAnEmail|\/messages\/send|gcloud run deploy|SecretManagerServiceClient/);
  assert.doesNotMatch(source+script,/writeFileSync\s*\([^)]*(?:token|credentials)/);
  assert.equal(typeof createC36OAuthSession,'function');
});

test('C3.6 diagnostic: user consent refusal never exchanges code and leaks no provider details',async()=>{
  const f=fixture();
  await assert.rejects(f.run({error:'access_denied'}),e=>{
    assert.equal(e.c36SafeCode,'CONSENT_DENIED');
    return true;
  });
  assert.equal(f.calls.tokens,0);
});
test('C3.6 diagnostic: token exchange and exact scope failures have safe separate codes',async()=>{
  const exchange=fixture({tokenError:true});
  await assert.rejects(exchange.run(),e=>{
    assert.equal(e.c36SafeCode,'TOKEN_EXCHANGE_FAILED');
    return true;
  });
  const scope=fixture();
  scope.scopes(['https://www.googleapis.com/auth/gmail.send']);
  await assert.rejects(scope.run(),e=>{
    assert.equal(e.c36SafeCode,'TOKEN_SCOPE_MISMATCH');
    return true;
  });
  assert.equal(scope.calls.profile,0);
});
test('C3.6 diagnostic: wrong OAuth audience, expired token and personal account are distinct',async()=>{
  const audience=fixture();audience.audience('other_client');
  await assert.rejects(audience.run(),e=>{
    assert.equal(e.c36SafeCode,'CLIENT_AUDIENCE_MISMATCH');
    return true;
  });
  const expired=fixture();expired.expires(NOW+1000);
  await assert.rejects(expired.run(),e=>{
    assert.equal(e.c36SafeCode,'TOKEN_EXPIRED_OR_INVALID');
    return true;
  });
  const account=fixture();account.identity('personal@example.com');
  await assert.rejects(account.run(),e=>{
    assert.equal(e.c36SafeCode,'GMAIL_ACCOUNT_MISMATCH');
    return true;
  });
});

test('C3.6 accepts Google Workspace hd, iss and unspecified callback metadata',()=>{
  const query=new URLSearchParams({
    code:'AUTH_CODE_0001',
    state:'csrf-token',
    scope:SCOPE,
    authuser:'0',
    prompt:'consent',
    hd:'lszh-automations.ch',
    iss:'https://accounts.google.com',
    future_ignored_param:'safe'
  });
  assert.deepEqual(parseOAuthCallbackParameters(query),{
    state:'csrf-token',code:'AUTH_CODE_0001',error:undefined
  });
});
test('C3.6 rejects duplicate state, duplicate code, and contradictory code/error',()=>{
  for(const raw of [
    'state=a&state=b&code=AUTH_CODE_0001',
    'state=a&code=one&code=two',
    'state=a&code=AUTH_CODE_0001&error=access_denied',
    'state=a&error=x&error=y'
  ]){
    assert.throws(()=>parseOAuthCallbackParameters(new URLSearchParams(raw)),
      error=>error.c36SafeCode==='CALLBACK_PARAMETERS_REJECTED');
  }
});
test('C3.6 ignores unexpected response keys but continues validating state and consent',async()=>{
  const f=fixture();
  const received=parseOAuthCallbackParameters(new URLSearchParams({
    state:'wrong-state',
    code:'AUTH_CODE_0001',
    hd:'lszh-automations.ch',
    provider_extension:'future'
  }));
  await assert.rejects(f.session.complete(received),/invalid OAuth callback/);
  assert.equal(f.calls.tokens,0);
  const denied=parseOAuthCallbackParameters(new URLSearchParams({
    state:'state-not-used-here',error:'access_denied',error_description:'private'
  }));
  assert.equal(denied.error,'access_denied');
  assert.equal('error_description' in denied,false);
});
