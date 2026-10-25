'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {makePdf}=require('../offer-pdf');
const {digest,prepareOfferPackage}=require('../offer-contract-package');
const {PURPOSE,createContractReleaseGate}=require('../contract-dispatch-release-staging');
const {createContractDispatchLedger}=require('../contract-dispatch-ledger-staging');
const {createGmailTestDraftBuilder}=require('../contract-gmail-draft-staging');
const {createContractC33SecurityPreflight}=require('../contract-dispatch-preflight-staging');
const CLOCK=Date.parse('2026-10-25T12:00:00.000Z');
const SECRET=Buffer.from('TEST_ONLY_c33_preflight_secret_32_bytes_minimum_20261025');
const OP='operator-approved@example.com',TO='test-approved@example.com';

class FakeDb{
  constructor(){this.docs=new Map();this.queue=Promise.resolve();}
  collection(){return {doc:key=>({id:key,get:async()=>this.snapshot(key)})};}
  snapshot(key){const v=this.docs.get(key);return {exists:v!==undefined,data:()=>structuredClone(v)};}
  async runTransaction(job){
    let release;const next=new Promise(resolve=>{release=resolve});
    const prev=this.queue;this.queue=next;await prev;
    const writes=[];
    const tx={get:async ref=>this.snapshot(ref.id),
      create:(ref,value)=>writes.push([ref.id,value])};
    try{
      const result=await job(tx);
      for(const [key] of writes)if(this.docs.has(key))throw Error('duplicate create');
      for(const [key,value] of writes)this.docs.set(key,structuredClone(value));
      return result;
    }finally{release()}
  }
}
function fixture(avv='no',offerId='test_quote_1000',revision=1){
  const db=new FakeDb(),store=new Map();
  const kinds=avv==='yes'?['offer','terms','avv']:['offer','terms'];
  const docs=kinds.map(kind=>{
    const bytes=makePdf({number:'1000',title:'TEST_ONLY '+kind,
      validUntil:'2026-12-31',items:[{
        title:'TEST_ONLY '+kind,qty:1,unitPriceCHF:10,mode:'einmalig'
      }]},{
      name:'Test Muster',company:'TEST_ONLY',email:'preview@example.invalid',
      street:'Musterweg 12',postalCode:'5610',city:'Wohlen',country:'Schweiz'
    });
    const key='test_archive_'+kind+'_20261025';store.set(key,bytes);
    return {kind,version:'RC1_TEST_ONLY',archiveFileId:key,
      filename:'TEST_ONLY_'+kind+'.pdf',sha256:digest(bytes),bytes:bytes.length};
  });
  const pkg=prepareOfferPackage({offerId,offerNumber:'1000',revision,
    offerSnapshotSha256:digest(Buffer.from('TEST_ONLY offer snapshot')),
    avvRequired:avv,avvAnnexesConfirmed:avv==='yes',documents:docs});
  const readArchivedPdf=async id=>store.get(id);
  const gate=createContractReleaseGate({signingSecret:SECRET,allowedOperators:[OP],
    allowedRecipients:[TO],authorizeOperator:async()=>true,readArchivedPdf,
    now:()=>CLOCK});
  const draftBuilder=createGmailTestDraftBuilder({signingSecret:SECRET,
    allowedRecipients:[TO],readArchivedPdf,now:()=>CLOCK});
  const ledger=createContractDispatchLedger(db,{signingSecret:SECRET,
    verifyGatewayReceipt:async()=>false,verifyManualReview:async()=>false,
    now:()=>CLOCK});
  const preflight=createContractC33SecurityPreflight({
    releaseGate:gate,draftBuilder,ledger,signingSecret:SECRET,
    allowedRecipients:[TO],now:()=>CLOCK
  });
  const approval={purpose:PURPOSE,recipient:TO,operatorEmail:OP,
    approvalId:'approval_test_20261025',
    approvedAt:new Date(CLOCK).toISOString()};
  return {db,store,pkg,gate,draftBuilder,ledger,preflight,approval};
}
test('C3.3 two-PDF mandatory checks reserve once and never send',async()=>{
  const f=fixture(),r=await f.preflight.reserveForReview(f.pkg,f.approval);
  assert.equal(r.state,'reserved');
  assert.equal(r.attachmentCount,2);
  assert.equal(r.sendPermitted,false);
  assert.equal(r.transmitted,false);
  assert.equal(r.provider,'NONE');
  assert.equal(r.messageId,null);
  assert.equal(f.db.docs.size,2);
  assert.equal((await f.preflight.inspectOnly(r.eventId)).status,'reserved');
  assert.doesNotMatch(JSON.stringify(r),/contentBase64|dataBase64|JVBERi0|html/);
  for(const d of f.db.docs.values())
    assert.doesNotMatch(JSON.stringify(d),/contentBase64|dataBase64|JVBERi0|html/);
});
test('C3.3 AVV=yes requires three distinct PDFs before reserving',async()=>{
  const f=fixture('yes'),r=await f.preflight.reserveForReview(f.pkg,f.approval);
  assert.equal(r.attachmentCount,3);
  assert.equal(f.db.docs.size,2);
});
test('C3.3 AVV review and missing annex confirmation stop before Firestore',async()=>{
  assert.throws(()=>prepareOfferPackage({
    offerId:'test_quote_1',offerNumber:'1000',revision:1,
    offerSnapshotSha256:'0'.repeat(64),avvRequired:'review',
    avvAnnexesConfirmed:false,documents:[]
  }),/AVV-Einstufung/);
  const f=fixture('yes');
  await assert.rejects(f.preflight.reserveForReview(
    {...f.pkg,avvAnnexesConfirmed:false},f.approval));
  assert.equal(f.db.docs.size,0);
});
test('C3.3 unauthorized recipient and stale or spoofed approval never reserve',async()=>{
  const f=fixture();
  for(const mutation of [
    {recipient:'customer@example.ch'},
    {operatorEmail:'intruder@example.ch'},
    {approvedAt:'2026-10-25T11:00:00.000Z'},
    {purpose:'production'},
    {approvalId:'x'}
  ]){
    await assert.rejects(f.preflight.reserveForReview(
      f.pkg,{...f.approval,...mutation}));
  }
  assert.equal(f.db.docs.size,0);
});
test('C3.3 corrupted PDF bytes fail before reserving a single attempt',async()=>{
  const f=fixture('yes'),doc=f.pkg.documents[1];
  const old=f.store.get(doc.archiveFileId);
  const changed=Buffer.from(old);changed[changed.length-1]^=1;
  f.store.set(doc.archiveFileId,changed);
  await assert.rejects(f.preflight.reserveForReview(f.pkg,f.approval),/SHA-256/);
  assert.equal(f.db.docs.size,0);
});
test('C3.3 parallel duplicate requests produce exactly one reservation, no retries',async()=>{
  const f=fixture();
  const results=await Promise.allSettled([
    f.preflight.reserveForReview(f.pkg,f.approval),
    f.preflight.reserveForReview(f.pkg,f.approval)
  ]);
  assert.deepEqual(results.map(r=>r.status).sort(),['fulfilled','rejected']);
  assert.equal(f.db.docs.size,2);
  await assert.rejects(f.preflight.reserveForReview(f.pkg,f.approval),
    /already reserved|offer locked/);
});
test('C3.3 permanent offer lock also refuses changed package revision',async()=>{
  const f=fixture();
  await f.preflight.reserveForReview(f.pkg,f.approval);
  const later=fixture('no','test_quote_1000',2);
  // Use the same backing database, to model independent worker/process.
  const ledger=createContractDispatchLedger(f.db,{signingSecret:SECRET,
    verifyGatewayReceipt:async()=>false,verifyManualReview:async()=>false,
    now:()=>CLOCK});
  const p=createContractC33SecurityPreflight({
    releaseGate:later.gate,draftBuilder:later.draftBuilder,ledger,
    signingSecret:SECRET,allowedRecipients:[TO],now:()=>CLOCK});
  await assert.rejects(p.reserveForReview(later.pkg,later.approval),
    /offer locked|already reserved/);
  assert.equal(f.db.docs.size,2);
});
test('C3.3 cannot return permission after contradictory ledger reservation',async()=>{
  const f=fixture();
  const spoof=createContractC33SecurityPreflight({
    releaseGate:f.gate,draftBuilder:f.draftBuilder,
    ledger:{reserve:async()=>({state:'sent'}),inspect:async()=>null},
    signingSecret:SECRET,allowedRecipients:[TO],now:()=>CLOCK
  });
  await assert.rejects(spoof.reserveForReview(f.pkg,f.approval),
    /inconsistent reservation/);
});
test('C3.3 rejects incomplete trusted configuration and unsafe recipient',()=>{
  const f=fixture();
  assert.throws(()=>createContractC33SecurityPreflight({
    releaseGate:f.gate,draftBuilder:f.draftBuilder,ledger:f.ledger,
    signingSecret:SECRET,allowedRecipients:['*@example.com'],
    now:()=>CLOCK
  }),/configuration incomplete/);
  assert.throws(()=>createContractC33SecurityPreflight({
    releaseGate:f.gate,draftBuilder:f.draftBuilder,ledger:f.ledger,
    signingSecret:SECRET,allowedRecipients:['preview@example.invalid'],
    now:()=>CLOCK
  }),/configuration incomplete/);
});
test('C3.3 no send API or import into productive routes',()=>{
  const dir=path.join(__dirname,'..');
  const src=fs.readFileSync(path.join(dir,'contract-dispatch-preflight-staging.js'),'utf8');
  for(const f of ['server.js','offer-send.js']){
    const prod=fs.readFileSync(path.join(dir,f),'utf8');
    assert.doesNotMatch(prod,/contract-dispatch-preflight-staging/);
  }
  assert.doesNotMatch(src,/\bfetch\s*\(|https?\.request|gmail\.send|googleapis|hook\.eu1\.make\.com/);
  assert.doesNotMatch(src,/require\s*\(\s*['"](?:node:http|node:https)/);
  assert.match(src,/sendPermitted:false/);
});
