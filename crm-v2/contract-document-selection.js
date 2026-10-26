'use strict';
const catalog=require('./contract-document-catalog.json');
const {verifyOfferPackage}=require('./offer-contract-package');
const {fault}=require('./contract-acceptance-staging');
// Approval is read from a trusted backend record, never browser JSON.
function verifyCustomerDocumentSelection(pkg,recipient,approval){
  verifyOfferPackage(pkg);
  const terms=pkg.documents.find(d=>d.kind==='terms');
  if(!terms||['archiveFileId','version','bytes','sha256'].some(k=>terms[k]!==catalog.terms[k]))throw fault('TERMS_VERSION_NOT_APPROVED',409);
  if(approval?.packageSha256!==pkg.packageSha256||approval.recipient!==recipient||approval.offerId!==pkg.offerId||
     approval.confirmationPolicy!=='explicit_offer_reservation')throw fault('PACKAGE_RELEASE_REQUIRED',403);
  if(pkg.avvRequired==='yes'){
    const avv=pkg.documents.find(d=>d.kind==='avv'),a=approval.customerAvv;
    if(avv.archiveFileId===catalog.avvTemplate.archiveFileId||avv.sha256===catalog.avvTemplate.sha256||!a||
       a.offerId!==pkg.offerId||a.recipient!==recipient||a.archiveFileId!==avv.archiveFileId||a.sha256!==avv.sha256||
       !a.reviewedBy||!Number.isFinite(Date.parse(a.reviewedAt))||
       !Array.isArray(a.completedAnnexes)||a.completedAnnexes.length!==3||['A','B','C'].some(k=>!a.completedAnnexes.includes(k)))
      throw fault('CUSTOMER_AVV_ANNEXES_REQUIRED',409);
  }
  return true;
}
module.exports={verifyCustomerDocumentSelection};
