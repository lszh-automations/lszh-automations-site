'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {makePdf}=require('../offer-pdf');
const {digest,prepareOfferPackage}=require('../offer-contract-package');
const {PURPOSE,createContractReleaseGate}=require('../contract-dispatch-release-staging');
const {createGmailTestDraftBuilder}=require('../contract-gmail-draft-staging');
const {createGmailSentEvidenceVerifier}=require('../contract-gmail-evidence-staging');
const {
  KIND,MODE,verifyEnvelope,createBlockedMakeGmailEnvelope,
  simulateMakeBinaryAttachmentsWithoutSend
}=require('../contract-gmail-make-transport-staging');
const {mimeBase64url,createGmailApiReadOnlyAdapter}
  =require('../contract-gmail-api-readonly-staging');
const CLOCK=Date.parse('2026-10-25T11:00:00.000Z');
const SECRET=Buffer.from('TEST_ONLY_C32_signing_secret_over_32_bytes_for_test_only');
const OPERATOR='operator-test@example.com';
const TO='test-approved@example.com';
const FROM='test-sender@lszh-automations.ch';
function fixture(avv='no'){
  const pdfs=new Map();
  const docs=(avv==='yes'?['offer','terms','avv']:['offer','terms']).map(kind=>{
    const pdf=makePdf({number:'1111',
      title:'TEST_ONLY '+kind+' ohne Vertrag',
      validUntil:'2026-12-31',
      items:[{title:'TEST_ONLY '+kind,qty:1,unitPriceCHF:10,mode:'einmalig'}]
    },{
      name:'Test Operator',company:'TEST_ONLY Kunde',email:'preview@example.invalid',
      street:'Musterweg 12',postalCode:'5610',city:'Wohlen',country:'CH'
    });
    const archiveFileId='test_archive_'+kind+'_20261025';
    pdfs.set(archiveFileId,pdf);
    return {kind,version:'RC1_TEST_ONLY',archiveFileId,
      filename:'TEST_ONLY_'+kind+'.pdf',bytes:pdf.length,sha256:digest(pdf)};
  });
  const pkg=prepareOfferPackage({
    offerId:'test_mail_contract_1111',offerNumber:'1111',
    revision:avv==='yes'?2:1,
    offerSnapshotSha256:digest(Buffer.from('TEST_ONLY quote snapshot '+avv)),
    avvRequired:avv,avvAnnexesConfirmed:avv==='yes',documents:docs
  });
  const reader=async id=>pdfs.get(id);
  const gate=createContractReleaseGate({
    signingSecret:SECRET,allowedOperators:[OPERATOR],allowedRecipients:[TO],
    authorizeOperator:async()=>true,readArchivedPdf:reader,now:()=>CLOCK
  });
  const draftBuilder=createGmailTestDraftBuilder({
    signingSecret:SECRET,allowedRecipients:[TO],readArchivedPdf:reader,now:()=>CLOCK
  });
  async function prepare(){
    const manifest=await gate.approve(pkg,{purpose:PURPOSE,recipient:TO,
      operatorEmail:OPERATOR,approvalId:'approve_c32_20261025',
      approvedAt:new Date(CLOCK).toISOString()
    });
    const draft=await draftBuilder.prepare(manifest);
    const envelope=createBlockedMakeGmailEnvelope(draft,manifest,{
      signingSecret:SECRET,allowedRecipients:[TO],now:()=>CLOCK
    });
    return {manifest,draft,envelope};
  }
  return {prepare,pdfs,reader};
}
function gmailResponse(manifest,files,{messageId='gmail_test_message_1'}={}){
  return {
    id:messageId,labelIds:['SENT'],
    payload:{
      mimeType:'multipart/mixed',
      headers:[
        {name:'From',value:'LSZH Automations <'+FROM+'>'},
        {name:'To',value:TO},
        {name:'Subject',value:'[TEST_ONLY] LSZH Vertragspaket'},
        {name:'X-LSZH-Contract-Event',value:manifest.eventId},
        {name:'X-LSZH-Package-SHA256',value:manifest.packageSha256}
      ],
      parts:files.map(file=>({
        filename:file.filename,mimeType:'application/pdf',
        body:{size:file.bytes,
          attachmentId:'attachment_'+file.kind+'_1000'}
      }))
    }
  };
}
function receipt(manifest){
  return {ok:true,eventId:manifest.eventId,
    packageSha256:manifest.packageSha256,to:TO,
    attachmentCount:manifest.documents.length,
    provider:'gmail',messageId:'gmail_test_message_1'
  };
}
test('C3.2 Make 2-PDF locked envelope keeps exact metadata and binary file content',async()=>{
  const f=fixture(),{manifest,envelope}=await f.prepare();
  assert.equal(envelope.kind,KIND);
  assert.equal(envelope.sendMode,MODE);
  assert.equal(envelope.neverSend,true);
  assert.equal(envelope.attachmentCount,2);
  assert.equal(verifyEnvelope(envelope,manifest).attachmentCount,2);
  const result=simulateMakeBinaryAttachmentsWithoutSend(envelope,manifest);
  assert.equal(result.simulated,true);
  assert.equal(result.attachments.length,2);
  for(let i=0;i<2;i++)
    assert.deepEqual(result.attachments[i].data,
      f.pdfs.get(manifest.documents[i].archiveFileId));
});
test('C3.2 Make 3-PDF offline aggregator preserves OFFER, TERMS and AVV order',async()=>{
  const f=fixture('yes'),{manifest,envelope}=await f.prepare();
  const result=simulateMakeBinaryAttachmentsWithoutSend(envelope,manifest);
  assert.equal(result.attachmentCount,3);
  assert.deepEqual(envelope.attachments.map(a=>a.kind),['offer','terms','avv']);
  assert.equal(new Set(envelope.attachments.map(a=>a.sha256)).size,3);
  for(const [i,file] of result.attachments.entries())
    assert.equal(digest(file.data),manifest.documents[i].sha256);
});
test('C3.2 rejects changed recipient, send mode, header, count or base64 bytes',async()=>{
  const f=fixture('yes'),{manifest,envelope}=await f.prepare();
  for(const changed of [
    {...envelope,neverSend:false},
    {...envelope,sendMode:'production'},
    {...envelope,to:'customer@example.com'},
    {...envelope,attachmentCount:2},
    {...envelope,attachments:[...envelope.attachments].reverse()},
    {...envelope,emailHeaders:[{key:'X-LSZH-Contract-Event',value:'fake'}]},
    {...envelope,attachments:envelope.attachments.map((x,i)=>i===0?
      {...x,contentBase64:x.contentBase64.slice(0,-4)+'AAAA'}:x)}
  ])assert.throws(()=>simulateMakeBinaryAttachmentsWithoutSend(changed,manifest),/blocked/);
});
test('C3.2 rejects stale signed release and unapproved recipient without network',async()=>{
  const f=fixture(),{manifest,draft}=await f.prepare();
  assert.throws(()=>createBlockedMakeGmailEnvelope(draft,manifest,{
    signingSecret:SECRET,allowedRecipients:['elsewhere@example.com'],now:()=>CLOCK
  }),/not on exact test allowlist/);
  assert.throws(()=>createBlockedMakeGmailEnvelope(draft,manifest,{
    signingSecret:SECRET,allowedRecipients:[TO],now:()=>CLOCK+17*60*1000
  }),/expired/);
  assert.throws(()=>createBlockedMakeGmailEnvelope(draft,{...manifest,
    packageSha256:'0'.repeat(64)},{
    signingSecret:SECRET,allowedRecipients:[TO],now:()=>CLOCK
  }),/signature invalid/);
});
test('C3.2 Gmail base64url decoder rejects corrupt, padded oddity and oversized data',()=>{
  const data=Buffer.from('%PDF-1.4\nTEST_ONLY fixture','utf8');
  assert.deepEqual(mimeBase64url(data.toString('base64url')),data);
  for(const invalid of ['', '___=', '!notbase64','a','a==='])
    assert.throws(()=>mimeBase64url(invalid),/blocked/);
});
test('C3.2 Gmail read-only adapter verifies SENT/headers and reads 3 attachments',async()=>{
  const f=fixture('yes'),{manifest}=await f.prepare();
  const raw=gmailResponse(manifest,manifest.documents);
  let attachmentsRead=0;
  const adapter=createGmailApiReadOnlyAdapter({
    getMessage:async id=>{assert.equal(id,raw.id);return raw;},
    getAttachment:async(_,attachmentId)=>{
      attachmentsRead++;
      const doc=manifest.documents.find(d=>attachmentId.includes(d.kind+'_'));
      return {data:f.pdfs.get(doc.archiveFileId).toString('base64url'),size:doc.bytes};
    }
  });
  const normalized=await adapter.readSentMessage(raw.id);
  assert.equal(attachmentsRead,3);
  assert.deepEqual(normalized.to,[TO]);
  assert.equal(normalized.from,FROM);
  assert.deepEqual(normalized.attachments.map(a=>a.filename),
    manifest.documents.map(d=>d.filename));
  const verifier=createGmailSentEvidenceVerifier({
    allowedSenders:[FROM],readSentMessage:adapter.readSentMessage
  });
  const proof=await verifier.verify({receipt:receipt(manifest),expected:{
    eventId:manifest.eventId,packageSha256:manifest.packageSha256,
    recipient:TO,documentHashes:manifest.documents
  }});
  assert.equal(proof,true);
});
test('C3.2 Gmail metadata tampering or unsafe MIME parts always fail closed',async()=>{
  const f=fixture(),{manifest}=await f.prepare();
  const baseline=gmailResponse(manifest,manifest.documents);
  const bad=[
    {...baseline,labelIds:['INBOX']},
    {...baseline,payload:{...baseline.payload,headers:[
      ...baseline.payload.headers,{name:'To',value:'fraud@example.com'}]}},
    {...baseline,payload:{...baseline.payload,headers:[
      ...baseline.payload.headers,{name:'Bcc',value:'other@example.ch'}]}},
    {...baseline,payload:{...baseline.payload,headers:baseline.payload.headers.filter(h=>h.name!=='X-LSZH-Contract-Event')}},
    {...baseline,payload:{...baseline.payload,parts:[
      ...baseline.payload.parts,{filename:'other.pdf',mimeType:'application/pdf',body:{size:20,attachmentId:'extra_100'}}]}},
    {...baseline,payload:{...baseline.payload,parts:baseline.payload.parts.map(p=>({
      ...p,body:{...p.body,size:9}
    }))}}
  ];
  for(const raw of bad){
    const adapter=createGmailApiReadOnlyAdapter({
      getMessage:async()=>raw,
      getAttachment:async(_id,aid)=>({
        data:f.pdfs.get(manifest.documents.find(d=>aid.includes(d.kind+'_')).archiveFileId).toString('base64url')
      })
    });
    await assert.rejects(adapter.readSentMessage('gmail_test_message_1'),/blocked/);
  }
});
test('C3.2 Gmail read failure or modified 3rd PDF never confirms delivery',async()=>{
  const f=fixture('yes'),{manifest}=await f.prepare();
  const raw=gmailResponse(manifest,manifest.documents);
  const adapter=createGmailApiReadOnlyAdapter({
    getMessage:async()=>raw,
    getAttachment:async(_id,aid)=>{
      const doc=manifest.documents.find(d=>aid.includes(d.kind+'_'));
      const bytes=Buffer.from(f.pdfs.get(doc.archiveFileId));
      if(doc.kind==='avv')bytes[bytes.length-1]^=1;
      return {data:bytes.toString('base64url'),size:doc.bytes};
    }
  });
  const verifier=createGmailSentEvidenceVerifier({
    allowedSenders:[FROM],readSentMessage:adapter.readSentMessage
  });
  assert.equal(await verifier.verify({receipt:receipt(manifest),expected:{
    eventId:manifest.eventId,packageSha256:manifest.packageSha256,
    recipient:TO,documentHashes:manifest.documents
  }}),false);
  const down=createGmailSentEvidenceVerifier({
    allowedSenders:[FROM],
    readSentMessage:createGmailApiReadOnlyAdapter({
      getMessage:async()=>{throw Error('Gmail 503')},
      getAttachment:async()=>null
    }).readSentMessage
  });
  assert.equal(await down.verify({receipt:receipt(manifest),expected:{
    eventId:manifest.eventId,packageSha256:manifest.packageSha256,
    recipient:TO,documentHashes:manifest.documents
  }}),false);
});
test('C3.2 no productive send/transport imports or executable Gmail send action',()=>{
  const dir=path.join(__dirname,'..');
  for(const file of ['contract-gmail-make-transport-staging.js',
    'contract-gmail-api-readonly-staging.js']){
    const text=fs.readFileSync(path.join(dir,file),'utf8');
    assert.doesNotMatch(text,/\bfetch\s*\(|gmail\.send|https?\.request|hook\.eu1\.make\.com/);
    assert.doesNotMatch(text,/require\s*\(\s*['"](?:node:https?|googleapis)/);
  }
  for(const live of ['server.js','offer-send.js','cloud-records.js']){
    const text=fs.readFileSync(path.join(dir,live),'utf8');
    assert.doesNotMatch(text,/require\s*\(\s*['"]\.\/contract-gmail-(?:make-transport|api-readonly)-staging['"]\s*\)/);
  }
});
