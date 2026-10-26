'use strict';
const {fault}=require('./contract-acceptance-staging');
function createPackageMakeTransport({webhookUrl,enabled=false,fetchImpl=fetch}={}){
 const valid=/^https:\/\/hook\.eu1\.make\.com\/[A-Za-z0-9]+$/.test(webhookUrl||'');
 if(enabled&&!valid)throw fault('PACKAGE_TRANSPORT_NOT_CONFIGURED',503);
 async function sendOnce(body){
  if(!enabled||!valid)throw fault('PACKAGE_TRANSPORT_DISABLED',503);
  if(body?.kind!=='contract_package_send'||body.sendMode!=='customer'||body.from!=='info@lszh-automations.ch'||
     !Array.isArray(body.to)||body.to.length!==1||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.to[0])||
     !Array.isArray(body.cc)||body.cc.length||!Array.isArray(body.bcc)||body.bcc.length||
     !/^contract_send_pkg_[A-Za-z0-9_-]+_r[1-9][0-9]*$/.test(body.eventId||'')||!/^[a-f0-9]{64}$/.test(body.packageSha256||'')||
     !Array.isArray(body.attachments)||![2,3].includes(body.attachments.length))throw fault('PACKAGE_PAYLOAD_INVALID');
  let total=0;const names=new Set();
  for(const a of body.attachments){
   if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}\.pdf$/.test(a?.filename||'')||a.filename.startsWith('TEST_ONLY_')||names.has(a.filename)||typeof a.data!=='string'||a.data.length>7000000)throw fault('PACKAGE_PAYLOAD_INVALID');
   const bytes=Buffer.from(a.data,'base64');if(bytes.toString('base64')!==a.data||bytes.subarray(0,5).toString()!=='%PDF-'||bytes.length<10||bytes.length>5000000)throw fault('PACKAGE_PAYLOAD_INVALID');total+=bytes.length;names.add(a.filename);
  }
  if(total>8000000)throw fault('PACKAGE_PAYLOAD_INVALID');
  const response=await fetchImpl(webhookUrl,{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(30000),body:JSON.stringify({...body,emailHeaders:[{key:'X-LSZH-Contract-Event',value:body.eventId},{key:'X-LSZH-Package-SHA256',value:body.packageSha256}]})});
  const r=await response.json().catch(()=>null);
  if(!response.ok||r?.ok!==true||r.eventId!==body.eventId||r.packageSha256!==body.packageSha256||! /^[A-Za-z0-9_-]{4,200}$/.test(r.messageId||''))throw fault('PACKAGE_SEND_UNCONFIRMED',409);
  return {ok:true,eventId:r.eventId,packageSha256:r.packageSha256,messageId:r.messageId};
 }
 return Object.freeze({sendOnce});
}
module.exports={createPackageMakeTransport};
