'use strict';
// Backend-only internal review. No customer input flags, outgoing mail or automatic CRM win.
const {key}=require('./contract-acceptance-store-staging');
const {digest,nextOfferPackageState}=require('./offer-contract-package');
const {fault}=require('./contract-acceptance-staging');
function createAcceptanceReview({transaction,authorizeOperator,verifyWrittenConfirmation,enabled=false,now=Date.now}={}){
  if(typeof transaction!=='function'||typeof authorizeOperator!=='function'||typeof verifyWrittenConfirmation!=='function')throw fault('REVIEW_NOT_CONFIGURED',503);
  const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  async function allow(context){
    if(!enabled)throw fault('REVIEW_NOT_RELEASED',503);
    const operator=await authorizeOperator(context);
    if(!operator||operator.verified!==true||typeof operator.email!=='string'||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(operator.email))throw fault('OPERATOR_REQUIRED',403);
    return operator.email;
  }
  async function read(tx,offerId){
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(offerId||''))throw fault('INVALID_OFFER_ID');
    const offer=await tx.get('crmOffer:'+offerId),a=offer?.onlineAcceptance;
    if(!a||offer.status!=='Versendet')throw fault('RESPONSE_NOT_FOUND',409);
    const record=await tx.get(key('package',a.packageId));
    const evidence=await tx.get(key('response',a.packageId));
    const archive=await tx.get('archive_'+a.responseId);
    if(!record||!evidence||evidence.responseId!==a.responseId||record.package.offerId!==offerId||
       a.packageSha256!==record.package.packageSha256||evidence.packageSha256!==a.packageSha256||
       archive?.state!=='complete'||archive.evidenceSha256!==digest(Buffer.from(canonical(evidence)))||
       archive.archiveFileId!==a.archiveFileId||a.archiveState!=='complete')throw fault('ARCHIVED_RESPONSE_REQUIRED',409);
    return {offer,a,record,evidence};
  }
  async function approve(offerId,context){
    const operator=await allow(context);
    return transaction(async tx=>{
      const r=await read(tx,offerId),auditId='review_'+r.a.responseId;
      const existing=await tx.get(auditId);if(existing)throw fault('REVIEW_ALREADY_RECORDED',409);
      if(r.a.state!=='customer_response_recorded')throw fault('REVIEW_STATE_CONFLICT',409);
      const pkg=nextOfferPackageState(r.record.package,'approve_internal_review',{operatorApproved:true});
      const at=new Date(now()).toISOString();
      tx.create(auditId,{kind:'INTERNAL_REVIEW',responseId:r.a.responseId,packageSha256:pkg.packageSha256,operator,approvedAt:at});
      tx.set(key('package',pkg.packageId),{...r.record,package:pkg});
      tx.set('crmOffer:'+offerId,{...r.offer,onlineAcceptance:{...r.a,state:pkg.status,reviewRequired:false,reviewedBy:operator,reviewedAt:at}});
      return {state:pkg.status,confirmationStillRequired:true};
    });
  }
  async function confirm(offerId,messageId,context){
    const operator=await allow(context);
    if(!/^[A-Za-z0-9_-]{4,200}$/.test(messageId||''))throw fault('CONFIRMATION_PROOF_REQUIRED',409);
    const before=await transaction(tx=>read(tx,offerId));
    const proof=await verifyWrittenConfirmation({messageId,package:structuredClone(before.record.package),recipient:before.evidence.recipient});
    if(proof?.verified!==true||proof.messageId!==messageId||proof.packageSha256!==before.a.packageSha256||
       proof.recipient!==before.evidence.recipient||!/^([a-f0-9]{64})$/.test(proof.confirmationSha256||'')||
       !Number.isFinite(Date.parse(proof.sentAt))||Date.parse(proof.sentAt)>now()+30000||
       Date.parse(proof.sentAt)<Date.parse(before.a.reviewedAt)||!Number.isFinite(Date.parse(before.a.reviewedAt)))throw fault('CONFIRMATION_PROOF_REQUIRED',409);
    return transaction(async tx=>{
      const r=await read(tx,offerId),auditId='confirmation_'+r.a.responseId;
      const existing=await tx.get(auditId);
      if(existing||r.a.state!=='awaiting_lszh_confirmation'||r.a.packageSha256!==before.a.packageSha256||r.a.responseId!==before.a.responseId)
        throw fault('REVIEW_STATE_CONFLICT',409);
      const pkg=nextOfferPackageState(r.record.package,'record_written_confirmation',{confirmationSentVerified:true,messageId,confirmationSha256:proof.confirmationSha256});
      const at=new Date(now()).toISOString();
      tx.create(auditId,{kind:'WRITTEN_LSZH_CONFIRMATION',responseId:r.a.responseId,packageSha256:pkg.packageSha256,messageId,
        confirmationSha256:proof.confirmationSha256,operator,recordedAt:at,sentAt:proof.sentAt});
      tx.set(key('package',pkg.packageId),{...r.record,package:pkg});
      tx.set('crmOffer:'+offerId,{...r.offer,onlineAcceptance:{...r.a,state:pkg.status,confirmationMessageId:messageId,
        confirmationSha256:proof.confirmationSha256,confirmedAt:at}});
      return {state:pkg.status,crmWinStillManual:true};
    });
  }
  return Object.freeze({approve,confirm});
}
module.exports={createAcceptanceReview};
