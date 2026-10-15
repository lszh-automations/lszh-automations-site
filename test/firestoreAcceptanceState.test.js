'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {claimOfferOnce,ClaimRejected}=require('../firestoreAcceptanceState');
const {SCHEMA_VERSION}=require('../stagingOfferSchema');
const {LOCK_COLLECTION,bindingFingerprint}=require('../syntheticAirtableBinding');
const {mockAirtableOffer}=require('./helpers/mockAirtableOffer');
const {mockFrozenContract}=require('./helpers/mockContractFreeze');
const {COLLECTION:FREEZES}=require('../syntheticContractFreeze');
const H=ch=>ch.repeat(64);
const pdf=ch=>({mimeType:'application/pdf',sha256:H(ch),driveFileId:'1'.repeat(24),archiveVerified:true});
const base={
  schemaVersion:SCHEMA_VERSION,fixtureId:'LSZH-EMULATOR-20261015AAAA',testOnly:true,
  status:'ISSUED',acceptanceEnabled:true,legallyApproved:true,
  deliveryConfirmed:true,archiveVerified:true,acceptedAt:null,
  expiresAt:'2030-01-01T00:00:00.000Z',tokenHash:H('1'),
  offerNumber:'DEMO-OFF-20261015-001',termsVersion:'TEST_ONLY_TERMS',
  validUntil:'2099-12-31',
  recipientEmail:'fake-tester@example.invalid',
  avvRequired:true,avvVersion:'TEST_ONLY_AVV',
  documents:{offer:pdf('2'),terms:pdf('3'),avv:pdf('4')}
};
base.airtableRecordId='recTEST0000000000';
base.airtableBinding={schemaVersion:1,source:'SYNTHETIC_READ_ONLY',
  boundAt:'2026-10-15T10:00:00.000Z',
  fingerprint:bindingFingerprint(base,base.airtableRecordId)};
Object.assign(base,mockFrozenContract(base).state);
const input={
  documentPath:'stagingOfferFixtures/LSZH-EMULATOR-20261015AAAA',
  expected:{tokenHash:H('1'),quoteSha256:H('2'),termsSha256:H('3'),
    avvSha256:H('4'),termsVersion:'TEST_ONLY_TERMS',
    avvVersion:'TEST_ONLY_AVV',offerNumber:'DEMO-OFF-20261015-001'},
  actor:{name:'Alex Muster',email:'fake-tester@example.invalid',
    authorized:true,acceptTerms:true,acceptAvv:true},
  now:new Date('2026-10-15T12:00:00Z')
};
function fakeStore(initial,opts={}){
  let state=structuredClone(initial),writes=0;
  const lock=opts.noLock?null:{
    fixtureId:state?.fixtureId,recordId:state?.airtableRecordId,
    fingerprint:opts.corruptLock?'f'.repeat(64):state?.airtableBinding?.fingerprint,
    boundAt:state?.airtableBinding?.boundAt,syntheticOnly:true
  };
  const freeze=opts.noFreeze||!state?.airtableBinding?null:mockFrozenContract(state).freeze;
  if(freeze&&opts.corruptFreeze)freeze.manifest.documents.terms.revisionId='bad';
  // Simulates serializable transactions; not a substitute for live Firestore!
  let serial=Promise.resolve();
  const db={doc(path){return {path}},runTransaction(fn){
    const job=serial.then(async()=>{
      const tx={
        get:async ref=>ref.path.startsWith(LOCK_COLLECTION+'/')
          ?{exists:!!lock,data:()=>structuredClone(lock)}
          :ref.path.startsWith(FREEZES+'/')
            ?{exists:!!freeze,data:()=>structuredClone(freeze)}
            :{exists:!!state,data:()=>structuredClone(state)},
        update:(ref,change)=>{state={...state,...structuredClone(change)};writes++}
      };
      return fn(tx);
    });
    serial=job.catch(()=>{});return job;
  }};
  return {db,getState:()=>state,getWrites:()=>writes};
}
async function rejectsWithoutWrite(store,overrides={}){
  await assert.rejects(claimOfferOnce({...input,airtableRecordId:store.getState()?.airtableRecordId,
    readRecord:async()=>mockAirtableOffer(store.getState(),'acceptance'),
    ...overrides,db:store.db}),ClaimRejected);
  assert.equal(store.getWrites(),0);
}
test('synthetic AVV claim records an accepted state and pending reconciliation',async()=>{
  const s=fakeStore(base);
  const result=await claimOfferOnce({...input,db:s.db,
    airtableRecordId:base.airtableRecordId,
    readRecord:async()=>mockAirtableOffer(s.getState(),'acceptance')});
  assert.equal(result.accepted,true);assert.equal(s.getWrites(),1);
  assert.equal(s.getState().status,'ACCEPTED');
  assert.equal(s.getState().reconciliationStatus,'PENDING');
  assert.equal(s.getState().acceptanceEvidence.avvSha256,H('4'));
});
test('two concurrent claims serialize: one accepted, one rejected',async()=>{
  const s=fakeStore(base);
  const result=await Promise.allSettled([0,1].map(()=>claimOfferOnce({...input,db:s.db,
    airtableRecordId:base.airtableRecordId,
    readRecord:async()=>mockAirtableOffer(s.getState(),'acceptance')})));
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
  const optional={...base,avvRequired:false,avvVersion:null,
    documents:{offer:pdf('2'),terms:pdf('3')}};
  optional.airtableBinding={...base.airtableBinding,
    fingerprint:bindingFingerprint(optional,optional.airtableRecordId)};
  const s=fakeStore(mockFrozenContract(optional).state);
  await claimOfferOnce({...input,db:s.db,actor:{...input.actor,acceptAvv:false},
    airtableRecordId:optional.airtableRecordId,
    readRecord:async()=>mockAirtableOffer(s.getState(),'acceptance')});
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

test('acceptance refuses a missing, forged or mismatched CRM binding',async()=>{
 await rejectsWithoutWrite(fakeStore({...base,airtableRecordId:null}));
 await rejectsWithoutWrite(fakeStore({...base,airtableBinding:null}));
 await rejectsWithoutWrite(fakeStore(base,{noLock:true}));
 await rejectsWithoutWrite(fakeStore(base,{corruptLock:true}));
 const tampered={...base,documents:{...base.documents,offer:{...base.documents.offer,driveFileId:'Z'.repeat(24)}}};
 await rejectsWithoutWrite(fakeStore(tampered));
});

test('fresh Airtable divergence blocks acceptance despite intact Firestore lock',async()=>{
 for(const edited of [
  {'Offertennummer':'DEMO-OFF-OTHER'}, {'Projektbedingungen Version':'OTHER'},
  {'Gültig bis':'2099-12-30'},
  {'Lead E-Mail':['fake-imposter@example.invalid']},
  {'Online-Annahme Offerten-SHA256':'f'.repeat(64)},
  {'Online-Annahme AVV Drive ID':'Z'.repeat(24)},
  {'Online-Annahme AVV-Version':'OTHER'},
  {'AVV erforderlich':'Nein'},{Status:'Entwurf'},
  {'Vertragsunterlagen versendet':false},
  {'Online-Annahme rechtlich freigegeben':false},
  {'Online-Annahme Link gesendet am':null},
  {'Online-Annahme Token-Hash':'f'.repeat(64)},
  {'Vertragsunterlagen akzeptiert':true}
 ]){
  const store=fakeStore(base);
  await rejectsWithoutWrite(store,{readRecord:async()=>({
    ...mockAirtableOffer(store.getState(),'acceptance'),
    fields:{...mockAirtableOffer(store.getState(),'acceptance').fields,...edited}
  })});
 }
});
test('untrusted/missing Airtable reader rejects acceptance without side effects',async()=>{
 const store=fakeStore(base);
 await rejectsWithoutWrite(store,{readRecord:null});
 await rejectsWithoutWrite(store,{readRecord:async()=>{throw Error('offline');}});
 await rejectsWithoutWrite(store,{airtableRecordId:'recOTHER000000000'});
 assert.equal(store.getWrites(),0);
});

test('acceptance refuses missing frozen contract, wrong revision or altered manifest',async()=>{
 await rejectsWithoutWrite(fakeStore(base,{noFreeze:true}));
 await rejectsWithoutWrite(fakeStore(base,{corruptFreeze:true}));
 const changed={...base,contractManifestHash:'f'.repeat(64)};
 await rejectsWithoutWrite(fakeStore(changed));
});
