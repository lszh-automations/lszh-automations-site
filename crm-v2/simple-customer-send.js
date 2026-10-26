'use strict';
const {digest}=require('./offer-contract-package');
const {pubKey}=require('./contract-package-publisher');
const {fault}=require('./contract-acceptance-staging');
const {mimeBase64url}=require('./contract-gmail-api-readonly-staging');
const invitationKey=id=>'invitationDelivery_'+digest(Buffer.from(id));
function createInvitationDelivery({transaction,publisher,sendOnce,verifySent,portalOrigin,now=Date.now}={}){
 async function deliver(packageId,user){
  const row=await transaction(tx=>tx.get(pubKey(packageId)));
  if(row?.state!=='sent')throw fault('SENT_EVIDENCE_REQUIRED',409);
  const claim=await transaction(async tx=>{const old=await tx.get(invitationKey(packageId));if(old){if(old.packageSha256!==row.package.packageSha256||old.recipient!==row.recipient)throw fault('PUBLICATION_CONFLICT',409);return {old};}
   const current=await tx.get(pubKey(packageId));if(current?.state!=='sent'||current.package.packageSha256!==row.package.packageSha256)throw fault('PUBLICATION_CONFLICT',409);
   const next={state:'preparing',packageId,packageSha256:row.package.packageSha256,recipient:row.recipient,claimedAt:new Date(now()).toISOString(),...(user?.email?{claimedBy:user.email}:{})};tx.create(invitationKey(packageId),next);return {next};});
  if(claim.old)return {state:claim.old.state,mayAutoRetry:false};
  let receipt;
  try{
   const link=await publisher.issueLink(packageId,user),url=portalOrigin+'/#'+link.token,eventId='invitation_'+packageId;
   await transaction(async tx=>{const old=await tx.get(invitationKey(packageId));tx.set(invitationKey(packageId),{...old,state:'delivery_review',urlSha256:digest(Buffer.from(url)),expiresAt:link.expiresAt,eventId});});
   receipt=await sendOnce({kind:'customer_acceptance_invitation',eventId,packageSha256:row.package.packageSha256,recipient:row.recipient,url,offerNumber:row.package.offerNumber});
   if(!/^[A-Za-z0-9_-]{4,200}$/.test(receipt?.messageId||''))throw fault('INVITATION_UNCONFIRMED',409);
   const proof=await verifySent({messageId:receipt.messageId,recipient:row.recipient,eventId,packageSha256:row.package.packageSha256,url});
   if(proof?.verified!==true||proof.messageId!==receipt.messageId)throw fault('INVITATION_UNCONFIRMED',409);
   await transaction(async tx=>{const old=await tx.get(invitationKey(packageId));tx.set(invitationKey(packageId),{...old,state:'sent',source:'independent_gmail_sent_readback',messageId:receipt.messageId,verifiedAt:new Date(now()).toISOString()});});
   return {state:'sent',mayAutoRetry:false};
  }catch{
   await transaction(async tx=>{const old=await tx.get(invitationKey(packageId));tx.set(invitationKey(packageId),{...old,state:'delivery_review',...(receipt?.messageId?{messageId:receipt.messageId}:{})});});
   return {state:'delivery_review',mayAutoRetry:false};
  }
 }
 return Object.freeze({deliver});
}
function createInvitationTransport({webhookUrl,portalOrigin,fetchImpl=fetch}={}){
 if(!/^https:\/\/hook\.eu1\.make\.com\/[A-Za-z0-9]+$/.test(webhookUrl||''))throw fault('INVITATION_NOT_CONFIGURED',503);
 return async body=>{
  if(body.kind!=='customer_acceptance_invitation'||!/^invitation_pkg_[A-Za-z0-9_-]+_r[1-9][0-9]*$/.test(body.eventId||'')||!/^[a-f0-9]{64}$/.test(body.packageSha256||'')||!/^\d{1,10}$/.test(body.offerNumber||'')||!/^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(body.recipient||''))throw fault('INVITATION_INVALID',400);
  const url=new URL(body.url);if(url.origin!==portalOrigin||url.pathname!=='/'||url.search||!/^#[A-Za-z0-9_-]{32,500}$/.test(url.hash)||url.username||url.password)throw fault('INVITATION_INVALID',400);
  const response=await fetchImpl(webhookUrl,{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(30000),body:JSON.stringify(body)});
  const receipt=await response.json().catch(()=>null);
  if(!response.ok||receipt?.ok!==true||receipt.eventId!==body.eventId||receipt.packageSha256!==body.packageSha256||!/^[A-Za-z0-9_-]{4,200}$/.test(receipt.messageId||''))throw fault('INVITATION_UNCONFIRMED',409);
  return {messageId:receipt.messageId};
 };
}
function createInvitationSentVerifier({read}={}){
 return async({messageId,recipient,eventId,packageSha256,url})=>{
  const raw=await read.getMessage(messageId),headers=raw?.payload?.headers||[];
  const header=name=>{const found=headers.filter(h=>h.name?.toLowerCase()===name);if(found.length!==1||/[\r\n]/.test(found[0].value||''))throw fault('INVITATION_UNCONFIRMED',409);return found[0].value;};
  const mailbox=s=>(/^(?:[^<>]+\s)?<([^<>]+)>$/.exec(s)?.[1]||s).trim().toLowerCase();
  if(raw?.id!==messageId||!raw.labelIds?.includes('SENT')||mailbox(header('from'))!=='info@lszh-automations.ch'||mailbox(header('to'))!==recipient||headers.some(h=>['cc','bcc'].includes(h.name?.toLowerCase()))||header('x-lszh-invitation-event')!==eventId||header('x-lszh-package-sha256')!==packageSha256)throw fault('INVITATION_UNCONFIRMED',409);
  let matched=false,nodes=0;
  function walk(part,depth=0){if(!part||++nodes>30||depth>5||part.filename)throw fault('INVITATION_UNCONFIRMED',409);if(part.body?.data){if(part.body.data.length>100000)throw fault('INVITATION_UNCONFIRMED',409);const text=mimeBase64url(part.body.data).toString('utf8');if(part.mimeType==='text/html'&&text.includes('href="'+url+'"'))matched=true;}for(const p of part.parts||[])walk(p,depth+1);}
  walk(raw.payload);if(!matched)throw fault('INVITATION_UNCONFIRMED',409);
  return {verified:true,messageId};
 };
}
module.exports={createInvitationDelivery,createInvitationTransport,createInvitationSentVerifier,invitationKey};
