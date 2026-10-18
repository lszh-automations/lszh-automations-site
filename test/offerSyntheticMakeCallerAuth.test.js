'use strict';
// Ephemeral local RSA key, never exported to files, APIs or Google Cloud.
// This proves only OFFLINE signature/policy checks, not Make WIF capability.
const test=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync,sign}=require('node:crypto');
const {publicKey,privateKey}=generateKeyPairSync('rsa',{
  modulusLength:2048,publicExponent:0x10001
});
const another=generateKeyPairSync('rsa',{modulusLength:2048,publicExponent:0x10001});
const jwk=publicKey.export({format:'jwk'}),otherJwk=another.publicKey.export({format:'jwk'});
const AUD='https://lszh-reservation.demo.invalid';
const ISS='https://accounts.google.com';
const EMAIL='make-caller@demo-lszh-automations.iam.gserviceaccount.com';
const SUB='123456789012345678901';
const KID='LOCAL_DEMO_RSA_20261018';
const NOW=new Date('2026-10-18T12:00:00.000Z');
const ts=Math.floor(NOW.getTime()/1000);
const claims={
  iss:ISS,aud:AUD,sub:SUB,email:EMAIL,email_verified:true,
  iat:ts-60,exp:ts+300
};
const header={alg:'RS256',kid:KID,typ:'JWT'};
const b64=ob=>Buffer.from(JSON.stringify(ob)).toString('base64url');
function token(h=header,c=claims,key=privateKey){
 const parts=b64(h)+'.'+b64(c);
 return parts+'.'+sign('RSA-SHA256',Buffer.from(parts),key).toString('base64url');
}
const load=()=>import('../cloud-run/offer-portal-staging/syntheticMakeCallerAuth.mjs');
async function verify(identityToken=token(),extra={}){
 const {verifySyntheticMakeCallerOffline}=await load();
 return verifySyntheticMakeCallerOffline({
  identityToken,trustedPublicJwk:jwk,trustedKid:KID,now:NOW,...extra
 });
}
function inert(outcome){
 assert.equal(outcome.stopBeforeModule,5);
 assert.equal(outcome.canCreateGoogleDoc,false);
 assert.equal(outcome.canExportPdf,false);
 assert.equal(outcome.canUpload,false);
 assert.equal(outcome.canWriteFirestore,false);
 assert.equal(outcome.canWriteAirtable,false);
 assert.equal(outcome.canSendEmail,false);
 assert.equal(outcome.manualReviewRequired,true);
 assert.ok(!JSON.stringify(outcome).includes(EMAIL));
 assert.ok(!JSON.stringify(outcome).includes(SUB));
}
test('RSA signed synthetic identity fixture validates correct issuer, audience and service identity without GO',async()=>{
 const jwt=token(),result=await verify(jwt);
 assert.equal(result.status,'VERIFIED_OFFLINE_FIXTURE_ONLY');
 assert.equal(result.caller,'SYNTHETIC_DEMO_MAKE_CALLER');
 inert(result);
 assert.equal(JSON.stringify(result).includes(jwt),false);
});
test('forged signature, wrong trusted key, invalid kid, none/jku/x5u fail closed',async()=>{
 const bad=[
  token(header,claims,another.privateKey),
  token({...header,kid:'OTHER_DEMO_RSA_KID'},claims),
  token({...header,alg:'none'},claims),
  token({...header,jku:'https://evil.example.invalid/jwks'},claims),
  token({...header,jwk},claims),
  token({...header,x5u:'https://evil.example.invalid/cert'},claims),
  token({...header,typ:'NOT_JWT'},claims),
  'abc.def.ghi',
  token().slice(0,-8)+'AAAAZZZZ',
  token().replace(/\.[^.]+$/,''),
  'not-a-token',
  null,
  ''
 ];
 for(const jwt of bad){
  const r=await verify(jwt);
  assert.equal(r.status,'NO_GO');
  assert.equal(r.reason,'caller_identity_unverified');
  inert(r);
 }
 const wrong=await verify(token(),{trustedPublicJwk:otherJwk});
 assert.equal(wrong.status,'NO_GO');inert(wrong);
 const absent=await verify(token(),{trustedPublicJwk:null});
 assert.equal(absent.status,'NO_GO');inert(absent);
});
test('wrong issuer, audience, account, sub, unverified identity and time reject',async()=>{
 const changes=[
  {iss:'https://malicious.example.invalid'},
  {aud:'https://another-service.demo.invalid'},
  {aud:['https://lszh-reservation.demo.invalid','https://another-service.demo.invalid']},
  {sub:'123456789012345678902'},
  {email:'other-account@demo-lszh-automations.iam.gserviceaccount.com'},
  {email_verified:false},
  {iat:ts+1000,exp:ts+1200},
  {exp:ts-60},
  {iat:ts-4500,exp:ts+1500},
  {nbf:ts+80},
  {exp:'2026-10-18T12:05:00Z'},
  {iat:0,exp:0}
 ];
 for(const change of changes){
  const r=await verify(token(header,{...claims,...change}));
  assert.equal(r.status,'NO_GO');
  inert(r);
 }
 const malformed=await verify(token(header,claims),{now:new Date('invalid')});
 assert.equal(malformed.status,'NO_GO');
 inert(malformed);
});
test('untrusted Make request cannot provide its own verification config to gain access',async()=>{
 const {authenticatedSyntheticMakeReviewLocalEmulator}=await load();
 let dbCalls=0;
 const db={
  collection(){dbCalls++;throw Error('must not access');},
  runTransaction(){dbCalls++;throw Error('must not transact');},
  projectId:'lszh-automations',databaseId:'lszh-offers-staging'
 };
 const denied=await authenticatedSyntheticMakeReviewLocalEmulator(db,{
  identityToken:token(header,{...claims,aud:'https://other.demo.invalid'}),
  trustedPublicJwk:jwk,trustedKid:KID,
  payload:{sourceRecordId:'rec12345678901234'},now:NOW
 });
 assert.equal(denied.status,'NO_GO');
 assert.equal(dbCalls,0);
 inert(denied);
 await assert.rejects(()=>authenticatedSyntheticMakeReviewLocalEmulator(db,{
  identityToken:token(),trustedPublicJwk:jwk,trustedKid:KID,
  payload:{sourceRecordId:'rec12345678901234'},now:NOW
 }),/local_emulator_required/);
 assert.equal(dbCalls,0);
});
