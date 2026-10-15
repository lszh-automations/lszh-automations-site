'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {claimOfferOnce,ClaimRejected}=require('../firestoreAcceptanceState');
const {SCHEMA_VERSION}=require('../stagingOfferSchema');
const H=ch=>ch.repeat(64);
const pdf=ch=>({mimeType:'application/pdf',sha256:H(ch),driveFileId:'1'.repeat(24),archiveVerified:true});
const base={
  schemaVersion:SCHEMA_VERSION,fixtureId:'LSZH-STAGING-20261015-001',testOnly:true,
  status:'ISSUED',acceptanceEnabled:true,legallyApproved:true,
  deliveryConfirmed:true,archiveVerified:true,acceptedAt:null,
  expiresAt:'2030-01-01T00:00:00.000Z',tokenHash:H('1'),
  offerNumber:'DEMO-OFF-20261015-001',termsVersion:'TEST_ONLY_TERMS',
  recipientEmail:'lars@lszh-automations.ch',
  avvRequired:true,avvVersion:'TEST_ONLY_AVV',
  documents:{offer:pdf('2'),terms:pdf('3'),avv:pdf('4')}
};
const input={
  documentPath:'stagingOfferFixtures/DEMO-OFF-20261015-001',
  expected:{tokenHash:H('1'),quoteSha256:H('2'),termsSha256:H('3'),
    avvSha256:H('4'),termsVersion:'TEST_ONLY_TERMS',
    avvVersion:'TEST_ONLY_AVV',offerNumber:'DEMO-OFF-20261015-001'},
  actor:{name:'Alex Muster',email:'lars@lszh-automations.ch',
    authorized:true,acceptTerms:true,acceptAvv:true},
  now:new Date('2026-10-15T12:00:00Z')
};
function fakeStore(initial){
  let state=structuredClone(initial),writes=0;
  // Simulates serializable transactions; not a substitute for live Firestore!
  let serial=Promise.resolve();
  const db={doc(path){return {path}},runTransaction(fn){
    const job=serial.then(async()=>{
      const tx={
        get:async()=>({exists:!!state,data:()=>structuredClone(state)}),
        update:(ref,change)=>{state={...state,...structuredClone(change)};writes++}
      };
      return fn(tx);
    });
    serial=job.catch(()=>{});return job;
  }};
  return {db,getState:()=>state,getWrites:()=>writes};
}
async function rejectsWithoutWrite(store,overrides={}){
  await assert.rejects(claimOfferOnce({...input,...overrides,db:store.db}),ClaimRejected);
  assert.equal(store.getWrites(),0);
}
test('synthetic AVV claim records an accepted state and pending reconciliation',async()=>{
  const s=fakeStore(base);
  const result=await claimOfferOnce({...input,db:s.db});
  assert.equal(result.accepted,true);assert.equal(s.getWrites(),1);
  assert.equal(s.getState().status,'ACCEPTED');
  assert.equal(s.getState().reconciliationStatus,'PENDING');
  assert.equal(s.getState().acceptanceEvidence.avvSha256,H('4'));
});
test('two concurrent claims serialize: one accepted, one rejected',async()=>{
  const s=fakeStore(base);
  const result=await Promise.allSettled([0,1].map(()=>claimOfferOnce({...input,db:s.db})));
  assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(result.filter(x=>x.status==='rejected').length,1);
  assert.equal(s.getWrites(),1);
});
test('missing document rejected without writes',async()=>{
  await rejectsWithoutWrite(fakeStore(null));
});
test('disabled, legally unapproved, delivery missing, archive unverified, expired blocked',async()=>{
  for(const [field,value] of [
    ['acceptanceEnabled',false],['legallyApproved',false],
    ['deliveryConfirmed',false],['archiveVerified',false],
    ['expiresAt','2020-01-01T00:00:00Z']]){
    await rejectsWithoutWrite(fakeStore({...base,[field]:value}));
  }
});
test('token, PDF hash, recipient or AVV mismatch blocked',async()=>{
  for(const changed of [
    {expected:{...input.expected,tokenHash:H('5')}},
    {expected:{...input.expected,quoteSha256:H('5')}},
    {expected:{...input.expected,termsSha256:H('5')}},
    {expected:{...input.expected,avvSha256:H('5')}},
    {actor:{...input.actor,email:'wrong@example.org'}},
    {actor:{...input.actor,acceptAvv:false}}
  ]) await rejectsWithoutWrite(fakeStore(base),changed);
});
test('AVV optional when not required',async()=>{
  const s=fakeStore({...base,avvRequired:false,avvVersion:null,
    documents:{offer:pdf('2'),terms:pdf('3')}});
  await claimOfferOnce({...input,db:s.db,actor:{...input.actor,acceptAvv:false}});
  assert.equal(s.getState().acceptanceEvidence.acceptedAvv,false);
});
test('bad path and absent authorization/consent rejected before transaction',async()=>{
  for(const changed of [
    {documentPath:'liveOffers/customer_123'},
    {actor:{...input.actor,acceptTerms:false}},
    {actor:{...input.actor,authorized:false}}
  ]) await rejectsWithoutWrite(fakeStore(base),changed);
});

test('non-archived, missing-id or wrong MIME PDF blocks claim',async()=>{
  for(const changed of [
    {...pdf('2'),archiveVerified:false},
    {...pdf('2'),driveFileId:null},
    {...pdf('2'),mimeType:'text/plain'}
  ]) await rejectsWithoutWrite(fakeStore({...base,documents:{...base.documents,offer:changed}}));
});
test('unknown schema, wrong fixture identity and absent testOnly are blocked',async()=>{
  for(const changed of [
    {schemaVersion:999},
    {fixtureId:'LSZH-STAGING-20261015-999'},
    {testOnly:false},
    {expiresAt:null},
    {avvRequired:null},
    {tokenHash:null}
  ]) await rejectsWithoutWrite(fakeStore({...base,...changed}));
});
