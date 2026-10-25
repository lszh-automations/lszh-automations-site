'use strict';
// C.3 / Gmail SENT evidence verifier for a FUTURE, separately approved test.
// readSentMessage is an injected TRUSTED read-only Gmail adapter. A Make HTTP
// success or self-reported messageId is never sufficient. No network here.
const {timingSafeEqual}=require('node:crypto');
const {digest}=require('./offer-contract-package');
const {blocked}=require('./contract-dispatch-release-staging');
const MESSAGE=/^[A-Za-z0-9_./:+-]{4,200}$/;
const SHA=/^[a-f0-9]{64}$/;
function safeEqual(a,b){
  if(typeof a!=='string'||typeof b!=='string')return false;
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length===y.length&&timingSafeEqual(x,y);
}
function createGmailSentEvidenceVerifier({readSentMessage,allowedSenders}={}){
  if(typeof readSentMessage!=='function'||!Array.isArray(allowedSenders)||
     allowedSenders.length===0||allowedSenders.some(x=>
       typeof x!=='string'||!/^[a-z0-9._+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(x)))
    throw blocked('trusted Gmail read-only verifier configuration incomplete');
  const senders=new Set(allowedSenders);
  async function verify({receipt,expected}={}){
    if(!receipt||!expected||typeof receipt!=='object'||
       receipt.provider!=='gmail'||receipt.ok!==true||
       typeof receipt.messageId!=='string'||!MESSAGE.test(receipt.messageId)||
       !safeEqual(receipt.eventId,expected.eventId)||
       !safeEqual(receipt.packageSha256,expected.packageSha256)||
       !safeEqual(receipt.to,expected.recipient)||
       !Array.isArray(expected.documentHashes)||![2,3].includes(expected.documentHashes.length)||
       receipt.attachmentCount!==expected.documentHashes.length)
      return false;
    let record;
    try{record=await readSentMessage(receipt.messageId);}
    catch{return false}
    if(!record||record.id!==receipt.messageId||
       !Array.isArray(record.labelIds)||!record.labelIds.includes('SENT')||
       typeof record.from!=='string'||!senders.has(record.from)||
       !Array.isArray(record.to)||record.to.length!==1||record.to[0]!==expected.recipient||
       (record.cc!==undefined&&(!Array.isArray(record.cc)||record.cc.length!==0))||
       (record.bcc!==undefined&&(!Array.isArray(record.bcc)||record.bcc.length!==0))||
       typeof record.subject!=='string'||!record.subject.startsWith('[TEST_ONLY]')||
       !record.headers||typeof record.headers!=='object'||Array.isArray(record.headers)||
       !safeEqual(record.headers['x-lszh-contract-event'],expected.eventId)||
       !safeEqual(record.headers['x-lszh-package-sha256'],expected.packageSha256)||
       !Array.isArray(record.attachments)||
       record.attachments.length!==expected.documentHashes.length)
      return false;
    let total=0;
    for(let i=0;i<record.attachments.length;i++){
      const doc=expected.documentHashes[i],actual=record.attachments[i];
      if(!doc||!actual||typeof doc.filename!=='string'||
         !doc.filename.startsWith('TEST_ONLY_')||
         typeof doc.sha256!=='string'||!SHA.test(doc.sha256)||
         actual.filename!==doc.filename||
         actual.mimeType!=='application/pdf'||
         !Number.isSafeInteger(doc.bytes)||doc.bytes<10||doc.bytes>5_000_000||
         !Buffer.isBuffer(actual.data)||actual.data.length!==doc.bytes||
         actual.data.subarray(0,5).toString('ascii')!=='%PDF-'||
         !safeEqual(digest(actual.data),doc.sha256))
        return false;
      total+=actual.data.length;
      if(total>8_000_000)return false;
    }
    return true;
  }
  return Object.freeze({verify});
}
module.exports={createGmailSentEvidenceVerifier};
