'use strict';
// Side-effect-free readiness check. A legacy offer_send receipt never proves a contract package.
const {verifyOfferPackage}=require('./offer-contract-package');
function inspectLiveAcceptance({offer,pkg,sentEvidence,release,now=Date.now()}={}){
  const blockers=[];
  if(!offer||offer.status!=='Versendet')blockers.push('OFFER_NOT_SENT');
  if(offer?.onlineAcceptance)blockers.push('RESPONSE_ALREADY_RECORDED');
  if(!offer||String(offer.title||'').startsWith('TEST_ONLY')||String(offer.id||'').startsWith('test_'))blockers.push('REAL_OFFER_REQUIRED');
  let valid=false;try{verifyOfferPackage(pkg);valid=true;}catch{blockers.push('VERSIONED_PACKAGE_REQUIRED');}
  if(valid){
    if(pkg.offerId!==offer?.id||pkg.status!=='sent'||pkg.offerNumber!==String(offer?.number))blockers.push('PACKAGE_OFFER_MISMATCH');
    if(pkg.documents.some(d=>d.filename.startsWith('TEST_ONLY_')||d.version.includes('TEST_ONLY')))blockers.push('REAL_DOCUMENTS_REQUIRED');
    if(!sentEvidence||sentEvidence.packageSha256!==pkg.packageSha256||sentEvidence.eventId!==pkg.sendEventId||
       sentEvidence.messageId!==offer?.offerDispatchProviderId||sentEvidence.recipient!==offer?.sentTo||
       sentEvidence.source!=='independent_gmail_sent_readback'||sentEvidence.verified!==true||
       !Number.isFinite(Date.parse(sentEvidence.verifiedAt))||Date.parse(sentEvidence.verifiedAt)>now+30000||
       pkg.documents.some(d=>sentEvidence.documentHashes?.[d.kind]!==d.sha256)||
       Object.keys(sentEvidence.documentHashes||{}).length!==pkg.documents.length)blockers.push('EXACT_SENT_PACKAGE_PROOF_REQUIRED');
  }
  if(!release||release.offerId!==offer?.id||release.recipient!==offer?.sentTo||release.packageSha256!==pkg?.packageSha256||
     release.pilotApproved!==true||release.legalTextsApproved!==true||release.retentionApproved!==true||
     release.representativeEmail!==offer?.sentTo||!Number.isFinite(Date.parse(release.expiresAt))||Date.parse(release.expiresAt)<=now)
    blockers.push('EXPLICIT_PILOT_RELEASE_REQUIRED');
  return Object.freeze({ready:blockers.length===0,blockers:Object.freeze([...new Set(blockers)]),
    offerId:offer?.id||null,packageId:valid?pkg.packageId:null,mode:'preparation_only',sendsMail:false});
}
module.exports={inspectLiveAcceptance};
