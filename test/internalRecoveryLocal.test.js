'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
let oauth,createLocalRecovery;
test.before(async()=>{
 oauth=await import('../cloud-run/offer-portal-staging/internalRecoveryOAuth.mjs');
 ({createLocalRecovery}=await import('../cloud-run/offer-portal-staging/internalRecoveryLocal.mjs'));
});
const client={installed:{project_id:'lszh-automations',client_id:'123456789-abcdef.apps.googleusercontent.com',
 client_secret:'FAKE_CLIENT_VALUE_NOT_SECRET',auth_uri:'https://accounts.google.com/o/oauth2/auth',token_uri:'https://oauth2.googleapis.com/token'}};
test('desktop auth refuses another project, web clients and attacker endpoints',()=>{
 assert.equal(oauth.parseDesktopClient(client).clientId,client.installed.client_id);
 for(const change of [c=>c.installed.project_id='other',c=>c.web={},c=>c.installed.token_uri='https://attacker.invalid/token',c=>delete c.installed]){
  const c=structuredClone(client);change(c);assert.throws(()=>oauth.parseDesktopClient(c));
 }
});
test('desktop auth uses random state, PKCE S256 and loopback only',()=>{
 const c=oauth.parseDesktopClient(client),a=oauth.makeAuthorization(c,'http://127.0.0.1:12345/callback');
 const u=new URL(a.url),b=oauth.makeAuthorization(c,'http://127.0.0.1:12345/callback');
 assert.notEqual(a.state,b.state);assert.notEqual(a.verifier,b.verifier);
 assert.equal(u.searchParams.get('code_challenge_method'),'S256');
 assert.equal(u.searchParams.get('code_challenge'),require('node:crypto').createHash('sha256').update(a.verifier).digest('base64url'));
 assert.equal(u.searchParams.get('login_hint'),'lars@lszh-automations.ch');
 assert.throws(()=>oauth.makeAuthorization(c,'https://attacker.invalid/callback'));
 assert.equal(oauth.verifyCallback(new URL('http://127.0.0.1/callback?state='+a.state+'&code=FAKE'),a.state),'FAKE');
 for(const q of ['state=wrong&code=FAKE','state='+a.state+'&state='+a.state+'&code=FAKE','state='+a.state+'&error=denied','state='+a.state+'&code=A&code=B'])
  assert.throws(()=>oauth.verifyCallback(new URL('http://127.0.0.1/callback?'+q),a.state));
});
test('token refresh is shared across concurrent readers, cached and never leaks provider errors',async()=>{
 let calls=0;const c={clientId:'fake',clientSecret:'FAKE_CLIENT',refreshToken:'FAKE_REFRESH'};
 const get=oauth.createTokenProvider(c,async(url,o)=>{
  calls++;assert.equal(url,'https://oauth2.googleapis.com/token');assert.equal(o.redirect,'error');
  assert.equal(o.body.get('grant_type'),'refresh_token');
  return{ok:true,json:async()=>({access_token:'FAKE_ACCESS_TOKEN',expires_in:3600,scope:oauth.SCOPES.join(' ')})};
 });
 assert.deepEqual(await Promise.all(Array.from({length:8},()=>get())),Array(8).fill('FAKE_ACCESS_TOKEN'));
 await get();assert.equal(calls,1);
 const bad=oauth.createTokenProvider(c,async()=>{throw Error('SECRET_PROVIDER_CONTENT');});
 await assert.rejects(bad(),e=>e.message==='oauth_network_failed');
 const narrow=oauth.createTokenProvider(c,async()=>({ok:true,json:async()=>({access_token:'FAKE_ACCESS_TOKEN',expires_in:3600,scope:'openid'})}));
 await assert.rejects(narrow(),/oauth_required_scope_missing/);
});
test('identity verification rejects wrong Google or Gmail account',async()=>{
 for(const responses of [[{email:'other@example.invalid',verified_email:true}],
  [{email:'lars@lszh-automations.ch',verified_email:false}],
  [{email:'lars@lszh-automations.ch',verified_email:true},{emailAddress:'other@example.invalid'}]]){
  await assert.rejects(oauth.verifyAccount('FAKE_ACCESS',async()=>({ok:true,json:async()=>responses.shift()})));
 }
});
test('provider rejection reports only a fixed endpoint label and status, never the response body',async()=>{
 await assert.rejects(oauth.verifyAccount('FAKE_ACCESS',async()=>({ok:false,status:403,
  json:()=>assert.fail('must not read provider error content')})),
  e=>e instanceof oauth.LocalOAuthError&&e.message==='oauth_request_rejected_identity_403');
 let n=0;
 await assert.rejects(oauth.verifyAccount('FAKE_ACCESS',async()=>++n===1?
  {ok:true,json:async()=>({email:'lars@lszh-automations.ch',verified_email:true})}:
  {ok:false,status:403,json:()=>assert.fail('must not read provider error content')}),
  e=>e.message==='oauth_request_rejected_gmail_profile_403');
});
function completedRow(id,avv=false){return{id,fields:{Offertennummer:avv?'TEST_CLOUD_AVV_JA_20261019_NO_CONTRACT':'TEST_INTERNAL_LARS_20261019_NO_CONTRACT',
 Status:'Angenommen','Vertragsunterlagen akzeptiert':true,'AVV erforderlich':avv?'Ja':'Nein',
 'Online-Annahme Person':avv?'Synthetischer Cloud-Testkunde':'Lars Schulthess',
 'Online-Annahme E-Mail':avv?'fake-lszh-e2e@example.invalid':'lars.schulthess@outlook.com',
 'Online-Annahme Zeitstempel':'2026-10-20T15:05:19.544Z','Online-Annahme Bestätigung gesendet am':'2026-10-20T15:14:15Z'}};}
test('both completed records return before OAuth, SDK, PDFs, reservations or mail are loaded',async()=>{
 let rows=0;const run=createLocalRecovery({enabled:true,readRow:async id=>{rows++;return completedRow(id,id==='recktLXj5wUxLmHFQ');},
  loadServices:()=>assert.fail('completed record must not initialize services')});
 for(const id of ['recR70ZSPynGqA1LS','recktLXj5wUxLmHFQ'])assert.equal((await run(id)).status,'ALREADY_SENT');
 assert.equal(rows,2);await assert.rejects(run('recOTHER'));assert.equal(rows,2);
 assert.throws(()=>createLocalRecovery({enabled:false}));
});
test('changed identity or an active previous attempt stops before runtime authorization',async()=>{
 for(const mutate of [r=>r.fields['Echtbetrieb – kein Test']=true,r=>r.fields['Online-Annahme Person']='Other']){
  const row=completedRow('recR70ZSPynGqA1LS');mutate(row);
  const run=createLocalRecovery({enabled:true,readRow:async()=>row,loadServices:()=>assert.fail('must not load')});
  await assert.rejects(run(row.id));
 }
 const row=completedRow('recR70ZSPynGqA1LS');delete row.fields['Online-Annahme Bestätigung gesendet am'];
 row.fields['Online-Annahme Bestätigung in Bearbeitung']=true;
 const run=createLocalRecovery({enabled:true,readRow:async()=>row,loadServices:()=>assert.fail('must not load')});
 assert.equal((await run(row.id)).reason,'previous_attempt_requires_reconciliation');
});
