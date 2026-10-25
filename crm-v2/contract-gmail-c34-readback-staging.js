'use strict';
// C3.4 TEST_ONLY Gmail SENT read-back integration. No Gmail SEND, Make,
// Webhook, network client, OAuth credential or production CRM wiring here.
// Gmail read functions MUST be authenticated server-owned read-only adapters.
// The ledger composer can ONLY run against the local demo Firestore emulator.
const {blocked}=require('./contract-dispatch-release-staging');
const {createGmailApiReadOnlyAdapter}=require('./contract-gmail-api-readonly-staging');
const {createGmailSentEvidenceVerifier}=require('./contract-gmail-evidence-staging');
const {createContractDispatchLedger}=require('./contract-dispatch-ledger-staging');

const EMULATOR_HOST='127.0.0.1:8788';
const DEMO_PROJECT='demo-lszha-c2-20261025';
const MAILBOX=/^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
function allowlist(values,kind){
  if(!Array.isArray(values)||values.length===0||values.length>10||
     values.some(v=>typeof v!=='string'||v.length>254||!MAILBOX.test(v)||
       v.endsWith('.invalid')||v.includes('*')||v!==v.trim())||
     new Set(values).size!==values.length)
    throw blocked('C3.4 '+kind+' exact allowlist missing or malformed');
  return new Set(values);
}
function assertDemoFirestore(db){
  // Do not permit an apparently configured SDK to fall back to Cloud Firestore.
  if(process.env.FIRESTORE_EMULATOR_HOST!==EMULATOR_HOST||
     !db||db.projectId!==DEMO_PROJECT||
     typeof db.collection!=='function'||typeof db.runTransaction!=='function')
    throw blocked('C3.4 requires the actual isolated Firestore demo emulator');
  for(const key of ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID']){
    const value=process.env[key];
    if(value!==undefined&&value!==DEMO_PROJECT)
      throw blocked('C3.4 demo project environment mismatch');
  }
}
function createC34GmailReadOnlyVerifier({
  getMessage,getAttachment,allowedSenders,allowedRecipients
}={}){
  const senders=allowlist(allowedSenders,'sender');
  const recipients=allowlist(allowedRecipients,'recipient');
  if(typeof getMessage!=='function'||typeof getAttachment!=='function')
    throw blocked('C3.4 read-only Gmail credentials adapter missing');
  // Provider data is looked up independently by messageId, not accepted
  // from the Make webhook or its self-declared delivery success.
  const adapter=createGmailApiReadOnlyAdapter({getMessage,getAttachment});
  const verifier=createGmailSentEvidenceVerifier({
    readSentMessage:adapter.readSentMessage,
    allowedSenders:[...senders]
  });
  async function verifyGatewayReceipt({receipt,expected}={}){
    if(!expected||!recipients.has(expected.recipient)||
       !Array.isArray(expected.documentHashes)||
       ![2,3].includes(expected.documentHashes.length))
      return false;
    return verifier.verify({receipt,expected});
  }
  return Object.freeze({verifyGatewayReceipt});
}
function createC34DemoGmailReadbackLedger({
  db,signingSecret,getMessage,getAttachment,
  allowedSenders,allowedRecipients,now=()=>Date.now()
}={}){
  assertDemoFirestore(db);
  if(!Buffer.isBuffer(signingSecret)||signingSecret.length<32||
     typeof now!=='function')
    throw blocked('C3.4 demo signing key or clock missing');
  const trusted=createC34GmailReadOnlyVerifier({
    getMessage,getAttachment,allowedSenders,allowedRecipients
  });
  const ledger=createContractDispatchLedger(db,{
    signingSecret,now,
    verifyGatewayReceipt:trusted.verifyGatewayReceipt,
    // No user-provided "not sent" review can release a reservation.
    verifyManualReview:async()=>false
  });
  async function reconcile(eventId,receipt){
    // This function reads Gmail and updates ONLY demo Firestore. It cannot
    // generate a message or initiate a provider send. Never auto-retry a send.
    const prior=await ledger.inspect(eventId);
    if(!prior||!['reserved','delivery_review'].includes(prior.status))
      throw blocked('C3.4 requires an unresolved, previously reserved attempt');
    return ledger.confirmVerifiedReceipt(eventId,receipt);
  }
  // Readback service is NOT a reservation or dispatch gateway. A separate
  // C3.3 operator preflight alone may create the initial Firestore reservation.
  return Object.freeze({inspect:ledger.inspect,reconcile});
}
module.exports={
  EMULATOR_HOST,DEMO_PROJECT,createC34GmailReadOnlyVerifier,
  createC34DemoGmailReadbackLedger
};
