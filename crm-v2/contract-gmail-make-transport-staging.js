'use strict';
// Phase C.3.2: pure Make-facing TEST_ONLY payload + offline binary mapping.
// No HTTP, Gmail action, Firestore write, webhook URL or customer send.
const {digest}=require('./offer-contract-package');
const {blocked,verifyReleaseManifest,WINDOW_MS}=require('./contract-dispatch-release-staging');
const {validateGmailTestDraft}=require('./contract-gmail-draft-staging');
const KIND='lszh_contract_gmail_c3_2_blocked';
const MODE='blocked_preview_only';
const MAX_TOTAL=8_000_000;
function exact(v,fields) {
  if(!v||typeof v!=='object'||Array.isArray(v)||
    Object.keys(v).some(k=>!fields.includes(k)))throw blocked('unknown transport fields');
}
function verifyEnvelope(envelope,manifest){
  exact(envelope,[
    'kind','sendMode','neverSend','to','subject','html','eventId','packageId',
    'packageSha256','approvalId','approvedAt','attachmentCount','attachments',
    'emailHeaders'
  ]);
  if(envelope.kind!==KIND||envelope.sendMode!==MODE||envelope.neverSend!==true||
    envelope.to!==manifest.recipient||
    envelope.subject!=='[TEST_ONLY – KEIN VERSAND] LSZH Vertragspaket '+manifest.offerNumber||
    typeof envelope.html!=='string'||!envelope.html.includes('KEIN VERSAND')||
    envelope.eventId!==manifest.eventId||envelope.packageId!==manifest.packageId||
    envelope.packageSha256!==manifest.packageSha256||
    envelope.approvalId!==manifest.approvalId||
    envelope.approvedAt!==manifest.approvedAt||
    envelope.attachmentCount!==manifest.documents.length||
    !Array.isArray(envelope.emailHeaders)||envelope.emailHeaders.length!==2||
    envelope.emailHeaders[0]?.key!=='X-LSZH-Contract-Event'||
    envelope.emailHeaders[0]?.value!==manifest.eventId||
    envelope.emailHeaders[1]?.key!=='X-LSZH-Package-SHA256'||
    envelope.emailHeaders[1]?.value!==manifest.packageSha256)
    throw blocked('no matching safe C3.2 blocked preview');
  if(!Array.isArray(envelope.attachments)||![2,3].includes(envelope.attachments.length)||
    envelope.attachments.length!==envelope.attachmentCount)
    throw blocked('wrong Gmail binary attachment count');
  let total=0;
  const items=envelope.attachments.map((item,index)=>{
    const doc=manifest.documents[index];
    exact(item,['kind','filename','mimeType','contentBase64','sha256','bytes']);
    if(item.kind!==doc.kind||item.filename!==doc.filename||
       !item.filename.startsWith('TEST_ONLY_')||item.mimeType!=='application/pdf'||
       item.sha256!==doc.sha256||item.bytes!==doc.bytes||
       typeof item.contentBase64!=='string'||item.contentBase64.length>7_000_000)
      throw blocked('altered attachment identity or metadata');
    const bytes=Buffer.from(item.contentBase64,'base64');
    if(bytes.toString('base64')!==item.contentBase64||bytes.length!==doc.bytes||
       bytes.subarray(0,5).toString('ascii')!=='%PDF-'||
       digest(bytes)!==doc.sha256)throw blocked('altered PDF bytes or noncanonical base64');
    total+=bytes.length;
    if(total>MAX_TOTAL)throw blocked('attachment package oversized');
    return Object.freeze({kind:item.kind,filename:item.filename,mimeType:item.mimeType,
      sha256:item.sha256,bytes:item.bytes});
  });
  return Object.freeze({attachmentCount:items.length,totalBytes:total,files:items});
}
function createBlockedMakeGmailEnvelope(draft,manifest,{signingSecret,allowedRecipients,now=()=>Date.now()}={}){
  if(!Buffer.isBuffer(signingSecret)||signingSecret.length<32||
     !Array.isArray(allowedRecipients)||allowedRecipients.length===0||
     typeof now!=='function')throw blocked('trusted transport configuration absent');
  verifyReleaseManifest(manifest,signingSecret);
  if(!allowedRecipients.includes(manifest.recipient))throw blocked('recipient not on exact test allowlist');
  const age=now()-Date.parse(manifest.approvedAt);
  if(!Number.isFinite(age)||age < -30_000||age>WINDOW_MS)
    throw blocked('test release expired');
  validateGmailTestDraft(draft,manifest);
  const envelope=Object.freeze({
    kind:KIND,sendMode:MODE,neverSend:true,to:manifest.recipient,
    subject:draft.subject,html:draft.content,eventId:manifest.eventId,
    packageId:manifest.packageId,packageSha256:manifest.packageSha256,
    approvalId:manifest.approvalId,approvedAt:manifest.approvedAt,
    attachmentCount:draft.attachments.length,
    emailHeaders:draft.emailHeaders.map(h=>Object.freeze({key:h.key,value:h.value})),
    attachments:Object.freeze(draft.attachments.map(a=>Object.freeze({
      kind:a.kind,filename:a.filename,mimeType:a.mimeType,
      contentBase64:a.dataBase64,sha256:a.sha256,bytes:a.bytes
    })))
  });
  verifyEnvelope(envelope,manifest);
  return envelope;
}
// This is the OFFLINE equivalent of a Make toBinary(base64) mapping plus
// exactly one array aggregator. A Gmail module must not be wired to this output.
function simulateMakeBinaryAttachmentsWithoutSend(envelope,manifest) {
  const summary=verifyEnvelope(envelope,manifest);
  const attachments=envelope.attachments.map(a=>Object.freeze({
    filename:a.filename,data:Buffer.from(a.contentBase64,'base64')
  }));
  return Object.freeze({
    safe:true,neverSend:true,simulated:true,
    attachmentCount:summary.attachmentCount,totalBytes:summary.totalBytes,
    attachments:Object.freeze(attachments)
  });
}
module.exports={KIND,MODE,verifyEnvelope,createBlockedMakeGmailEnvelope,
  simulateMakeBinaryAttachmentsWithoutSend};
