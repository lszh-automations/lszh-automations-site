'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {OAuth2Client}=require('google-auth-library');
const {SCOPE,REDIRECT_URI}=require('../contract-gmail-c36-local-oauth');
const {createC371Consent}=require('../contract-gmail-c371-offline-consent');
const {createC371SecretWriter,SECRET,ADD}=require('../contract-gmail-c371-secret-writer');
const {options}=require('../scripts/c371-offline-oauth-to-secret.cjs');
const {readSecretEnvelope}=require('../contract-gmail-c37-backend-staging');
const CID='470613067122-testonlyc371oauth.apps.googleusercontent.com';
const CS='TEST_ONLY_C371_CLIENT_SECRET';
const NOW=1792920000000;
function fixture(overrides={}){
  let scopes=[SCOPE],aud=CID,expiry=NOW+3600000,mailbox='lars@lszh-automations.ch';
  let refresh='TEST_ONLY_REFRESH_TOKEN_FOR_TESTING_123';
  let clock=NOW;
  let storedBuffer=null;
  const calls={exchanged:0,profile:0,stores:0,credentials:[]};
  const client=new OAuth2Client(CID,CS,REDIRECT_URI);
  const generate=client.generateAuthUrl.bind(client);
  client.generateAuthUrl=x=>{calls.auth=x;return generate(x)};
  client.getToken=async args=>{
    calls.exchanged++;
    calls.tokenArgs=args;
    return {tokens:{access_token:'TEST_ONLY_ACCESS_TOKEN_123',
      ...(refresh===null?{}:{refresh_token:refresh})}};
  };
  client.getTokenInfo=async()=>({aud,scopes,expiry_date:expiry});
  client.setCredentials=v=>calls.credentials.push({...v});
  client.request=async x=>{
    calls.profile++;
    assert.equal(x.method,'GET');
    assert.ok(x.url.endsWith('/users/me/profile'));
    return {data:{emailAddress:mailbox}};
  };
  const storeEnvelope=async bytes=>{
    calls.stores++;
    storedBuffer=bytes;
    calls.envelope=readSecretEnvelope(bytes.toString('utf8'));
  };
  const session=createC371Consent({
    oauthClient:client,clientId:CID,clientSecret:CS,
    entropy:n=>Buffer.alloc(n,9),now:()=>clock,storeEnvelope,...overrides
  });
  const state=new URL(session.authUrl).searchParams.get('state');
  return {session,calls,stored:()=>storedBuffer,
    run:x=>session.complete({state,code:'TEST_ONLY_GOOGLE_CODE',...x}),
    changeScope:v=>scopes=v,changeAud:v=>aud=v,changeExpiry:v=>expiry=v,
    changeMailbox:v=>mailbox=v,changeRefresh:v=>refresh=v,
    changeClock:v=>clock=v};
}
async function rejected(p,reason){
  await assert.rejects(p,e=>{
    assert.equal(e.safeCode,reason);
    assert.equal(e.message,'C3.7.1 blocked');
    return true;
  });
}
test('C3.7.1 scope, offline access, Google client, PKCE and forced consent are fixed',()=>{
  const f=fixture(),u=new URL(f.session.authUrl);
  assert.equal(u.searchParams.get('redirect_uri'),REDIRECT_URI);
  assert.equal(u.searchParams.get('client_id'),CID);
  assert.equal(u.searchParams.get('access_type'),'offline');
  assert.equal(u.searchParams.get('scope'),SCOPE);
  assert.equal(u.searchParams.get('code_challenge_method'),'S256');
  assert.ok(u.searchParams.get('prompt').includes('consent'));
  assert.equal(f.calls.auth.include_granted_scopes,false);
});
test('C3.7.1 valid LSZH identity returns saved and wipes staging Buffer',async()=>{
  const f=fixture();
  assert.deepEqual(await f.run(),{stored:true,status:'SECRET_VERSION_STORED',
    mailbox:'lars@lszh-automations.ch',scopeVerified:true,sendPermitted:false});
  assert.equal(f.calls.profile,1);
  assert.equal(f.calls.stores,1);
  assert.equal(f.calls.envelope.expectedMailbox,'lars@lszh-automations.ch');
  assert.deepEqual(f.calls.envelope.approvedSenders,['info@lszh-automations.ch']);
  assert.deepEqual(f.calls.envelope.allowedRecipients,['lars@lszh-automations.ch']);
  assert.ok(f.stored().every(x=>x===0));
  assert.equal(f.calls.tokenArgs.redirect_uri,REDIRECT_URI);
  assert.ok(f.calls.tokenArgs.codeVerifier.length>42);
  assert.equal('refresh_token' in f.calls.credentials[0],false);
  assert.deepEqual(f.calls.credentials.at(-1),{});
  await rejected(f.run(),'CALLBACK_ALREADY_USED');
});
test('C3.7.1 missing refresh token blocks before mailbox or secret',async()=>{
  const f=fixture();f.changeRefresh(null);
  await rejected(f.run(),'NO_REFRESH_TOKEN');
  assert.equal(f.calls.profile,0);
  assert.equal(f.calls.stores,0);
});
test('C3.7.1 broadened scope, wrong client or expired token blocks before mailbox',async()=>{
  const changes=[
    f=>f.changeScope([SCOPE,'https://www.googleapis.com/auth/gmail.send']),
    f=>f.changeScope(['https://www.googleapis.com/auth/gmail.modify']),
    f=>f.changeScope(['openid',SCOPE]),
    f=>f.changeAud('other-client'),f=>f.changeExpiry(NOW+1000)
  ];
  for(const change of changes){
    const f=fixture();change(f);
    await rejected(f.run(),'SCOPE_AUDIENCE_EXPIRED');
    assert.equal(f.calls.profile,0);
    assert.equal(f.calls.stores,0);
  }
});
test('C3.7.1 wrong private mailbox blocks before storing',async()=>{
  const f=fixture();f.changeMailbox('someone@gmail.com');
  await rejected(f.run(),'MAILBOX_NOT_VERIFIED');
  assert.equal(f.calls.stores,0);
});
test('C3.7.1 denial, forged state, missing code and timeout are one use',async()=>{
  const cases=[
    [f=>f.run({error:'access_denied',code:null}),'CONSENT_DENIED'],
    [f=>f.run({state:'wrong'}),'INVALID_CALLBACK'],
    [f=>f.run({code:''}),'INVALID_CALLBACK'],
    [f=>{f.changeClock(NOW+300001);return f.run()},'INVALID_CALLBACK']
  ];
  for(const [action,reason] of cases){
    const f=fixture();await rejected(action(f),reason);
    assert.equal(f.calls.exchanged,0);
    await rejected(f.run(),'CALLBACK_ALREADY_USED');
  }
});
test('C3.7.1 Google auth error does not disclose secret or retry',async()=>{
  const f=fixture({storeEnvelope:async()=>{throw Error('private Google token content')}});
  await rejected(f.run(),'SECRET_STORE_FAILED');
  await rejected(f.run(),'CALLBACK_ALREADY_USED');
});
test('C3.7.1 protected writer refuses existing version with no write',async()=>{
  let writes=0;
  const writer=createC371SecretWriter({
    readVersions:async()=>'/versions/1',writeVersion:async()=>writes++
  });
  await assert.rejects(writer.assertEmpty());
  assert.equal(writes,0);
});
test('C3.7.1 secret writer rechecks empty state before writing',async()=>{
  let checks=0,writes=0;
  const writer=createC371SecretWriter({
    readVersions:async()=>++checks===1?'':'/versions/1',
    writeVersion:async()=>writes++
  });
  await writer.assertEmpty();
  const f=fixture({storeEnvelope:writer.store});
  await rejected(f.run(),'SECRET_STORE_FAILED');
  assert.equal(checks,2);assert.equal(writes,0);
});
test('C3.7.1 valid writer stores once and refuses subsequent writes',async()=>{
  let writes=0;
  const writer=createC371SecretWriter({
    readVersions:async()=>'',writeVersion:async()=>writes++
  });
  const f=fixture({storeEnvelope:writer.store});
  await f.run();
  assert.equal(writes,1);
  await assert.rejects(writer.store(Buffer.from('test')));
});
test('C3.7.1 CLI requires exactly named secret, local credentials and opt-in',()=>{
  const on='--enable-offline-readonly-secret-store';
  const c='--credentials',t='--confirm-secret',file='C:\\test.json';
  for(const args of [[],[on],[on,c,file],[on,c,file,t,'wrong'],
    [on,on,c,file,t,SECRET]])
    assert.throws(()=>options(args));
  assert.equal(options([on,c,file,t,SECRET])[t],SECRET);
});
test('C3.7.1 no productive mail APIs, token stdout or plain-text file writes',()=>{
  const files=['contract-gmail-c371-offline-consent.js',
    'contract-gmail-c371-secret-writer.js',
    'contract-gmail-c371-local-callback.js',
    'scripts/c371-offline-oauth-to-secret.cjs'];
  const src=files.map(x=>fs.readFileSync(path.resolve(__dirname,'..',x),'utf8')).join('\n');
  for(const name of ['server.js','offer-send.js']){
    const live=fs.readFileSync(path.resolve(__dirname,'..',name),'utf8');
    assert.equal(live.includes('c371-offline'),false);
  }
  assert.ok(src.includes('--data-file=-'));
  assert.ok(src.includes('child.stdin.end(bytes)'));
  for(const prohibited of ['gmail.send','/messages/send','sendMail(','writeFileSync('])
    assert.equal(src.includes(prohibited),false);
  assert.equal(ADD.includes('TEST_ONLY_'),false);
});
