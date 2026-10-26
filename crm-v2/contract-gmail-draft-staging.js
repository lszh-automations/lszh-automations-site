'use strict';
// C.3 / PREPARE ONLY: formats TEST_ONLY Gmail attachment data; NEVER sends.
// The signed C.1 approval and independent archive bytes are mandatory.
// No Gmail client, Make webhook, network or database access in this module.
const {digest,verifyDocumentBytes}=require('./offer-contract-package');
const {
  PURPOSE,WINDOW_MS,blocked,verifyReleaseManifest
}=require('./contract-dispatch-release-staging');
const KIND='lszh_contract_gmail_test_draft';
const MODE='prepare_only';
function address(value){
  if(typeof value!=='string'||value.length>254||
    !/^[a-z0-9.!#$%&'*+/=?^_\u0060{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(value)||
    value.endsWith('.invalid')||value.includes('*'))throw blocked('mailbox invalid');
  return value;
}
function exact(obj,keys){
  if(!obj||typeof obj!=='object'||Array.isArray(obj)||
     Object.keys(obj).some(k=>!keys.includes(k)))throw blocked('unexpected Gmail draft metadata');
}
function createGmailTestDraftBuilder(config={}){
  const {signingSecret,allowedRecipients,readArchivedPdf,now=()=>Date.now()}=config;
  if(!Buffer.isBuffer(signingSecret)||signingSecret.length<32||
     !Array.isArray(allowedRecipients)||!allowedRecipients.length||
     typeof readArchivedPdf!=='function'||typeof now!=='function')
    throw blocked('draft signing or archive configuration incomplete');
  const allow=new Set(allowedRecipients.map(address));
  async function prepare(manifest){
    verifyReleaseManifest(manifest,signingSecret);
    if(manifest.purpose!==PURPOSE)throw blocked('not a test-only release');
    if(!allow.has(address(manifest.recipient)))throw blocked('recipient not allowlisted');
    const age=now()-Date.parse(manifest.approvedAt);
    if(!Number.isFinite(age)||age< -30000||age>WINDOW_MS)
      throw blocked('signed release no longer recent');
    const attachments=[],kinds=manifest.avvRequired==='yes'
      ?['offer','terms','avv']:['offer','terms'];
    if(manifest.documents.length!==kinds.length)throw blocked('wrong attachment count');
    let total=0;
    for(const [i,doc] of manifest.documents.entries()){
      if(doc.kind!==kinds[i]||!doc.filename.startsWith('TEST_ONLY_')||
         !doc.version.includes('TEST_ONLY')||!doc.archiveFileId.startsWith('test_'))
        throw blocked('not a synthetic archive document');
      const bytes=await readArchivedPdf(doc.archiveFileId,doc);
      verifyDocumentBytes(doc,bytes);
      total+=bytes.length;
      if(total>8_000_000)throw blocked('total attachment bytes exceeded');
      attachments.push(Object.freeze({
        kind:doc.kind,filename:doc.filename,mimeType:'application/pdf',
        dataBase64:bytes.toString('base64'),sha256:doc.sha256,bytes:doc.bytes
      }));
    }
    const draft=Object.freeze({
      kind:KIND,sendMode:MODE,neverSend:true,
      to:Object.freeze([manifest.recipient]),
      subject:'[TEST_ONLY – KEIN VERSAND] LSZH Vertragspaket '+manifest.offerNumber,
      bodyType:'rawHtml',
      content:'<!doctype html><html lang="de-CH"><body style="font-family:Arial,sans-serif;color:#111">' +
        '<h2>LSZH AUTOMATIONS</h2><p><strong>TEST_ONLY – KEIN VERSAND</strong></p>' +
        '<p>Nur synthetische Vorschau. Kein Angebot, keine Annahme und kein Vertrag.</p>' +
        '<p>Beilagen: '+attachments.length+' PDF-Dokumente.</p></body></html>',
      eventId:manifest.eventId,packageId:manifest.packageId,
      packageSha256:manifest.packageSha256,
      approvalId:manifest.approvalId,approvedAt:manifest.approvedAt,
      emailHeaders:Object.freeze([
        Object.freeze({key:'X-LSZH-Contract-Event',value:manifest.eventId}),
        Object.freeze({key:'X-LSZH-Package-SHA256',value:manifest.packageSha256})
      ]),
      attachmentCount:attachments.length,attachments:Object.freeze(attachments)
    });
    validateGmailTestDraft(draft,manifest);
    return draft;
  }
  return Object.freeze({prepare});
}
function validateGmailTestDraft(draft,manifest){
  exact(draft,[
    'kind','sendMode','neverSend','to','subject','bodyType','content','eventId',
    'packageId','packageSha256','approvalId','approvedAt','emailHeaders','attachmentCount','attachments'
  ]);
  if(draft.kind!==KIND||draft.sendMode!==MODE||draft.neverSend!==true||
     !Array.isArray(draft.to)||draft.to.length!==1||
     draft.to[0]!==manifest.recipient||draft.bodyType!=='rawHtml'||
     draft.eventId!==manifest.eventId||draft.packageId!==manifest.packageId||
     draft.packageSha256!==manifest.packageSha256||
     draft.approvalId!==manifest.approvalId||draft.approvedAt!==manifest.approvedAt||
     draft.subject!=='[TEST_ONLY – KEIN VERSAND] LSZH Vertragspaket '+manifest.offerNumber||
     typeof draft.content!=='string'||!draft.content.includes('KEIN VERSAND')||
     Buffer.byteLength(draft.content,'utf8')>10_000||
     !Array.isArray(draft.emailHeaders)||draft.emailHeaders.length!==2||
     draft.emailHeaders[0]?.key!=='X-LSZH-Contract-Event'||
     draft.emailHeaders[0]?.value!==manifest.eventId||
     draft.emailHeaders[1]?.key!=='X-LSZH-Package-SHA256'||
     draft.emailHeaders[1]?.value!==manifest.packageSha256)
    throw blocked('test-only Gmail preview is not valid');
  if(!Array.isArray(draft.attachments)||draft.attachments.length!==manifest.documents.length||
     draft.attachmentCount!==draft.attachments.length||![2,3].includes(draft.attachments.length))
    throw blocked('Gmail attachment count mismatch');
  let total=0;
  for(let i=0;i<draft.attachments.length;i++){
    const a=draft.attachments[i],doc=manifest.documents[i];
    exact(a,['kind','filename','mimeType','dataBase64','sha256','bytes']);
    if(a.kind!==doc.kind||a.filename!==doc.filename||
       a.mimeType!=='application/pdf'||a.sha256!==doc.sha256||
       a.bytes!==doc.bytes||typeof a.dataBase64!=='string'||
       a.dataBase64.length>7_000_000)
      throw blocked('Gmail PDF metadata tampered');
    const bytes=Buffer.from(a.dataBase64,'base64');
    if(bytes.toString('base64')!==a.dataBase64||
       bytes.length!==doc.bytes||bytes.subarray(0,5).toString('ascii')!=='%PDF-'||
       digest(bytes)!==doc.sha256)
      throw blocked('Gmail PDF content tampered');
    total+=bytes.length;
    if(total>8_000_000)throw blocked('Gmail attachment package too large');
  }
  return Object.freeze({attachmentCount:draft.attachments.length,totalBytes:total});
}
module.exports={KIND,MODE,createGmailTestDraftBuilder,validateGmailTestDraft};
