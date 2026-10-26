'use strict';
const {fault}=require('./contract-acceptance-staging');
const {digest}=require('./offer-contract-package');
function createPortalGateways({codeHook,reserveHook,writeHook,reader,fetchImpl=fetch,recipientPolicy='pilot'}={}){
  if(!['pilot','released_packages'].includes(recipientPolicy))throw fault('GATEWAY_NOT_CONFIGURED',503);
  for(const url of [codeHook,reserveHook,writeHook])if(!/^https:\/\/hook\.eu1\.make\.com\/[A-Za-z0-9]+$/.test(String(url||'').trim()))throw fault('GATEWAY_NOT_CONFIGURED',503);
  async function post(url,body){
    const response=await fetchImpl(url.trim(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(35000)});
    const value=await response.json().catch(()=>null);
    if(!response.ok||value?.ok!==true)throw fault('GATEWAY_UNCONFIRMED',503);
    return value;
  }
  async function sendCode({recipient,code,idempotencyKey}){
    if((recipientPolicy==='pilot'?recipient!=='lars.schulthess@outlook.com':! /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(recipient||''))||!/^\d{8}$/.test(code)||!/^customer_login_[A-Za-z0-9_-]{32}$/.test(idempotencyKey))throw fault('RECIPIENT_NOT_APPROVED',403);
    const receipt=await post(codeHook,{kind:'customer_login',recipient,code,idempotencyKey});
    if(!/^[A-Za-z0-9_-]{4,200}$/.test(receipt.messageId||''))throw fault('GATEWAY_UNCONFIRMED',503);
    return {messageId:receipt.messageId};
  }
  async function reserveId(){const r=await post(reserveHook,{kind:'acceptance_archive_reserve'});if(!/^[A-Za-z0-9_-]{10,180}$/.test(r.fileId||''))throw fault('ARCHIVE_ID_INVALID',503);return r.fileId;}
  async function putVerified(id,bytes,{responseId,sha256}){
    if(!/^response_[a-f0-9]{32}$/.test(responseId)||!Buffer.isBuffer(bytes)||bytes.length>256*1024||digest(bytes)!==sha256)throw fault('EVIDENCE_INTEGRITY_FAILED',409);
    const existing=await reader.inspectEvidence(id);
    if(existing.bytes.length){if(digest(existing.bytes)===sha256)return id;throw fault('EVIDENCE_INTEGRITY_FAILED',409);}
    let failure;
    try{await post(writeHook,{kind:'acceptance_archive_write',fileId:id,responseId,sha256,contentJson:bytes.toString('utf8')});}catch(error){failure=error;}
    const saved=await reader.inspectEvidence(id);
    if(digest(saved.bytes)!==sha256)throw failure||fault('EVIDENCE_INTEGRITY_FAILED',409);
    return id;
  }
  return Object.freeze({sendCode,reserveId,putVerified,readArchivedPdf:reader.readArchivedPdf});
}
module.exports={createPortalGateways};
