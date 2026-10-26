'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {makePdf}=require('../offer-pdf');
const {digest,prepareOfferPackage}=require('../offer-contract-package');
const {PURPOSE,createContractReleaseGate}=require('../contract-dispatch-release-staging');
const {createGmailTestDraftBuilder,validateGmailTestDraft}=require('../contract-gmail-draft-staging');
const {createGmailSentEvidenceVerifier}=require('../contract-gmail-evidence-staging');
const CLOCK=Date.parse('2026-10-25T12:00:00.000Z');
const SECRET=Buffer.from('TEST_ONLY_C3_staging_signing_secret_for_unit_tests_123456789');
const OPERATOR='operator-test@example.com';
const RECIPIENT='test-approved@example.com';
const SENDER='sender-test@lszh-automations.ch';
function fixture(avv='no'){
  const sources=new Map();
  const kinds=avv==='yes'?['offer','terms','avv']:['offer','terms'];
  const documents=kinds.map(kind=>{
    const bytes=makePdf({
      number:'1100',title:'TEST_ONLY '+kind+' Nicht rechtsverbindlich',
      validUntil:'2026-12-31',items:[{title:'TEST_ONLY '+kind,
        qty:1,unitPriceCHF:20,mode:'einmalig'}]
    },{
      name:'Max Muster',company:'TEST_ONLY Muster GmbH',
      email:'preview@example.invalid',street:'Musterweg 12',
      postalCode:'5610',city:'Wohlen',country:'Schweiz'
    });
    const archiveFileId='test_archive_'+kind+'_20261025';
    sources.set(archiveFileId,bytes);
    return {kind,version:'RC1_TEST_ONLY',archiveFileId,
      filename:'TEST_ONLY_'+kind+'.pdf',sha256:digest(bytes),bytes:bytes.length};
  });
  const pkg=prepareOfferPackage({
    offerId:'test_quote_1100',offerNumber:'1100',revision:avv==='yes'?2:1,
    offerSnapshotSha256:digest(Buffer.from('TEST_ONLY quote snapshot for '+avv)),
    avvRequired:avv,avvAnnexesConfirmed:avv==='yes',documents
  });
  const readArchivedPdf=async key=>sources.get(key);
  const gate=createContractReleaseGate({
    signingSecret:SECRET,allowedOperators:[OPERATOR],allowedRecipients:[RECIPIENT],
    now:()=>CLOCK,authorizeOperator:async()=>true,readArchivedPdf
  });
  const builder=createGmailTestDraftBuilder({
    signingSecret:SECRET,allowedRecipients:[RECIPIENT],
    now:()=>CLOCK,readArchivedPdf
  });
  async function prepare(){
    const manifest=await gate.approve(pkg,{
      purpose:PURPOSE,recipient:RECIPIENT,operatorEmail:OPERATOR,
      approvalId:'approval_test_20261025',approvedAt:new Date(CLOCK).toISOString()
    });
    const draft=await builder.prepare(manifest);
    return {manifest,draft};
  }
  return {pkg,sources,readArchivedPdf,gate,builder,prepare};
}
function evidence(m,overrides={}){
  const att=m.documents.map(d=>({filename:d.filename,
    mimeType:'application/pdf',data:Buffer.from(d._actualData||'%PDF-1.4\n','utf8')}));
  return {
    id:'gmail_test_message_01',labelIds:['SENT'],from:SENDER,to:[RECIPIENT],cc:[],bcc:[],
    subject:'[TEST_ONLY] LSZH Vertragspaket 1100',
    headers:{'x-lszh-contract-event':m.eventId,
      'x-lszh-package-sha256':m.packageSha256},
    attachments:att,...overrides
  };
}
function receipt(manifest,mod={}){
  return {ok:true,eventId:manifest.eventId,
    packageSha256:manifest.packageSha256,to:RECIPIENT,
    attachmentCount:manifest.documents.length,provider:'gmail',
    messageId:'gmail_test_message_01',...mod};
}
function readbackFixture(f,manifest){
  return evidence(manifest,{
    attachments:manifest.documents.map(d=>({
      filename:d.filename,mimeType:'application/pdf',
      data:f.sources.get(d.archiveFileId)
    }))
  });
}
test('C3 TEST_ONLY Gmail draft has two actual verified PDF bytes and zero sends',async()=>{
  const f=fixture(),{manifest,draft}=await f.prepare();
  assert.equal(draft.attachmentCount,2);
  assert.equal(draft.sendMode,'prepare_only');
  assert.deepEqual(draft.emailHeaders,[
    {key:'X-LSZH-Contract-Event',value:manifest.eventId},
    {key:'X-LSZH-Package-SHA256',value:manifest.packageSha256}
  ]);
  assert.equal(draft.neverSend,true);
  assert.deepEqual(draft.to,[RECIPIENT]);
  assert.deepEqual(draft.attachments.map(a=>a.kind),['offer','terms']);
  assert.equal(validateGmailTestDraft(draft,manifest).attachmentCount,2);
  for(const a of draft.attachments){
    const original=f.sources.get(manifest.documents.find(d=>d.kind===a.kind).archiveFileId);
    assert.deepEqual(Buffer.from(a.dataBase64,'base64'),original);
  }
});
test('C3 three-document AVV Gmail draft preserves order and distinct SHA-256 values',async()=>{
  const f=fixture('yes'),{manifest,draft}=await f.prepare();
  assert.equal(draft.attachmentCount,3);
  assert.deepEqual(draft.attachments.map(a=>a.kind),['offer','terms','avv']);
  assert.equal(new Set(draft.attachments.map(a=>a.sha256)).size,3);
  assert.equal(validateGmailTestDraft(draft,manifest).attachmentCount,3);
});
test('C3 builder rejects malformed secret, test-recipient allowlist and tampered HMAC',async()=>{
  const f=fixture(),{manifest}=await f.prepare();
  assert.throws(()=>createGmailTestDraftBuilder({
    signingSecret:Buffer.alloc(4),allowedRecipients:[RECIPIENT],
    readArchivedPdf:f.readArchivedPdf
  }),/incomplete/);
  await assert.rejects(createGmailTestDraftBuilder({
    signingSecret:SECRET,allowedRecipients:['different@example.com'],
    readArchivedPdf:f.readArchivedPdf,now:()=>CLOCK
  }).prepare(manifest),/not allowlisted/);
  await assert.rejects(f.builder.prepare({...manifest,recipient:'unauthorized@example.com'}),/signature invalid/);
});
test('C3 Gmail draft refuses corrupted, missing or changed archived bytes',async()=>{
  const f=fixture('yes'),{manifest}=await f.prepare();
  const corrupted=createGmailTestDraftBuilder({
    signingSecret:SECRET,allowedRecipients:[RECIPIENT],now:()=>CLOCK,
    readArchivedPdf:async key=>{
      const data=Buffer.from(f.sources.get(key));data[data.length-1]^=1;return data;
    }
  });
  await assert.rejects(corrupted.prepare(manifest),/SHA-256/);
  const missing=createGmailTestDraftBuilder({
    signingSecret:SECRET,allowedRecipients:[RECIPIENT],now:()=>CLOCK,
    readArchivedPdf:async()=>null
  });
  await assert.rejects(missing.prepare(manifest),/PDF-Inhalt|Buffer/);
});
test('C3 signed release expires and never becomes a reusable send permission',async()=>{
  const f=fixture(),{manifest}=await f.prepare();
  const future=createGmailTestDraftBuilder({
    signingSecret:SECRET,allowedRecipients:[RECIPIENT],
    readArchivedPdf:f.readArchivedPdf,now:()=>CLOCK+16*60*1000
  });
  await assert.rejects(future.prepare(manifest),/no longer recent/);
});
test('C3 draft cannot be upgraded to send or changed recipient, order or PDFs',async()=>{
  const f=fixture('yes'),{manifest,draft}=await f.prepare();
  for(const tamper of [
    {...draft,neverSend:false},
    {...draft,sendMode:'production'},
    {...draft,to:['client@example.ch']},
    {...draft,subject:'LSZH Vertragspaket'},
    {...draft,emailHeaders:[{key:'X-LSZH-Contract-Event',value:'fake'}]},
    {...draft,attachments:[...draft.attachments].reverse()},
    {...draft,attachments:draft.attachments.map((a,i)=>i===0?{
      ...a,dataBase64:a.dataBase64.slice(0,-4)+'AAAA'}:a)}
  ]){
    assert.throws(()=>validateGmailTestDraft(tamper,manifest),/blocked/);
  }
});
test('C3 trusted read-only Gmail SENT evidence matches two PDFs and recipient',async()=>{
  const f=fixture(),{manifest}=await f.prepare();
  let reads=0;
  const verify=createGmailSentEvidenceVerifier({
    allowedSenders:[SENDER],readSentMessage:async id=>{
      reads++;assert.equal(id,'gmail_test_message_01');
      return readbackFixture(f,manifest);
    }
  });
  assert.equal(await verify.verify({receipt:receipt(manifest),expected:{
    eventId:manifest.eventId,packageSha256:manifest.packageSha256,
    recipient:manifest.recipient,documentHashes:manifest.documents
  }}),true);
  assert.equal(reads,1);
});
test('C3 Gmail read-back fails for not SENT, different recipient, forged headers or altered PDF',async()=>{
  const f=fixture('yes'),{manifest}=await f.prepare();
  const baseline=readbackFixture(f,manifest);
  const cases=[
    {...baseline,labelIds:['INBOX']},
    {...baseline,to:['unknown@example.com']},
    {...baseline,cc:['stranger@example.com']},
    {...baseline,bcc:['stranger@example.com']},
    {...baseline,from:'impostor@example.com'},
    {...baseline,subject:'Real customer mail'},
    {...baseline,headers:{...baseline.headers,'x-lszh-package-sha256':'0'.repeat(64)}},
    {...baseline,attachments:baseline.attachments.slice(0,2)},
    {...baseline,attachments:baseline.attachments.map((a,i)=>i===0?
      {...a,data:Buffer.from('%PDF-1.4\nedited\n')}:a)},
    {...baseline,attachments:[...baseline.attachments].reverse()}
  ];
  for(const message of cases){
    const v=createGmailSentEvidenceVerifier({
      allowedSenders:[SENDER],readSentMessage:async()=>message
    });
    const result=await v.verify({receipt:receipt(manifest),expected:{
      eventId:manifest.eventId,packageSha256:manifest.packageSha256,
      recipient:manifest.recipient,documentHashes:manifest.documents
    }});
    assert.equal(result,false);
  }
});
test('C3 Make or Gmail message ID receipt alone is never proof of delivery',async()=>{
  const f=fixture(),{manifest}=await f.prepare();
  const ctx={eventId:manifest.eventId,packageSha256:manifest.packageSha256,
    recipient:manifest.recipient,documentHashes:manifest.documents};
  const verify=createGmailSentEvidenceVerifier({
    allowedSenders:[SENDER],readSentMessage:async()=>null
  });
  assert.equal(await verify.verify({receipt:receipt(manifest),expected:ctx}),false);
  assert.equal(await verify.verify({receipt:receipt(manifest,{provider:'NONE'}),expected:ctx}),false);
  assert.equal(await verify.verify({receipt:receipt(manifest,{attachmentCount:3}),expected:ctx}),false);
  assert.equal(await verify.verify({receipt:receipt(manifest,{eventId:'fake_event'}),expected:ctx}),false);
});
test('C3 trusted Gmail read adapter errors fail closed, never auto retry a message',async()=>{
  const f=fixture(),{manifest}=await f.prepare();
  let count=0;
  const verify=createGmailSentEvidenceVerifier({
    allowedSenders:[SENDER],readSentMessage:async()=>{count++;throw Error('Gmail timeout');}
  });
  const ctx={eventId:manifest.eventId,packageSha256:manifest.packageSha256,
    recipient:manifest.recipient,documentHashes:manifest.documents};
  assert.equal(await verify.verify({receipt:receipt(manifest),expected:ctx}),false);
  assert.equal(count,1);
});
test('C3 Gmail staging modules are not imported into live server or offer sender',()=>{
  const dir=path.join(__dirname,'..');
  for(const file of ['server.js','offer-send.js']){
    const src=fs.readFileSync(path.join(dir,file),'utf8');
    assert.doesNotMatch(src,/require\s*\(\s*['"]\.\/contract-gmail-(?:draft|evidence)-staging['"]\s*\)/);
  }
  for(const file of ['contract-gmail-draft-staging.js','contract-gmail-evidence-staging.js']){
    const src=fs.readFileSync(path.join(dir,file),'utf8');
    assert.doesNotMatch(src,/\bfetch\(|gmail\.send|https?\.request|hook\.eu1\.make\.com/);
    assert.doesNotMatch(src,/require\s*\(\s*['"](?:node:https?|googleapis)/);
  }
});
