'use strict';
// Shared OFFLINE data contract for proposed named Firestore STAGING database.
// No SDK, credentials, network, cloud writes, or route wiring.
const TARGET=Object.freeze({projectId:'lszh-automations',databaseId:'lszh-offers-staging',region:'europe-west6'});
const COLLECTION='stagingOfferFixtures';
const SCHEMA_VERSION=1;
const ID_RE=/^[A-Za-z0-9_-]{10,100}$/;
function documentPath(id){
  if(typeof id!=='string'||!ID_RE.test(id))throw new Error('Invalid staging fixture ID');
  return `${COLLECTION}/${id}`;
}
function isStagingPath(value){
  if(typeof value!=='string')return false;
  const parts=value.split('/');
  return parts.length===2&&parts[0]===COLLECTION&&ID_RE.test(parts[1]);
}
function blockedFixture({fixtureId,offer,documents}){
  // A locally prepared document must NEVER be issuable merely by importing it.
  return {
    schemaVersion:SCHEMA_VERSION,
    fixtureId,offerNumber:offer.offer_number,
    status:'TEST_DRAFT_NOT_SENT',
    recipientEmail:'lars@lszh-automations.ch',
    company:offer.company,contactName:offer.contact_name,
    validUntil:offer.valid_until,
    expiresAt:null, // Set only upon a separately approved issuance; Zurich DST must be handled then.
    termsVersion:offer.contract_version,
    avvRequired:offer.avv_required==='Ja',
    avvVersion:offer.avv_required==='Ja'?offer.avv_version:null,
    setupCHF:offer.amount_setup_chf,monthlyCareCHF:offer.amount_care_chf_monthly,
    documents,
    tokenHash:null,
    acceptedAt:null,
    acceptanceEvidence:null,
    reconciliationStatus:'NOT_STARTED',
    testOnly:true,legallyApproved:false,acceptanceEnabled:false,
    deliveryEnabled:false,deliveryConfirmed:false,
    archiveVerified:false,requiresManualReview:true
  };
}
module.exports={TARGET,COLLECTION,SCHEMA_VERSION,documentPath,isStagingPath,blockedFixture};
