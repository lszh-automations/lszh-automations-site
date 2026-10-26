'use strict';
const {pubKey}=require('./contract-package-publisher');const {digest}=require('./offer-contract-package');const {fault}=require('./contract-acceptance-staging');
const {invitationKey}=require('./simple-customer-send');
const draftKey=id=>'draftPackage_'+digest(Buffer.from(id));
function createCrmContractActions({transaction,publisher,review,portalOrigin,pilot,reviewEnabled=false,preparation,invitations}={}){
 if(pilot&&(!/^[A-Za-z0-9_-]{1,100}$/.test(pilot.offerId||'')||pilot.recipient!=='lars.schulthess@outlook.com'))throw fault('PILOT_CONFIG_INVALID',503);
 const origin=new URL(portalOrigin);if(origin.protocol!=='https:'||origin.origin!==portalOrigin)throw fault('INVALID_ORIGIN',503);
 async function load(id){
  if(pilot&&id!==pilot.offerId)throw fault('PILOT_OFFER_REJECTED',403);
  const offer=await transaction(tx=>tx.get('crmOffer:'+id));if(!offer)throw fault('OFFER_NOT_FOUND',404);
  const draft=await transaction(tx=>tx.get(draftKey(id)));
  const packageId=offer.contractPackageId||draft?.package?.packageId;
  const publication=packageId?await transaction(tx=>tx.get(pubKey(packageId))):null;
  if(pilot&&[draft,publication].some(row=>row&&(row.recipient!==pilot.recipient||row.package?.offerId!==pilot.offerId||(pilot.packageSha256&&row.package?.packageSha256!==pilot.packageSha256))))throw fault('PILOT_BINDING_REJECTED',409);
  return {offer,draft,publication,packageId};
 }
 async function status(id){const r=await load(id),invitation=r.packageId?await transaction(tx=>tx.get(invitationKey(r.packageId))):null;return {enabled:true,simpleSendEnabled:Boolean(preparation&&invitations),invitationState:invitation?.state||null,hasSendReceipt:Boolean(r.publication?.providerReceipt),reviewEnabled,mayCreateDraft:Boolean(preparation&&!r.draft&&!r.publication&&r.offer.status==='Bereit'&&!r.offer.onlineAcceptance),state:r.offer.onlineAcceptance?.state||r.publication?.state||'missing_package',packageId:r.packageId||null,
  documentCount:r.draft?.package?.documents?.length||r.publication?.package?.documents?.length||0,
  archiveState:r.offer.onlineAcceptance?.archiveState||null,hasDraft:Boolean(r.draft),mayPrepare:Boolean(r.draft&&!r.publication&&r.offer.status==='Bereit')};}
 async function act(id,action,input,user){
  const r=await load(id);
  if(['preview-terms','preview-avv'].includes(action)){if(!preparation)throw fault('PACKAGE_PREPARATION_DISABLED',503);return preparation.previewDocument(id,action.slice(8));}
  if(action==='preview'){if(!preparation)throw fault('PACKAGE_PREPARATION_DISABLED',503);return preparation.preview(id);}
  if(action==='send'){
   if(!preparation||!invitations)throw fault('PACKAGE_PREPARATION_DISABLED',503);
   if(input.documentsReviewed!==true||input.retentionApproved!==true||!['yes','no'].includes(input.avvRequired)||! /^[a-f0-9]{64}$/.test(input.offerSnapshotSha256||''))throw fault('PACKAGE_REVIEW_REQUIRED',400);
   const preview=await preparation.preview(id);if(preview.offerSnapshotSha256!==input.offerSnapshotSha256)throw fault('PREVIEW_CHANGED',409);
   if(r.draft&&r.draft.package.avvRequired!==input.avvRequired)throw fault('PACKAGE_REVIEW_REQUIRED',409);
   if(!r.draft)await preparation.prepare(id,input,user);
   const ready=await load(id);if(!ready.publication)await publisher.prepare(ready.draft.package,ready.draft.recipient,user);
   const result=await publisher.dispatch(ready.packageId,user);
   if(result.state!=='sent')return {...result,invitationState:'not_sent'};
   const delivery=await invitations.deliver(ready.packageId,user);return {...result,invitationState:delivery.state};
  }
  if(action==='check'){
   const receipt=r.publication?.providerReceipt;if(!receipt)throw fault('SENT_EVIDENCE_REQUIRED',409);
   const result=await publisher.reconcile(r.packageId,receipt,user);
   if(invitations){const delivery=await invitations.deliver(r.packageId,user);return {...result,invitationState:delivery.state};}return result;
  }
  if(action==='invite'){if(!invitations)throw fault('INVITATION_NOT_CONFIGURED',503);return invitations.deliver(r.packageId,user);}
  if(action==='draft'){if(!preparation)throw fault('PACKAGE_PREPARATION_DISABLED',503);return preparation.prepare(id,input,user);}if(action==='prepare'){if(!r.draft||r.draft.package.offerId!==id)throw fault('PACKAGE_DRAFT_REQUIRED',409);return publisher.prepare(r.draft.package,r.draft.recipient,user);}
  if(action==='review')return review.approve(id,user);
  if(action==='confirmation')return review.confirm(id,input.messageId,user);
  if(!r.packageId)throw fault('PACKAGE_DRAFT_REQUIRED',409);
  if(action==='dispatch')return publisher.dispatch(r.packageId,user);
  if(action==='reconcile'){const result=await publisher.reconcile(r.packageId,{ok:true,messageId:input.messageId,eventId:r.publication?.package.sendEventId,packageSha256:r.publication?.package.packageSha256},user);if(invitations){const delivery=await invitations.deliver(r.packageId,user);return {...result,invitationState:delivery.state};}return result;}
  if(action==='issue-link'){const link=await publisher.issueLink(r.packageId,user);return {url:portalOrigin+'/#'+link.token,expiresAt:link.expiresAt};}
  throw fault('NOT_FOUND',404);
 }
 return Object.freeze({status,act});
}
async function routeCrmContract({req,res,path,user,enabled,getActions,readJson,reply}={}){
 const m=/^\/api\/records\/offerten\/([A-Za-z0-9_-]{1,100})\/contract(?:\/(preview|preview-terms|preview-avv|send|check|invite|draft|prepare|dispatch|reconcile|issue-link|review|confirmation))?$/.exec(path);
 if(!m)return false;
 if(!user?.email){reply(res,401,{error:'unauthorized'});return true;}
 const action=m[2];
 if(!enabled){reply(res,action?503:200,action?{error:'CONTRACT_ACTIONS_DISABLED'}:{enabled:false,state:'disabled'});return true;}
 if(['preview','preview-terms','preview-avv'].includes(action)){if(req.method!=='GET'){reply(res,405,{error:'METHOD_NOT_ALLOWED'});return true;}reply(res,200,await getActions().act(m[1],action,{},user));return true;}
 if(!action){if(req.method!=='GET'){reply(res,405,{error:'METHOD_NOT_ALLOWED'});return true;}reply(res,200,await getActions().status(m[1]));return true;}
 if(req.method!=='POST'){reply(res,405,{error:'METHOD_NOT_ALLOWED'});return true;}
 const scheme=String(req.headers['x-forwarded-proto']||(req.socket.encrypted?'https':'http')).split(',')[0].trim();
 if(!req.headers.origin||req.headers.origin!==scheme+'://'+req.headers.host){reply(res,403,{error:'ORIGIN_REJECTED'});return true;}
 if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type']||'')){reply(res,415,{error:'INVALID_CONTENT_TYPE'});return true;}
 const body=await readJson(req),messageAction=['reconcile','confirmation'].includes(action),keys=['draft','send'].includes(action)?['avvRequired','documentsReviewed','retentionApproved',...(action==='send'?['offerSnapshotSha256']:[])]:messageAction?['messageId']:[];
 if(Object.keys(body).some(k=>!keys.includes(k))||messageAction&& !/^[A-Za-z0-9_-]{4,200}$/.test(body.messageId||'')){reply(res,400,{error:'INVALID_REQUEST'});return true;}
 const result=await getActions().act(m[1],action,body,user);reply(res,200,result);return true;
}
module.exports={createCrmContractActions,routeCrmContract,draftKey};
