'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {digest,prepareOfferPackage}=require('../offer-contract-package');
const {PURPOSE,createContractReleaseGate}=require('../contract-dispatch-release-staging');
const {createGmailTestDraftBuilder}=require('../contract-gmail-draft-staging');
const {FROM,TO,JOB,createContractTestDispatcher}=require('../contract-test-dispatch-staging');
const SECRET=Buffer.from('TEST_ONLY_c373_offline_key_20261025_32_bytes');
const CLOCK=Date.parse('2026-10-25T18:30:00.000Z');

class FakeDb{
  constructor(){this.docs=new Map();this.queue=Promise.resolve();this.failUpdate=false;}
  snapshot(id){const value=this.docs.get(id);return {exists:value!==undefined,data:()=>structuredClone(value)};}
  collection(){return {doc:id=>({id,get:async()=>this.snapshot(id)})};}
  async runTransaction(fn){
    let release;const next=new Promise(r=>{release=r});
    const prior=this.queue;this.queue=next;await prior;
    const changes=[];
    try{
      const result=await fn({get:async ref=>this.snapshot(ref.id),
        create:(ref,value)=>{
          if(this.docs.has(ref.id))throw Error('duplicate');
          changes.push([ref.id,structuredClone(value)]);
        },
        update:(ref,value)=>{
          if(this.failUpdate)throw Error('offline transaction failure');
          changes.push([ref.id,{...this.docs.get(ref.id),...structuredClone(value)}]);
        }});
      for(const [id,value] of changes)this.docs.set(id,value);
      return result;
    }finally{release();}
  }
}

function fixture(avv='no',options={}){
  const db=options.db||new FakeDb(),store=new Map();
  const docs=(avv==='yes'?['offer','terms','avv']:['offer','terms']).map(kind=>{
    const bytes=Buffer.from('%PDF-1.4\nTEST_ONLY '+kind+'\n%%EOF');
    const archiveFileId='test_c373_archive_'+kind;store.set(archiveFileId,bytes);
    return {kind,version:'TEST_ONLY_v1',filename:'TEST_ONLY_'+kind+'.pdf',
      archiveFileId,sha256:digest(bytes),bytes:bytes.length};
  });
  const pkg=prepareOfferPackage({offerId:'test_c373_quote_1',offerNumber:'1101',
    revision:options.revision||1,offerSnapshotSha256:digest(Buffer.from('TEST_ONLY snapshot')),
    avvRequired:avv,avvAnnexesConfirmed:avv==='yes',documents:docs});
  const now=()=>CLOCK;
  const readArchivedPdf=async id=>store.get(id);
  const gate=createContractReleaseGate({signingSecret:SECRET,allowedOperators:['lars@lszh-automations.ch'],
    allowedRecipients:[TO],authorizeOperator:async()=>true,readArchivedPdf,now});
  const builder=createGmailTestDraftBuilder({signingSecret:SECRET,allowedRecipients:[TO],readArchivedPdf,now});
  const runtime={CLOUD_RUN_JOB:JOB,GOOGLE_CLOUD_PROJECT:'lszh-automations',
    CLOUD_RUN_TASK_COUNT:'1',CLOUD_RUN_TASK_INDEX:'0',CLOUD_RUN_TASK_ATTEMPT:'0',
    LSZH_CONTRACT_TEST_SEND_ENABLED:'true',LSZH_C37_ALLOW_CUSTOMER_MAIL:'false'};
  const approval={purpose:PURPOSE,recipient:TO,operatorEmail:'lars@lszh-automations.ch',
    approvalId:'approval_c373_offline',approvedAt:new Date(CLOCK).toISOString()};
  let calls=0,evidenceCalls=0,sent;
  const sendOnce=async payload=>{
    calls++;sent=structuredClone(payload);
    assert.equal((await dispatcher.inspect(payload.eventId)).status,'delivery_review');
    if(options.transportError)throw Error('simulated lost response');
    return {ok:true,eventId:payload.eventId,packageSha256:payload.packageSha256,
      to:TO,attachmentCount:payload.attachments.length,provider:'gmail',messageId:'fake_message_1234'};
  };
  const verifySentEvidence=async({expected,approvedSender})=>{
    evidenceCalls++;
    // Simulated independent provider read; no real mailbox is accessed.
    assert.equal(approvedSender,FROM);
    assert.equal(expected.recipient,TO);
    assert.equal(expected.documentHashes.length,sent.attachments.length);
    for(let i=0;i<sent.attachments.length;i++){
      assert.equal(digest(Buffer.from(sent.attachments[i].dataBase64,'base64')),expected.documentHashes[i].sha256);
    }
    if(options.failConfirmation)db.failUpdate=true;
    return options.evidence!==false;
  };
  const config={runtime,db,signingSecret:SECRET,releaseGate:gate,draftBuilder:builder,sendOnce,verifySentEvidence,now};
  const dispatcher=createContractTestDispatcher(config);
  return {db,store,pkg,approval,config,dispatcher,calls:()=>calls,evidenceCalls:()=>evidenceCalls,sent:()=>sent};
}

for(const avv of ['no','yes'])test('offline '+avv+'-AVV: fixed routing, lock before one send, evidence before confirmation',async()=>{
  const f=fixture(avv),r=await f.dispatcher.dispatch(f.pkg,f.approval);
  assert.equal(r.state,'confirmed_test_only');assert.equal(f.calls(),1);assert.equal(f.evidenceCalls(),1);
  assert.equal(f.sent().from,FROM);assert.deepEqual(f.sent().to,[TO]);
  assert.deepEqual(f.sent().cc,[]);assert.deepEqual(f.sent().bcc,[]);
  assert.equal(f.sent().attachments.length,avv==='yes'?3:2);
  for(const record of f.db.docs.values())assert.doesNotMatch(JSON.stringify(record),/dataBase64|%PDF|<p>/);
});

test('parallel calls and changed revisions cannot send twice',async()=>{
  const f=fixture();
  const results=await Promise.allSettled([f.dispatcher.dispatch(f.pkg,f.approval),f.dispatcher.dispatch(f.pkg,f.approval)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.calls(),1);
  const next=fixture('no',{db:f.db,revision:2});
  await assert.rejects(next.dispatcher.dispatch(next.pkg,next.approval),/locked|reserved/);
  assert.equal(next.calls(),0);
});

test('lost response leaves permanent review state and never retries',async()=>{
  const f=fixture('no',{transportError:true});
  const r=await f.dispatcher.dispatch(f.pkg,f.approval);
  assert.equal(r.state,'delivery_review');assert.equal(r.mayAutoRetry,false);
  assert.equal(f.evidenceCalls(),0);
  await assert.rejects(f.dispatcher.dispatch(f.pkg,f.approval));assert.equal(f.calls(),1);
});

test('unproven SENT evidence cannot confirm delivery',async()=>{
  const f=fixture('yes',{evidence:false});
  assert.equal((await f.dispatcher.dispatch(f.pkg,f.approval)).state,'delivery_review');
  assert.equal((await f.dispatcher.inspect('contract_send_'+f.pkg.packageId)).status,'delivery_review');
});

test('confirmation storage failure does not resend',async()=>{
  const f=fixture('no',{failConfirmation:true});
  assert.equal((await f.dispatcher.dispatch(f.pkg,f.approval)).state,'delivery_review');
  await assert.rejects(f.dispatcher.dispatch(f.pkg,f.approval));assert.equal(f.calls(),1);
});

test('failed durable pre-send update blocks transport',async()=>{
  const f=fixture();f.db.failUpdate=true;
  await assert.rejects(f.dispatcher.dispatch(f.pkg,f.approval));assert.equal(f.calls(),0);
});

test('wrong recipient, expired approval and damaged PDF stop before reservation',async()=>{
  for(const mutation of [{recipient:'other@example.com'},{approvedAt:'2026-10-25T17:00:00.000Z'}]){
    const f=fixture();await assert.rejects(f.dispatcher.dispatch(f.pkg,{...f.approval,...mutation}));
    assert.equal(f.calls(),0);assert.equal(f.db.docs.size,0);
  }
  const f=fixture('yes');f.store.set(f.pkg.documents[2].archiveFileId,Buffer.from('%PDF-corrupt'));
  await assert.rejects(f.dispatcher.dispatch(f.pkg,f.approval));assert.equal(f.db.docs.size,0);
});

test('web service, retries, missing opt-in and customer mode cannot construct sender',()=>{
  const f=fixture();
  for(const change of [{K_SERVICE:'live'},{CLOUD_RUN_TASK_ATTEMPT:'1'},
    {LSZH_CONTRACT_TEST_SEND_ENABLED:'false'},{LSZH_C37_ALLOW_CUSTOMER_MAIL:'true'},
    {CLOUD_RUN_JOB:'lszh-crm-v2'}]){
    assert.throws(()=>createContractTestDispatcher({...f.config,runtime:{...f.config.runtime,...change}}));
  }
});
