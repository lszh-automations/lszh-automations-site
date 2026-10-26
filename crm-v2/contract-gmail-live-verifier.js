'use strict';
const {verifyDocumentBytes,verifyOfferPackage}=require('./offer-contract-package');
const {mimeBase64url}=require('./contract-gmail-api-readonly-staging');
const {fault}=require('./contract-acceptance-staging');
function createLiveSentVerifier({read,now=Date.now}={}){
 if(typeof read?.getMessage!=='function'||typeof read?.getAttachment!=='function')throw fault('GMAIL_READER_REQUIRED',503);
 async function verify({package:pkg,recipient,messageId,confirmationDocument}={}){
  pkg=structuredClone(pkg);confirmationDocument=confirmationDocument?structuredClone(confirmationDocument):undefined;
  verifyOfferPackage(pkg);
  if(!/^[A-Za-z0-9_-]{4,200}$/.test(messageId||''))throw fault('SENT_EVIDENCE_REQUIRED',409);
  const raw=await read.getMessage(messageId),h=raw?.payload?.headers;
  if(raw?.id!==messageId||!raw.labelIds?.includes('SENT')||!Array.isArray(h))throw fault('SENT_EVIDENCE_REQUIRED',409);
  function header(name){const a=h.filter(x=>x?.name?.toLowerCase()===name);if(a.length!==1||typeof a[0].value!=='string'||a[0].value.length>2000||/[\r\n]/.test(a[0].value))throw fault('SENT_EVIDENCE_REQUIRED',409);return a[0].value;}
  function mailbox(value){if(/[;,\r\n]/.test(value))throw fault('SENT_EVIDENCE_REQUIRED',409);const match=/^(?:[^<>]+\s)?<([^<>]+)>$/.exec(value);return (match?.[1]||value).trim().toLowerCase();}
  if(mailbox(header('from'))!=='info@lszh-automations.ch'||mailbox(header('to'))!==recipient||
     h.some(x=>['cc','bcc'].includes(x?.name?.toLowerCase()))||/^\[TEST_ONLY\]/i.test(header('subject'))||
     header('x-lszh-package-sha256')!==pkg.packageSha256||
     header('x-lszh-contract-event')!==(confirmationDocument?'confirmation_'+pkg.packageId:pkg.sendEventId))throw fault('SENT_EVIDENCE_REQUIRED',409);
  const parts=[];let nodes=0;
  function walk(items,depth=0){if(!Array.isArray(items)||depth>5)throw fault('SENT_EVIDENCE_REQUIRED',409);for(const p of items){if(++nodes>60||!p)throw fault('SENT_EVIDENCE_REQUIRED',409);if(p.parts)walk(p.parts,depth+1);if(p.filename)parts.push(p);}}
  walk(raw.payload.parts||[]);
  const expected=confirmationDocument?[confirmationDocument]:pkg.documents;
  if(parts.length!==expected.length)throw fault('SENT_EVIDENCE_REQUIRED',409);
  let total=0;
  for(let i=0;i<parts.length;i++){
   const p=parts[i],d=expected[i];
   if(p.filename!==d.filename||p.mimeType!=='application/pdf'||p.body?.size!==d.bytes)throw fault('SENT_EVIDENCE_REQUIRED',409);
   let encoded=p.body.data;
   if(encoded===undefined){if(!/^[A-Za-z0-9_-]{4,2048}$/.test(p.body.attachmentId||''))throw fault('SENT_EVIDENCE_REQUIRED',409);const b=await read.getAttachment(messageId,p.body.attachmentId);if(b.size!==undefined&&b.size!==d.bytes)throw fault('SENT_EVIDENCE_REQUIRED',409);encoded=b.data;}
   const bytes=mimeBase64url(encoded);verifyDocumentBytes(d,bytes);total+=bytes.length;
   if(total>8000000)throw fault('SENT_EVIDENCE_REQUIRED',409);
  }
  const sentAt=Number(raw.internalDate);
  if(!Number.isSafeInteger(sentAt)||sentAt<=0||sentAt>now()+30000)throw fault('SENT_EVIDENCE_REQUIRED',409);
  return {verified:true,source:'independent_gmail_sent_readback',sender:'info@lszh-automations.ch',cc:[],bcc:[],recipient,messageId,
   eventId:pkg.sendEventId,packageSha256:pkg.packageSha256,verifiedAt:new Date(now()).toISOString(),sentAt:new Date(sentAt).toISOString(),
   documentHashes:Object.fromEntries(expected.map(d=>[d.kind,d.sha256])),...(confirmationDocument?{confirmationSha256:confirmationDocument.sha256}:{})};
 }
 return Object.freeze({verify});
}
module.exports={createLiveSentVerifier};
