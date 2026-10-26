'use strict';
// Isolated orchestration only. No network implementation or production imports.
// All adapters are trusted backend dependencies, never browser input.
const {blocked,verifyReleaseManifest,WINDOW_MS}=require('./contract-dispatch-release-staging');
const {validateGmailTestDraft}=require('./contract-gmail-draft-staging');
const {createContractDispatchLedger}=require('./contract-dispatch-ledger-staging');
const FROM='info@lszh-automations.ch';
const TO='lars.schulthess@outlook.com';
const JOB='lszh-crm-c373-contract-send-test';

function createContractTestDispatcher({runtime,db,signingSecret,releaseGate,
  draftBuilder,sendOnce,verifySentEvidence,now=()=>Date.now()}={}){
  if(runtime?.CLOUD_RUN_JOB!==JOB||runtime.K_SERVICE!==undefined||
     runtime.GOOGLE_CLOUD_PROJECT!=='lszh-automations'||
     runtime.CLOUD_RUN_TASK_COUNT!=='1'||runtime.CLOUD_RUN_TASK_INDEX!=='0'||
     runtime.CLOUD_RUN_TASK_ATTEMPT!=='0'||
     runtime.LSZH_CONTRACT_TEST_SEND_ENABLED!=='true'||
     runtime.LSZH_C37_ALLOW_CUSTOMER_MAIL!=='false'||
     typeof releaseGate?.approve!=='function'||
     typeof draftBuilder?.prepare!=='function'||typeof sendOnce!=='function'||
     typeof verifySentEvidence!=='function'||typeof now!=='function')
    throw blocked('isolated test dispatch configuration required');

  const ledger=createContractDispatchLedger(db,{
    signingSecret,now,verifyManualReview:async()=>false,
    verifyGatewayReceipt:async({receipt,expected})=>{
      if(expected.recipient!==TO)return false;
      return (await verifySentEvidence({receipt,expected,approvedSender:FROM}))===true;
    }
  });

  function fresh(manifest){
    const age=now()-Date.parse(manifest.approvedAt);
    if(!Number.isFinite(age)||age < -30000||age>WINDOW_MS)
      throw blocked('test approval expired');
  }

  async function dispatch(pkg,approval){
    // Clone untrusted inputs before the first asynchronous boundary.
    const manifest=structuredClone(await releaseGate.approve(
      structuredClone(pkg),structuredClone(approval)));
    verifyReleaseManifest(manifest,signingSecret);
    if(manifest.recipient!==TO||!manifest.offerId.startsWith('test_'))
      throw blocked('only the designated synthetic test recipient/package is allowed');
    fresh(manifest);
    const draft=structuredClone(await draftBuilder.prepare(structuredClone(manifest)));
    validateGmailTestDraft(draft,manifest);
    fresh(manifest);

    // New, separate transport object. Existing blocked preview is unchanged.
    const payload={kind:'lszh_contract_test_send',sendMode:'test_only',
      from:FROM,to:[TO],cc:[],bcc:[],
      subject:'[TEST_ONLY] LSZH PDF-Transporttest '+manifest.offerNumber,
      html:'<p>Interner PDF-Transporttest. Nur synthetische Dokumente. Kein Angebot, keine Annahme und kein Vertrag.</p>',
      eventId:manifest.eventId,packageSha256:manifest.packageSha256,
      emailHeaders:structuredClone(draft.emailHeaders),
      attachments:structuredClone(draft.attachments)};

    // A durable per-offer lock survives process restarts and revision changes.
    // Never send within a Firestore transaction, whose callback may repeat.
    await ledger.reserve(manifest);
    // Mark uncertain BEFORE invoking the transport: a crash or lost response
    // must never leave a reservation that another worker could resend.
    await ledger.markDeliveryUncertain(manifest.eventId);
    try{
      fresh(manifest);
      // The injected transport must perform ONE request with retries disabled.
      const receipt=structuredClone(await sendOnce(payload));
      return await ledger.confirmVerifiedReceipt(manifest.eventId,receipt);
    }catch{
      // Do not log provider payloads or assume failure means no delivery.
      return Object.freeze({eventId:manifest.eventId,state:'delivery_review',
        transmitted:'unknown',mayAutoRetry:false});
    }
  }
  return Object.freeze({dispatch,inspect:ledger.inspect});
}
module.exports={FROM,TO,JOB,createContractTestDispatcher};
