'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {bindingFingerprint,LOCK_COLLECTION}=require('../syntheticAirtableBinding');
const {prepareSyntheticContractManifest,freezeSyntheticContractOnce,
 SyntheticContractFreezeRejected,COLLECTION}=require('../syntheticContractFreeze');
const id='LSZH-EMULATOR-20261015FROZEN',recordId='recTEST0000000000';
const pdf=k=>Buffer.from('%PDF-1.7\nSYNTHETIC '+k+'\n%%EOF');
const archiveBytes={offer:pdf('QUOTE'),terms:pdf('TERMS'),avv:pdf('AVV')};
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const revisions={offer:'revSyntheticQuoteA1',terms:'revSyntheticTermsA1',avv:'revSyntheticAvvA01'};
const docs=Object.fromEntries(Object.entries(archiveBytes).map(([k,v])=>[k,{
 mimeType:'application/pdf',archiveVerified:true,
 sha256:hash(v),driveFileId:'Z'.repeat(24)}]));
const now=new Date('2026-10-15T12:00:00Z');
const mode='offline-or-emulator-only';
function draft(extra={}){
 const s={schemaVersion:1,testOnly:true,fixtureId:id,airtableRecordId:recordId,
   offerNumber:'DEMO-OFF-20991231-999',recipientEmail:'fake-tester@example.invalid',
   validUntil:'2099-12-31',termsVersion:'TEST_ONLY_TERMS',
   avvRequired:true,avvVersion:'TEST_ONLY_AVV',documents:docs,
   status:'TEST_DRAFT_NOT_SENT',tokenHash:null,acceptedAt:null,issuedAt:null,
   expiresAt:null,legallyApproved:false,acceptanceEnabled:false,
   deliveryEnabled:false,deliveryConfirmed:false,contractManifestHash:null,
   contractFrozenAt:null,...extra};
 s.airtableBinding={source:'SYNTHETIC_READ_ONLY',schemaVersion:1,
   boundAt:'2026-10-15T10:00:00.000Z',
   fingerprint:bindingFingerprint(s,recordId)};
 return s;
}
function memory(state=draft(),config={}){
 const store=new Map();
 store.set('stagingOfferFixtures/'+id,structuredClone(state));
 if(!config.missingLock)store.set(LOCK_COLLECTION+'/'+recordId,{
   fixtureId:id,recordId,syntheticOnly:true,
   fingerprint:state.airtableBinding?.fingerprint,
   boundAt:state.airtableBinding?.boundAt
 });
 let chain=Promise.resolve(),writes=0;
 const db={doc:path=>({path}),runTransaction:fn=>{
   const task=chain.then(async()=>{
    const pending=[];
    const tx={get:async ref=>({exists:store.has(ref.path),
      data:()=>structuredClone(store.get(ref.path))}),
     create:(ref,value)=>pending.push(['create',ref.path,structuredClone(value)]),
     update:(ref,value)=>pending.push(['update',ref.path,structuredClone(value)])};
    const res=await fn(tx);
    for(const [kind,path,value]of pending){
     if(kind==='create'){
       assert.equal(store.has(path),false);
       store.set(path,value);
     }else store.set(path,{...store.get(path),...value});
     writes++;
    }
    return res;
   });
   chain=task.catch(()=>{});return task;
 }};
 return {db,get:path=>store.get(path),writes:()=>writes};
}
const prepare=(s=draft(),extra={})=>prepareSyntheticContractManifest({
 state:s,archiveBytes,revisions,testMode:mode,...extra});
const freeze=(mem,prepared,extra={})=>freezeSyntheticContractOnce({
 db:mem.db,fixtureId:id,prepared,testMode:mode,now,...extra});
test('builds private-revision, immutable, canonical PDF manifest without token/email',()=>{
 const p=prepare();
 assert.match(p.manifestHash,/^[a-f0-9]{64}$/);
 assert.equal(p.manifest.avvRequired,true);
 assert.deepEqual(Object.keys(p.manifest.documents),['offer','terms','avv']);
 assert.equal(p.manifest.documents.avv.revisionId,revisions.avv);
 assert.equal(p.manifest.documents.offer.sizeBytes,archiveBytes.offer.length);
 assert.equal(p.manifest.recipientSha256,hash('fake-tester@example.invalid'));
 assert.equal(Object.isFrozen(p.manifest.documents.avv),true);
 assert.equal(JSON.stringify(p).includes('fake-tester@example.invalid'),false);
 assert.equal(JSON.stringify(p).includes('Bearer'),false);
 assert.deepEqual(prepare().manifestHash,p.manifestHash);
});
test('freeze is exactly one Firestore transaction and offers remain inactive',async()=>{
 const store=memory(),p=prepare();
 const result=await freeze(store,p);
 assert.equal(result.frozen,true);
 assert.equal(result.acceptanceEnabled,false);
 assert.equal(result.delivered,false);
 assert.equal(store.writes(),2);
 assert.equal(store.get('stagingOfferFixtures/'+id).contractManifestHash,p.manifestHash);
 assert.equal(store.get('stagingOfferFixtures/'+id).status,'TEST_DRAFT_NOT_SENT');
 assert.equal(store.get(COLLECTION+'/'+id).manifest.documents.terms.revisionId,revisions.terms);
 await assert.rejects(freeze(store,p),e=>e.reason==='already_frozen');
 assert.equal(store.writes(),2);
});
test('parallel freezes: one success, one refused without overriding the first',async()=>{
 const store=memory(),p=prepare();
 const results=await Promise.allSettled([freeze(store,p),freeze(store,p)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.find(x=>x.status==='rejected').reason.reason,'already_frozen');
 assert.equal(store.writes(),2);
});
test('changed PDF bytes, PDF ID or revision ID are rejected',()=>{
 const s=draft();
 for(const change of [
  {archiveBytes:{...archiveBytes,avv:pdf('MODIFIED')}},
  {archiveBytes:{...archiveBytes,terms:Buffer.from('INVALID')}},
  {revisions:{...revisions,avv:'bad'}},
  {revisions:{offer:revisions.offer,terms:revisions.terms}},
  {archiveBytes:{offer:archiveBytes.offer,terms:archiveBytes.terms}}
 ]) assert.throws(()=>prepare(s,change),SyntheticContractFreezeRejected);
});
test('manifest cannot freeze a modified quote or forged digest',async()=>{
 const s=draft(),p=prepare(s);
 const changed=draft({offerNumber:'DEMO-OFF-OTHER000000'});
 const mem=memory(changed);
 await assert.rejects(freeze(mem,p),e=>e.reason==='manifest_mismatch');
 const forged={manifest:p.manifest,manifestHash:'f'.repeat(64)};
 await assert.rejects(freeze(memory(s),forged),e=>e.reason==='invalid_manifest');
});
test('missing unique Airtable guard prevents freezing',async()=>{
 const mem=memory(draft(),{missingLock:true});
 await assert.rejects(freeze(mem,prepare()),e=>e.reason==='binding_mismatch');
 assert.equal(mem.writes(),0);
});
test('only synthetic, legally unapproved drafts may be frozen',()=>{
 for(const modified of [
  {testOnly:false},{status:'ISSUED'},{tokenHash:'f'.repeat(64)},
  {legallyApproved:true},{deliveryEnabled:true},
  {recipientEmail:'real@example.com'}
 ])assert.throws(()=>prepare(draft(modified)),SyntheticContractFreezeRejected);
});
test('rejects Cloud Run, real project identity and missing test intent',()=>{
 const s=draft();
 assert.throws(()=>prepare(s,{testMode:'production'}),SyntheticContractFreezeRejected);
 for(const variable of ['K_SERVICE','GOOGLE_CLOUD_PROJECT','GCLOUD_PROJECT']){
  const old=process.env[variable];process.env[variable]=
    variable==='K_SERVICE'?'lszh-offer-acceptance-staging':'lszh-automations';
  try{assert.throws(()=>prepare(s),SyntheticContractFreezeRejected);}
  finally{if(old===undefined)delete process.env[variable];else process.env[variable]=old;}
 }
});
test('optional AVV still forces precise two-document manifest',()=>{
 const s=draft({avvRequired:false,avvVersion:null,
   documents:{offer:docs.offer,terms:docs.terms}});
 const p=prepare(s,{archiveBytes:{offer:archiveBytes.offer,terms:archiveBytes.terms},
   revisions:{offer:revisions.offer,terms:revisions.terms}});
 assert.deepEqual(Object.keys(p.manifest.documents),['offer','terms']);
 assert.equal(p.manifest.avvVersion,null);
});
