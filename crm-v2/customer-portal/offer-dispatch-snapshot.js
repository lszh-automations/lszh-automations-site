'use strict';
const {makeRequirementsMetadata}=require('./make-requirements');
const {digest}=require('./offer-contract-package');
const {existingLines,quoteTotals}=require('./offer-pricing');
function captureOfferSnapshot(claim,pdf){
  if(!claim||!Buffer.isBuffer(pdf)||pdf.length<300||pdf.length>700000||pdf.subarray(0,5).toString()!=='%PDF-'||
     claim.id!==claim.offer?.id||typeof claim.to!=='string'||claim.to!==claim.recipient?.email)throw Error('invalid_dispatch_snapshot');
  const o=claim.offer,r=claim.recipient;
  const snapshot={schemaVersion:1,offerId:claim.id,number:String(o.number),title:o.title||'',description:o.description||'',
    createdAt:o.createdAt||'',validUntil:o.validUntil||'',currency:'CHF',...quoteTotals(existingLines(o)),
    ...makeRequirementsMetadata(claim.makeRequirementsVersion),
    recipient:Object.fromEntries(['email','company','name','contactName','street','postalCode','city','country'].map(k=>[k,r[k]||'']))};
  return {schemaVersion:1,kind:'LEGACY_SINGLE_OFFER_PDF',attemptId:claim.attemptId,offerId:claim.id,recipient:claim.to,
    snapshot,offerSnapshotSha256:digest(Buffer.from(JSON.stringify(snapshot))),pdfSha256:digest(pdf),pdfBytes:pdf.length,
    completeContractPackage:false};
}
module.exports={captureOfferSnapshot};
