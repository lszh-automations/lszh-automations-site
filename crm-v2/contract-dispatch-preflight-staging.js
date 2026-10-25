'use strict';
// C3.3 STAGING SECURITY PREFLIGHT: validates an operator-approved synthetic
// contract package and atomically reserves its test-only dispatch identity.
// NO SEND PATH: no Gmail/Make/HTTP, no return of mail payload or PDF bytes.
// The future sender must independently validate the ledger reservation.
const {PURPOSE,blocked,verifyReleaseManifest}=require('./contract-dispatch-release-staging');
const {createBlockedMakeGmailEnvelope,verifyEnvelope}=require('./contract-gmail-make-transport-staging');

function createContractC33SecurityPreflight({
  releaseGate,draftBuilder,ledger,signingSecret,allowedRecipients,now=()=>Date.now()
}={}){
  if(!releaseGate||typeof releaseGate.approve!=='function'||
     !draftBuilder||typeof draftBuilder.prepare!=='function'||
     !ledger||typeof ledger.reserve!=='function'||
     typeof ledger.inspect!=='function'||
     !Buffer.isBuffer(signingSecret)||signingSecret.length<32||
     !Array.isArray(allowedRecipients)||allowedRecipients.length===0||
     allowedRecipients.some(v=>typeof v!=='string'||v!==v.toLowerCase()||
       v.includes('*')||v.endsWith('.invalid')||!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(v))||
     typeof now!=='function')
    throw blocked('C3.3 trusted preflight configuration incomplete');

  // The constructor takes trusted, server-provisioned adapters. None are
  // accepted from a browser payload. An operator approval must be checked
  // separately by releaseGate.authorizeOperator.
  async function reserveForReview(pkg,approval){
    const manifest=await releaseGate.approve(pkg,approval);
    verifyReleaseManifest(manifest,signingSecret);
    if(manifest.purpose!==PURPOSE||!allowedRecipients.includes(manifest.recipient))
      throw blocked('test-only scope or recipient refused');
    const draft=await draftBuilder.prepare(manifest);
    const envelope=createBlockedMakeGmailEnvelope(draft,manifest,{
      signingSecret,allowedRecipients,now
    });
    const validation=verifyEnvelope(envelope,manifest);
    if(!envelope.neverSend||envelope.sendMode!=='blocked_preview_only'||
       validation.attachmentCount!==manifest.documents.length||
       validation.attachmentCount!==(manifest.avvRequired==='yes'?3:2))
      throw blocked('invalid blocked preview or missing mandatory attachments');

    // LAST step: a Firestore transaction permanently locks this offer across
    // repeated requests and revisions. Never call any email provider here.
    // An uncertain transaction outcome must be inspected, NEVER retried.
    const reserved=await ledger.reserve(manifest);
    if(!reserved||reserved.state!=='reserved'||
       reserved.eventId!==manifest.eventId||
       reserved.packageId!==manifest.packageId||
       reserved.recipient!==manifest.recipient||
       reserved.documentCount!==validation.attachmentCount)
      throw blocked('dispatch ledger returned inconsistent reservation');

    // Only safe metadata, not envelope or attachment Base64, leaves preflight.
    return Object.freeze({
      eventId:manifest.eventId,packageId:manifest.packageId,
      packageSha256:manifest.packageSha256,attachmentCount:validation.attachmentCount,
      totalBytes:validation.totalBytes,state:'reserved',
      sendPermitted:false,transmitted:false,provider:'NONE',messageId:null
    });
  }
  async function inspectOnly(eventId){
    return ledger.inspect(eventId); // read only; never authorises a retry
  }
  return Object.freeze({reserveForReview,inspectOnly});
}
module.exports={createContractC33SecurityPreflight};
