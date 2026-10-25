'use strict';
// C3.2 pure Gmail API read-only response normalizer.
// Dependencies must be independently authenticated Gmail READ-ONLY adapters.
// Does not create/send drafts, messages, requests, or provider connections.
const {blocked}=require('./contract-dispatch-release-staging');
const MSG=/^[A-Za-z0-9_./:+-]{4,200}$/;
function mimeBase64url(encoded,limit=7_000_000){
  if(typeof encoded!=='string'||encoded.length===0||encoded.length>limit||
     !/^[A-Za-z0-9_-]+={0,2}$/.test(encoded))
    throw blocked('Gmail attachment body is not canonical base64url');
  const clean=encoded.replace(/=+$/,'');
  const bytes=Buffer.from(clean,'base64url');
  if(bytes.length===0||bytes.toString('base64url')!==clean)
    throw blocked('Gmail attachment base64url is invalid');
  return bytes;
}
function oneHeader(headers,name,{required=false}={}){
  const matches=headers.filter(h=>h&&typeof h.name==='string'&&
    h.name.toLowerCase()===name).map(h=>h.value);
  if(matches.length>1||matches.some(v=>typeof v!=='string'||v.length>2000)||
     required&&matches.length!==1)
    throw blocked('missing or ambiguous Gmail '+name+' header');
  return matches[0];
}
function oneMailbox(raw,name){
  if(typeof raw!=='string'||raw.length>320||/[\r\n]/.test(raw)||
     raw.includes(',')||raw.includes(';'))
    throw blocked('invalid Gmail '+name+' address');
  // Gmail headers can use "LSZH Automations <sender@example.ch>".
  const text=raw.trim();
  const match=/^(?:[^<>]{1,100}\s)?<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>$/.exec(text);
  const email=match?match[1]:text;
  if(!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email))
    throw blocked('malformed Gmail '+name+' address');
  return email.toLowerCase();
}
function createGmailApiReadOnlyAdapter({getMessage,getAttachment}={}){
  if(typeof getMessage!=='function'||typeof getAttachment!=='function')
    throw blocked('trusted Gmail read-only backend not configured');
  async function readSentMessage(messageId){
    if(typeof messageId!=='string'||!MSG.test(messageId))
      throw blocked('unsafe messageId');
    const raw=await getMessage(messageId);
    if(!raw||raw.id!==messageId||!Array.isArray(raw.labelIds)||
       !raw.labelIds.includes('SENT')||!raw.payload||
       !Array.isArray(raw.payload.headers))
      throw blocked('message is not independently confirmed as SENT');
    const headers=raw.payload.headers;
    const from=oneMailbox(oneHeader(headers,'from',{required:true}),'from');
    const to=oneMailbox(oneHeader(headers,'to',{required:true}),'to');
    const subject=oneHeader(headers,'subject',{required:true});
    const cc=oneHeader(headers,'cc');
    const bcc=oneHeader(headers,'bcc');
    if(cc!==undefined||bcc!==undefined)throw blocked('CC/BCC disallowed');
    const contractEvent=oneHeader(headers,'x-lszh-contract-event',{required:true});
    const packageHash=oneHeader(headers,'x-lszh-package-sha256',{required:true});
    const attachments=[];
    function flatten(parts,depth){
      if(depth>5||!Array.isArray(parts)||parts.length>25)
        throw blocked('unexpected Gmail MIME structure');
      for(const part of parts){
        if(!part||typeof part!=='object')
          throw blocked('invalid MIME part');
        if(Array.isArray(part.parts)){
          flatten(part.parts,depth+1);
        }
        const filename=part.filename||'';
        if(!filename)continue;
        attachments.push(part);
      }
    }
    flatten(raw.payload.parts||[],0);
    if(![2,3].includes(attachments.length))
      throw blocked('Gmail attachment count must be two or three');
    let total=0;
    const normalized=[];
    for(const p of attachments){
      if(typeof p.filename!=='string'||!/^TEST_ONLY_[A-Za-z0-9_.-]+\.pdf$/.test(p.filename)||
         p.mimeType!=='application/pdf'||!p.body||
         !Number.isSafeInteger(p.body.size)||p.body.size<10||p.body.size>5_000_000)
        throw blocked('unexpected Gmail file part');
      let encoded=p.body.data;
      if(encoded===undefined){
        const attachmentId=p.body.attachmentId;
        if(typeof attachmentId!=='string'||!MSG.test(attachmentId))
          throw blocked('missing Gmail read-only attachment identifier');
        const response=await getAttachment(messageId,attachmentId);
        encoded=response?.data;
        if(response?.size!==undefined&&response.size!==p.body.size)
          throw blocked('Gmail attachment size mismatch');
      }
      const bytes=mimeBase64url(encoded);
      if(bytes.length!==p.body.size||bytes.subarray(0,5).toString('ascii')!=='%PDF-')
        throw blocked('Gmail PDF byte integrity failure');
      total+=bytes.length;
      if(total>8_000_000)throw blocked('Gmail full message too large');
      normalized.push(Object.freeze({
        filename:p.filename,mimeType:'application/pdf',data:bytes
      }));
    }
    return Object.freeze({
      id:messageId,labelIds:Object.freeze([...raw.labelIds]),
      from,to:Object.freeze([to]),cc:Object.freeze([]),bcc:Object.freeze([]),
      subject,
      headers:Object.freeze({
        'x-lszh-contract-event':contractEvent,
        'x-lszh-package-sha256':packageHash
      }),
      attachments:Object.freeze(normalized)
    });
  }
  return Object.freeze({readSentMessage});
}
module.exports={mimeBase64url,createGmailApiReadOnlyAdapter};
