'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {prepareOfferPackage}=require('../offer-contract-package');
const catalog=require('../contract-document-catalog.json');const {verifyCustomerDocumentSelection}=require('../contract-document-selection');
function fixture(avv='no',template=false){
 const doc=template?{kind:'avv',version:catalog.avvTemplate.version,archiveFileId:catalog.avvTemplate.archiveFileId,sha256:catalog.avvTemplate.sha256,bytes:catalog.avvTemplate.bytes,filename:'AVV.pdf'}:{kind:'avv',version:'customer_v1',archiveFileId:'customer_avv_123456',sha256:'c'.repeat(64),bytes:999,filename:'AVV.pdf'};
 const pkg=prepareOfferPackage({offerId:'offer_1101',offerNumber:'1101',revision:1,offerSnapshotSha256:'d'.repeat(64),avvRequired:avv,avvAnnexesConfirmed:avv==='yes',documents:[{kind:'offer',version:'v1',archiveFileId:'offer_archive_123456',bytes:999,sha256:'a'.repeat(64),filename:'Offer.pdf'},catalog.terms,...(avv==='yes'?[doc]:[])]});
 const recipient='customer@example.com',approval={packageSha256:pkg.packageSha256,offerId:pkg.offerId,recipient,confirmationPolicy:'explicit_offer_reservation',customerAvv:{offerId:pkg.offerId,recipient,archiveFileId:doc.archiveFileId,sha256:doc.sha256,completedAnnexes:['A','B','C'],reviewedBy:'operator@example.com',reviewedAt:'2026-10-25T20:00:00Z'}};
 return {pkg,recipient,approval};
}
test('fixed business terms accepted only with package-specific release and explicit offer reservation',()=>{
 const f=fixture();assert.equal(verifyCustomerDocumentSelection(f.pkg,f.recipient,f.approval),true);
 assert.throws(()=>verifyCustomerDocumentSelection(f.pkg,f.recipient,{...f.approval,confirmationPolicy:'immediate_acceptance'}),{code:'PACKAGE_RELEASE_REQUIRED'});
});
test('blank AVV framework is blocked even if caller claims all annexes completed',()=>{
 const f=fixture('yes',true);assert.throws(()=>verifyCustomerDocumentSelection(f.pkg,f.recipient,f.approval),{code:'CUSTOMER_AVV_ANNEXES_REQUIRED'});
});
test('customer AVV requires all three matching annex approvals',()=>{
 const f=fixture('yes');assert.equal(verifyCustomerDocumentSelection(f.pkg,f.recipient,f.approval),true);
 for(const a of [{...f.approval.customerAvv,recipient:'other@example.com'},{...f.approval.customerAvv,completedAnnexes:['A','B']},{...f.approval.customerAvv,sha256:'b'.repeat(64)}])assert.throws(()=>verifyCustomerDocumentSelection(f.pkg,f.recipient,{...f.approval,customerAvv:a}),{code:'CUSTOMER_AVV_ANNEXES_REQUIRED'});
});
