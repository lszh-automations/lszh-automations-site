'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {issueSyntheticOfferOnce,SyntheticIssueRejected}=require('../syntheticOfferIssuance');
const {claimOfferOnce,ClaimRejected}=require('../firestoreAcceptanceState');
const {buildOfferFragmentLink}=require('../services/offer-acceptance-staging/offerLinks');
const pdf=s=>Buffer.from('%PDF-1.7\nSYNTHETIC '+s+'\n%%EOF');
const archiveBytes={offer:pdf('QUOTE'),terms:pdf('TERMS'),avv:pdf('AVV')};
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const fixtureId='LSZH-EMULATOR-ABC1234567890abcdef';
const NOW=new Date('2026-10-15T12:00:00Z');
const expiry=new Date('2026-10-16T12:00:00Z');
const docs=Object.fromEntries(Object.entries(archiveBytes).map(([k,v])=>[k,{
 mimeType:'application/pdf',sha256:hash(v),driveFileId:'1'.repeat(24),
 archiveVerified:true}]));
function draft(extra={}){
 return {schemaVersion:1,fixtureId,testOnly:true,offerNumber:'DEMO-OFF-20991231-999',
  status:'TEST_DRAFT_NOT_SENT',recipientEmail:'fake-tester@example.invalid',
  validUntil:'2099-12-31',termsVersion:'TEST_ONLY_TERMS',
  avvRequired:true,avvVersion:'TEST_ONLY_AVV',
  tokenHash:null,issuedAt:null,expiresAt:null,acceptedAt:null,acceptanceEvidence:null,
  reconciliationStatus:'NOT_STARTED',legallyApproved:false,acceptanceEnabled:false,
  deliveryEnabled:false,deliveryConfirmed:false,archiveVerified:true,
  requiresManualReview:true,documents:docs,...extra};
}
function fakeDb(initial=draft()){
 let state=structuredClone(initial),writes=0;
 let serial=Promise.resolve();
 const db={doc:path=>({path}),runTransaction:fn=>{
  const next=serial.then(async()=>{
   let patch=null;
   const tx={get:async()=>({exists:!!state,data:()=>structuredClone(state)}),
     update:(ref,values)=>{assert.equal(ref.path,'stagingOfferFixtures/'+fixtureId);
       patch=structuredClone(values)}};
   const value=await fn(tx);
   if(patch){state={...state,...patch};writes++;}
   return value;
  });
  serial=next.catch(()=>{});
  return next;
 }};
 return {db,get:()=>structuredClone(state),writes:()=>writes};
}
function call(s,options={}){
 return issueSyntheticOfferOnce({db:s.db,fixtureId,archiveBytes,now:NOW,
  expiresAt:expiry,testMode:'offline-or-emulator-only',...options});
}
async function denied(s,options={},reason){
 await assert.rejects(call(s,options),e=>{
  assert.ok(e instanceof SyntheticIssueRejected);
  if(reason)assert.equal(e.reason,reason);
  return true;
 });
 assert.equal(s.writes(),0);
}
test('issue once: random 256-bit token, SHA-256 only stored, delivery disabled',async()=>{
 const s=fakeDb(),result=await call(s);
 assert.equal(result.issued,true);
 assert.match(result.token,/^[A-Za-z0-9_-]{43}$/);
 const stored=s.get();
 assert.equal(stored.tokenHash,hash(result.token));
 assert.equal(stored.status,'TEST_ISSUED_NOT_DELIVERED');
 assert.equal(stored.issuedAt,NOW.toISOString());
 assert.equal(stored.expiresAt,expiry.toISOString());
 assert.equal(stored.deliveryConfirmed,false);
 assert.equal(stored.acceptanceEnabled,false);
 assert.equal(stored.legallyApproved,false);
 assert.equal(s.writes(),1);
 assert.doesNotMatch(JSON.stringify(stored),new RegExp(result.token));
 const link=buildOfferFragmentLink({origin:'https://staging.example.invalid',token:result.token,
  allowedOrigins:['https://staging.example.invalid']});
 assert.equal(new URL(link).search,'');
 assert.equal(new URL(link).hash,'#code='+result.token);
});
test('parallel issuers on one fixture: only one succeeds and persists',async()=>{
 const s=fakeDb();
 const results=await Promise.allSettled([call(s),call(s)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const rejected=results.find(r=>r.status==='rejected');
 assert.equal(rejected.reason.reason,'already_issued');
 assert.equal(s.writes(),1);
});
test('retry after commit is refused, not replaced with a second token',async()=>{
 const s=fakeDb();
 await call(s);
 const first=s.get().tokenHash;
 await assert.rejects(call(s),e=>e.reason==='already_issued');
 assert.equal(s.get().tokenHash,first);
 assert.equal(s.writes(),1);
});
test('link created by issuer is NOT an acceptable contract',async()=>{
 const s=fakeDb(),out=await call(s);
 await assert.rejects(claimOfferOnce({db:s.db,
  documentPath:'stagingOfferFixtures/'+fixtureId,
  expected:{tokenHash:hash(out.token),quoteSha256:hash(archiveBytes.offer),
    termsSha256:hash(archiveBytes.terms),avvSha256:hash(archiveBytes.avv),
    termsVersion:'TEST_ONLY_TERMS',avvVersion:'TEST_ONLY_AVV',offerNumber:'DEMO-OFF-20991231-999'},
  actor:{name:'Test Muster',email:'fake-tester@example.invalid',
    authorized:true,acceptTerms:true,acceptAvv:true},now:NOW}),ClaimRejected);
 assert.equal(s.get().status,'TEST_ISSUED_NOT_DELIVERED');
 assert.equal(s.writes(),1);
});
test('real or legally approved record, changed schema or non-draft cannot issue',async()=>{
 for(const modified of [
  {testOnly:false},{schemaVersion:99},{legallyApproved:true},
  {acceptanceEnabled:true},{deliveryEnabled:true},{deliveryConfirmed:true},
  {requiresManualReview:false},{status:'ISSUED'},
  {issuedAt:NOW.toISOString()},{acceptanceEvidence:{x:1}},
  {recipientEmail:'real@example.com'}, {termsVersion:'RC1'},
  {reconciliationStatus:'PENDING'}
 ]) await denied(fakeDb(draft(modified)));
});
test('altered bytes, missing AVV, wrong archived metadata and forged fixture reject',async()=>{
 for(const modified of [
  {documents:{...docs,offer:{...docs.offer,sha256:'f'.repeat(64)}}},
  {documents:{...docs,avv:{...docs.avv,archiveVerified:false}}},
  {documents:{...docs,terms:{...docs.terms,driveFileId:'invalid'}}},
  {archiveVerified:false},
  {avvVersion:'NOT_TEST_ONLY'},
  {fixtureId:'LSZH-EMULATOR-NOT-SAME-ID'}
 ]) await denied(fakeDb(draft(modified)));
 await denied(fakeDb(),{archiveBytes:{...archiveBytes,avv:pdf('CHANGED')}},'document_changed');
 await denied(fakeDb(),{archiveBytes:{offer:archiveBytes.offer,terms:archiveBytes.terms}},'document_changed');
 await denied(fakeDb(),{archiveBytes:{...archiveBytes,avv:Buffer.from('INVALID')}},'unverified_archive');
});
test('7-day TTL, effective expiry and UTC date input constraints',async()=>{
 const s=fakeDb();
 await denied(s,{expiresAt:new Date(NOW.getTime()+8*24*3600000)},'invalid_input');
 await denied(s,{expiresAt:new Date(NOW.getTime()+60*1000)},'invalid_input');
 await denied(fakeDb(draft({validUntil:'2026-10-15'})),{},'expired');
 await denied(s,{now:new Date('invalid')},'invalid_input');
});
test('emulator fixture ID and explicit test intent required',async()=>{
 const s=fakeDb();
 await denied(s,{testMode:'production'},'invalid_input');
 await denied(s,{fixtureId:'LSZH-STAGING-20261015-001'},'invalid_input');
 await denied(s,{fixtureId:'customer-123'},'invalid_input');
});
test('bad random source fails before any transaction',async()=>{
 const s=fakeDb();
 await denied(s,{randomBytes:()=>Buffer.alloc(8)},'invalid_entropy');
});
test('optional AVV mode must NOT silently bind a third document',async()=>{
 const noAvvDocs={offer:docs.offer,terms:docs.terms};
 const s=fakeDb(draft({avvRequired:false,avvVersion:null,documents:noAvvDocs}));
 const r=await call(s,{archiveBytes:{offer:archiveBytes.offer,terms:archiveBytes.terms}});
 assert.equal(r.issued,true);
 assert.equal(s.get().status,'TEST_ISSUED_NOT_DELIVERED');
});
