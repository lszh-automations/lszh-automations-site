'use strict';
// TEST FIXTURE GENERATOR; not actual archived/byte-verified PDFs.
const crypto=require('node:crypto');
const {contractManifestDigest}=require('../../syntheticContractFreeze');
const rev={offer:'revSyntheticOffer0001',terms:'revSyntheticTerms0001',
 avv:'revSyntheticAVV000001'};
function mockFrozenContract(original){
 const state=structuredClone(original);
 const kinds=['offer','terms',...(state.avvRequired?['avv']:[])];
 const documents={};
 for(const kind of kinds){
  documents[kind]={driveFileId:state.documents[kind].driveFileId,
   revisionId:rev[kind],sha256:state.documents[kind].sha256,
   sizeBytes:128,mimeType:'application/pdf'};
 }
 const manifest={schema:'LSZH_SYNTHETIC_CONTRACT_MANIFEST_V1',testOnly:true,
  fixtureId:state.fixtureId,airtableRecordId:state.airtableRecordId,
  bindingFingerprint:state.airtableBinding.fingerprint,
  offerNumber:state.offerNumber,
  recipientSha256:crypto.createHash('sha256').update(state.recipientEmail).digest('hex'),
  validUntil:state.validUntil,termsVersion:state.termsVersion,
  avvRequired:state.avvRequired,avvVersion:state.avvRequired?state.avvVersion:null,
  documents};
 const at='2026-10-15T11:00:00.000Z';
 const manifestHash=contractManifestDigest(manifest);
 state.contractManifestHash=manifestHash;
 state.contractFrozenAt=at;
 state.contractManifestVersion=1;
 return {state,freeze:{testOnly:true,fixtureId:state.fixtureId,
  manifest,manifestHash,frozenAt:at}};
}
module.exports={mockFrozenContract};
