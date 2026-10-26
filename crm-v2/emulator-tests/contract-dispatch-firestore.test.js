'use strict';
// TRUE Firestore transaction tests. Run ONLY through Firebase/Firestore emulator.
// Not included in "npm test"; no fallback to production Firestore is permitted.
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Firestore}=require('@google-cloud/firestore');
const {digest,prepareOfferPackage}=require('../offer-contract-package');
const {COLLECTION,PURPOSE,createContractReleaseGate}=require('../contract-dispatch-release-staging');
const {createContractDispatchLedger}=require('../contract-dispatch-ledger-staging');
const {createGmailSentEvidenceVerifier}=require('../contract-gmail-evidence-staging');
const {createGmailTestDraftBuilder}=require('../contract-gmail-draft-staging');
const {createContractC33SecurityPreflight}=require('../contract-dispatch-preflight-staging');
const {createC34DemoGmailReadbackLedger}=require('../contract-gmail-c34-readback-staging');
const {ROOT,createC35DemoGmailReadback}=require('../contract-gmail-c35-readonly-api-staging');

const HOST='127.0.0.1:8788';
const PROJECT='demo-lszha-c2-20261025';
const SECRET=Buffer.from('TEST_ONLY_EMULATOR_signing_key_very_long_not_a_real_secret_20261025');
const TEST_RECIPIENT='firestore-test@example.com';
const OPERATOR='operator-test@example.com';
if(process.env.FIRESTORE_EMULATOR_HOST!==HOST) {
  throw Error('REFUSED: Firestore emulator must run at '+HOST+'; no production fallback.');
}
if(process.env.GCLOUD_PROJECT&&process.env.GCLOUD_PROJECT!==PROJECT) {
  throw Error('REFUSED: GCLOUD_PROJECT is not the isolated demo project.');
}
if(process.env.GOOGLE_CLOUD_PROJECT&&process.env.GOOGLE_CLOUD_PROJECT!==PROJECT) {
  throw Error('REFUSED: GOOGLE_CLOUD_PROJECT is not the isolated demo project.');
}
if(process.env.FIREBASE_PROJECT_ID&&process.env.FIREBASE_PROJECT_ID!==PROJECT) {
  throw Error('REFUSED: FIREBASE_PROJECT_ID is not the isolated demo project.');
}
const databases=[];
function database(){
  const db=new Firestore({projectId:PROJECT});
  databases.push(db);
  return db;
}
after(async()=>{await Promise.allSettled(databases.map(db=>db.terminate()));});
function fixture({offerId='TEST_ONLY_'+randomUUID().replace(/-/g,''),revision=1,avv='no'}={}){
  const binary={};
  const kinds=avv==='yes'?['offer','terms','avv']:['offer','terms'];
  const documents=kinds.map(kind=>{
    const bytes=Buffer.from('%PDF-1.4\nTEST_ONLY '+kind+'\n'+'#'.repeat(80));
    const archiveFileId='test_archived_'+kind+'_20261025';
    binary[archiveFileId]=bytes;
    return {
      kind,version:'RC1_TEST_ONLY',archiveFileId,
      sha256:digest(bytes),filename:'TEST_ONLY_'+kind+'.pdf',bytes:bytes.length
    };
  });
  const pkg=prepareOfferPackage({
    offerId,offerNumber:'9099901',revision,
    offerSnapshotSha256:digest(Buffer.from('TEST_ONLY snapshot '+offerId)),
    avvRequired:avv,avvAnnexesConfirmed:avv==='yes',documents
  });
  const now=Date.now();
  const gate=createContractReleaseGate({
    signingSecret:SECRET,now:()=>now,
    allowedOperators:[OPERATOR],allowedRecipients:[TEST_RECIPIENT],
    authorizeOperator:async()=>true,
    readArchivedPdf:async archiveFileId=>binary[archiveFileId]
  });
  return {
    pkg,now,binary,manifest:gate.approve(pkg,{
      purpose:PURPOSE,recipient:TEST_RECIPIENT,operatorEmail:OPERATOR,
      approvalId:'approval_emulator_'+randomUUID().replace(/-/g,''),
      approvedAt:new Date(now).toISOString()
    })
  };
}
function ledger(db,opts={}){
  return createContractDispatchLedger(db,{
    signingSecret:SECRET,verifyGatewayReceipt:async()=>true,
    verifyManualReview:async()=>true,...opts
  });
}
function providerReceipt(manifest,changes={}){
  return {
    ok:true,eventId:manifest.eventId,packageSha256:manifest.packageSha256,
    to:manifest.recipient,attachmentCount:manifest.documents.length,
    provider:'gmail',messageId:'emulator_fake_gmail_message_01',
    ...changes
  };
}
async function recordsForOffer(db,offerId){
  const all=await db.collection(COLLECTION).get();
  return all.docs.map(x=>({id:x.id,...x.data()})).filter(x=>x.offerId===offerId);
}
test('emulator C2: signed 2-PDF reservation atomically creates exactly one attempt and one lock',async()=>{
  const f=fixture(),manifest=await f.manifest,db=database(),l=ledger(db);
  const r=await l.reserve(manifest);
  assert.equal(r.state,'reserved');
  assert.equal(r.documentCount,2);
  const rows=await recordsForOffer(db,manifest.offerId);
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(x=>x.kind).sort(),[
    'TEST_ONLY_CONTRACT_DISPATCH_LEDGER','TEST_ONLY_CONTRACT_OFFER_LOCK'
  ].sort());
  for(const row of rows){
    const dumped=JSON.stringify(row);
    assert.doesNotMatch(dumped,/contentBase64|JVBER|webhookUrl|secret|mailHtml/);
    assert.equal(row.eventId,manifest.eventId);
  }
});
test('emulator C2: two independent Firestore clients compete for same event; only one wins',async()=>{
  const f=fixture(),m=await f.manifest,db1=database(),db2=database();
  const [a,b]=await Promise.allSettled([
    ledger(db1).reserve(m),ledger(db2).reserve(m)
  ]);
  assert.deepEqual([a.status,b.status].sort(),['fulfilled','rejected']);
  assert.equal((await recordsForOffer(db1,m.offerId)).length,2);
  await assert.rejects(ledger(db2).reserve(m));
});
test('emulator C2: changing package revision cannot bypass durable per-offer lock',async()=>{
  const offerId='TEST_ONLY_'+randomUUID().replace(/-/g,'');
  const first=fixture({offerId,revision:1});
  const second=fixture({offerId,revision:2});
  const m1=await first.manifest,m2=await second.manifest;
  const db=database(),l=ledger(db);
  await l.reserve(m1);
  await assert.rejects(l.reserve(m2),/offer locked/);
  assert.equal((await recordsForOffer(db,offerId)).length,2);
});
test('emulator C2: crash and new Firestore client retain unresolved lock, never retry automatically',async()=>{
  const f=fixture({avv:'yes'}),m=await f.manifest;
  const before=database();await ledger(before).reserve(m);
  await before.terminate(); // represents a stopped worker with unfinished send
  const afterRestart=database(),l=ledger(afterRestart);
  assert.equal((await l.inspect(m.eventId)).status,'reserved');
  await assert.rejects(l.reserve(m),/already reserved/);
  assert.equal((await l.markDeliveryUncertain(m.eventId)).state,'delivery_review');
  await assert.rejects(l.markDeliveryUncertain(m.eventId),/already reviewed/);
  assert.equal((await l.inspect(m.eventId)).status,'delivery_review');
  assert.equal((await recordsForOffer(afterRestart,m.offerId)).length,2);
});
test('emulator C2: forged receipts and failed verifier cannot confirm, valid test proof is single-use',async()=>{
  const f=fixture({avv:'yes'}),m=await f.manifest,db=database();
  const l=ledger(db,{verifyGatewayReceipt:async()=>false});
  await l.reserve(m);
  for(const item of [
    providerReceipt(m,{packageSha256:'f'.repeat(64)}),
    providerReceipt(m,{to:'real-customer@example.ch'}),
    providerReceipt(m,{attachmentCount:2}),
    providerReceipt(m,{messageId:'bad\nmailid'})
  ])await assert.rejects(l.confirmVerifiedReceipt(m.eventId,item));
  await assert.rejects(l.confirmVerifiedReceipt(m.eventId,providerReceipt(m)),/not independently verified/);
  assert.equal((await l.inspect(m.eventId)).status,'reserved');
  const verifier=ledger(db,{verifyGatewayReceipt:async({receipt,expected})=>
    receipt.eventId===expected.eventId&&receipt.to===expected.recipient&&
    expected.documentHashes.length===3});
  await verifier.confirmVerifiedReceipt(m.eventId,providerReceipt(m));
  assert.equal((await verifier.inspect(m.eventId)).status,'confirmed_test_only');
  await assert.rejects(verifier.confirmVerifiedReceipt(m.eventId,providerReceipt(m)),/finalised/);
  await assert.rejects(verifier.reserve(m),/already reserved/);
});
test('emulator C2: mailbox review can close uncertain result but cannot clear permanent offer lock',async()=>{
  const f=fixture(),m=await f.manifest,db=database();
  const denied=ledger(db,{verifyManualReview:async()=>false});
  await denied.reserve(m);
  await denied.markDeliveryUncertain(m.eventId);
  await assert.rejects(denied.closeVerifiedNotSent(m.eventId,{
    reviewId:'review_emulator_12345678',reviewedBy:OPERATOR
  }),/unverified/);
  const allowed=ledger(db,{verifyManualReview:async()=>true});
  const closed=await allowed.closeVerifiedNotSent(m.eventId,{
    reviewId:'review_emulator_12345678',reviewedBy:OPERATOR
  });
  assert.equal(closed.mayAutoRetry,false);
  assert.equal((await allowed.inspect(m.eventId)).status,'not_sent_closed');
  await assert.rejects(allowed.reserve(m),/already reserved/);
  assert.equal((await recordsForOffer(db,m.offerId)).length,2);
});


test('emulator C3: ledger confirmation requires independent read-only Gmail SENT and exact 3 PDFs',async()=>{
  const f=fixture({avv:'yes'}),m=await f.manifest,db=database();
  const message={
    id:'emulator_fake_gmail_message_01',labelIds:['SENT'],
    from:'test-sender@lszh-automations.ch',to:[m.recipient],cc:[],bcc:[],
    subject:'[TEST_ONLY] LSZH Vertragspaket 9099901',
    headers:{'x-lszh-contract-event':m.eventId,
      'x-lszh-package-sha256':m.packageSha256},
    attachments:m.documents.map(d=>({
      filename:d.filename,mimeType:'application/pdf',data:f.binary[d.archiveFileId]
    }))
  };
  // Read-back is a mocked trusted adapter; NO Gmail account is accessed.
  const provider=createGmailSentEvidenceVerifier({
    allowedSenders:['test-sender@lszh-automations.ch'],
    readSentMessage:async()=>message
  });
  const l=ledger(db,{verifyGatewayReceipt:provider.verify});
  await l.reserve(m);
  await l.markDeliveryUncertain(m.eventId);
  const receipt=providerReceipt(m);
  message.attachments[2].data=Buffer.from('%PDF-1.4\nBAD DATA');
  await assert.rejects(l.confirmVerifiedReceipt(m.eventId,receipt),
    /not independently verified/);
  assert.equal((await l.inspect(m.eventId)).status,'delivery_review');
  message.attachments[2].data=f.binary[m.documents[2].archiveFileId];
  const outcome=await l.confirmVerifiedReceipt(m.eventId,receipt);
  assert.equal(outcome.state,'confirmed_test_only');
  await assert.rejects(l.confirmVerifiedReceipt(m.eventId,receipt),/finalised/);
  await assert.rejects(l.reserve(m),/already reserved/);
});


function c33Preflight(db,f){
  const readArchivedPdf=async id=>f.binary[id];
  const releaseGate=createContractReleaseGate({
    signingSecret:SECRET,now:()=>f.now,
    allowedOperators:[OPERATOR],allowedRecipients:[TEST_RECIPIENT],
    authorizeOperator:async ({operatorEmail,recipient})=>
      operatorEmail===OPERATOR&&recipient===TEST_RECIPIENT,
    readArchivedPdf
  });
  const draftBuilder=createGmailTestDraftBuilder({
    signingSecret:SECRET,now:()=>f.now,
    allowedRecipients:[TEST_RECIPIENT],readArchivedPdf
  });
  const preflight=createContractC33SecurityPreflight({
    releaseGate,draftBuilder,ledger:ledger(db,{now:()=>f.now}),
    signingSecret:SECRET,allowedRecipients:[TEST_RECIPIENT],
    now:()=>f.now
  });
  const approval={
    purpose:PURPOSE,recipient:TEST_RECIPIENT,operatorEmail:OPERATOR,
    approvalId:'approval_c33_'+randomUUID().replace(/-/g,''),
    approvedAt:new Date(f.now).toISOString()
  };
  return {preflight,approval};
}
test('emulator C3.3: full 3-PDF preflight rejects damaged AVV before atomic reservation, then locks safely',async()=>{
  const f=fixture({avv:'yes'}),db=database();
  // The shared fixture starts an async manifest approval immediately. Settle it
  // BEFORE mutating archive bytes, or that unrelated Promise can reject outside
  // assert.rejects() and create a false negative / unhandled rejection.
  await f.manifest;
  const {preflight,approval}=c33Preflight(db,f);
  const key=f.pkg.documents[2].archiveFileId;
  const original=f.binary[key];
  const damaged=Buffer.from(original);damaged[damaged.length-1]^=1;
  f.binary[key]=damaged;
  await assert.rejects(preflight.reserveForReview(f.pkg,approval),/SHA-256/);
  assert.equal((await recordsForOffer(db,f.pkg.offerId)).length,0);
  f.binary[key]=original;
  const result=await preflight.reserveForReview(f.pkg,approval);
  assert.equal(result.state,'reserved');
  assert.equal(result.sendPermitted,false);
  assert.equal(result.transmitted,false);
  assert.equal(result.provider,'NONE');
  assert.equal(result.messageId,null);
  assert.equal(result.attachmentCount,3);
  assert.equal((await preflight.inspectOnly(result.eventId)).status,'reserved');
  const rows=await recordsForOffer(db,f.pkg.offerId);
  assert.equal(rows.length,2);
  for(const row of rows)
    assert.doesNotMatch(JSON.stringify(row),/contentBase64|dataBase64|JVBERi0|mailHtml/);
});
test('emulator C3.3: two independent full-preflight workers reserve only once and block new revision',async()=>{
  const f=fixture(),db1=database(),db2=database();
  await f.manifest; // Never leave the fixture's background approval unsettled.
  const a=c33Preflight(db1,f),b=c33Preflight(db2,f);
  const results=await Promise.allSettled([
    a.preflight.reserveForReview(f.pkg,a.approval),
    b.preflight.reserveForReview(f.pkg,b.approval)
  ]);
  assert.deepEqual(results.map(x=>x.status).sort(),['fulfilled','rejected']);
  assert.equal((await recordsForOffer(db1,f.pkg.offerId)).length,2);
  const revised=fixture({offerId:f.pkg.offerId,revision:2});
  await revised.manifest;
  const next=c33Preflight(db2,revised);
  await assert.rejects(next.preflight.reserveForReview(revised.pkg,next.approval),
    /offer locked/);
  assert.equal((await recordsForOffer(db1,f.pkg.offerId)).length,2);
});


function c34FakeSent(m,binary){
  const files=new Map(m.documents.map(d=>{
    const attachmentId='c34_test_attachment_'+d.kind;
    return [attachmentId,Buffer.from(binary[d.archiveFileId])];
  }));
  const message={
    id:'emulator_fake_gmail_message_01',labelIds:['SENT'],
    payload:{
      headers:[
        {name:'From',value:'LSZH Automations <test-sender@lszh-automations.ch>'},
        {name:'To',value:m.recipient},
        {name:'Subject',value:'[TEST_ONLY] LSZH C3.4 Emulator'},
        {name:'X-LSZH-Contract-Event',value:m.eventId},
        {name:'X-LSZH-Package-SHA256',value:m.packageSha256}
      ],
      parts:m.documents.map(d=>({
        filename:d.filename,mimeType:'application/pdf',
        body:{size:d.bytes,attachmentId:'c34_test_attachment_'+d.kind}
      }))
    }
  };
  let messages=0,attachments=0;
  const getMessage=async id=>{
    messages++;assert.equal(id,message.id);return message;
  };
  const getAttachment=async(id,attachmentId)=>{
    attachments++;assert.equal(id,message.id);
    const bytes=files.get(attachmentId);
    return bytes?{data:bytes.toString('base64url'),size:bytes.length}:null;
  };
  return {message,files,getMessage,getAttachment,
    counts:()=>({messages,attachments})};
}
test('emulator C3.4: signed AVV preflight then read-only Gmail SENT reconciles 3 byte-perfect PDFs once',async()=>{
  const f=fixture({avv:'yes'}),m=await f.manifest,db=database();
  const operator=c33Preflight(db,f);
  const reserved=await operator.preflight.reserveForReview(f.pkg,operator.approval);
  assert.equal(reserved.state,'reserved');
  assert.equal(reserved.sendPermitted,false);
  const gmail=c34FakeSent(m,f.binary);
  const service=createC34DemoGmailReadbackLedger({
    db,signingSecret:SECRET,allowedRecipients:[TEST_RECIPIENT],
    allowedSenders:['test-sender@lszh-automations.ch'],
    getMessage:gmail.getMessage,getAttachment:gmail.getAttachment,now:()=>f.now
  });
  assert.equal(Object.hasOwn(service,'reserve'),false);
  assert.equal(Object.hasOwn(service,'send'),false);
  const original=gmail.files.get('c34_test_attachment_avv');
  const corrupted=Buffer.from(original);corrupted[corrupted.length-1]^=1;
  gmail.files.set('c34_test_attachment_avv',corrupted);
  await assert.rejects(service.reconcile(m.eventId,providerReceipt(m)),
    /not independently verified/);
  assert.equal((await service.inspect(m.eventId)).status,'reserved');
  gmail.files.set('c34_test_attachment_avv',original);
  const result=await service.reconcile(m.eventId,providerReceipt(m));
  assert.equal(result.state,'confirmed_test_only');
  assert.equal((await service.inspect(m.eventId)).status,'confirmed_test_only');
  assert.equal(gmail.counts().messages,2);
  assert.equal(gmail.counts().attachments,6);
  await assert.rejects(service.reconcile(m.eventId,providerReceipt(m)),
    /requires an unresolved/);
  assert.equal((await recordsForOffer(db,m.offerId)).length,2);
  await assert.rejects(operator.preflight.reserveForReview(f.pkg,operator.approval),
    /already reserved/);
});
test('emulator C3.4: missing SENT and spoofed recipient cannot confirm reserved 2-PDF attempt',async()=>{
  const f=fixture(),m=await f.manifest,db=database();
  const operator=c33Preflight(db,f);
  await operator.preflight.reserveForReview(f.pkg,operator.approval);
  const gmail=c34FakeSent(m,f.binary);
  const service=createC34DemoGmailReadbackLedger({
    db,signingSecret:SECRET,allowedRecipients:[TEST_RECIPIENT],
    allowedSenders:['test-sender@lszh-automations.ch'],
    getMessage:gmail.getMessage,getAttachment:gmail.getAttachment,now:()=>f.now
  });
  gmail.message.labelIds=['INBOX'];
  await assert.rejects(service.reconcile(m.eventId,providerReceipt(m)),
    /not independently verified/);
  gmail.message.labelIds=['SENT'];
  const to=gmail.message.payload.headers.find(x=>x.name==='To');
  to.value='unapproved@example.com';
  await assert.rejects(service.reconcile(m.eventId,providerReceipt(m)),
    /not independently verified/);
  assert.equal((await service.inspect(m.eventId)).status,'reserved');
  assert.equal((await recordsForOffer(db,m.offerId)).length,2);
  await assert.rejects(service.reconcile(m.eventId,providerReceipt(m,{
    to:'unapproved@example.com'})),/does not match sealed package/);
});

test('emulator C3.5: exact OAuth mailbox identity gates read-only SENT evidence and single Firestore confirmation',async()=>{
  const f=fixture({avv:'yes'}),m=await f.manifest,db=database();
  const operator=c33Preflight(db,f);
  const reserved=await operator.preflight.reserveForReview(f.pkg,operator.approval);
  assert.equal(reserved.sendPermitted,false);
  const gmail=c34FakeSent(m,f.binary);
  const mailbox='test-sender@lszh-automations.ch';
  let oauthIdentity='unauthorised-personal@example.com';
  const requests=[];
  const authClient={request:async request=>{
    requests.push(request);
    assert.equal(request.method,'GET');
    if(request.url===ROOT+'/profile')
      return {data:{emailAddress:oauthIdentity}};
    if(request.url===ROOT+'/messages/'+gmail.message.id+'?format=full')
      return {data:gmail.message};
    const prefix=ROOT+'/messages/'+gmail.message.id+'/attachments/';
    if(request.url.startsWith(prefix)){
      const response=await gmail.getAttachment(gmail.message.id,
        request.url.slice(prefix.length));
      return {data:response};
    }
    throw Error('unexpected Gmail API endpoint');
  }};
  const service=createC35DemoGmailReadback({
    db,signingSecret:SECRET,authClient,expectedMailbox:mailbox,
    approvedSenders:[mailbox],allowedRecipients:[TEST_RECIPIENT],now:()=>f.now
  });
  assert.deepEqual(Object.keys(service).sort(),[
    'inspect','reconcile','verifyMailbox'
  ]);
  await assert.rejects(service.reconcile(m.eventId,providerReceipt(m)),
    /not independently verified/);
  assert.equal((await service.inspect(m.eventId)).status,'reserved');
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,ROOT+'/profile');
  oauthIdentity=mailbox;
  const result=await service.reconcile(m.eventId,providerReceipt(m));
  assert.equal(result.state,'confirmed_test_only');
  assert.equal((await service.inspect(m.eventId)).status,'confirmed_test_only');
  assert.equal(gmail.counts().attachments,3);
  await assert.rejects(service.reconcile(m.eventId,providerReceipt(m)),
    /requires an unresolved/);
  assert.equal((await recordsForOffer(db,m.offerId)).length,2);
  assert.ok(requests.every(r=>r.method==='GET'));
});
