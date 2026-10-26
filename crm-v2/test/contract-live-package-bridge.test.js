'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createLivePublicationPolicy,releaseKey}=require('../contract-live-package-bridge');
const {createProductionDocumentReader}=require('../contract-production-document-reader');
const {prepareOfferPackage}=require('../offer-contract-package');
const {pubKey}=require('../contract-package-publisher');
const catalog=require('../contract-document-catalog.json');
test('production reader restricts templates and originals to their respective archive folders',async()=>{
 const calls=[];const reader=createProductionDocumentReader({archiveForFolder:folder=>({readArchivedPdf:async(id)=>{calls.push({folder,id});return Buffer.from('synthetic');}})});
 await reader.readArchivedPdf(catalog.terms.archiveFileId,catalog.terms);
 const offer={kind:'offer',archiveFileId:'offer_archive_123456'};await reader.readArchivedPdf(offer.archiveFileId,offer);
 assert.deepEqual(calls.map(v=>v.folder),[catalog.sourceFolderId,catalog.sentOriginalsFolderId]);
 await assert.rejects(reader.readArchivedPdf(catalog.avvTemplate.archiveFileId,{kind:'avv',...catalog.avvTemplate}),{code:'CUSTOMER_AVV_ANNEXES_REQUIRED'});
 assert.equal(calls.length,2);
});
test('live policy consumes stored pilot releases and independently verified publications, never browser approval flags',async()=>{
 const pkg={...prepareOfferPackage({offerId:'offer_1101',offerNumber:'1101',revision:1,offerSnapshotSha256:'d'.repeat(64),avvRequired:'no',avvAnnexesConfirmed:false,documents:[{kind:'offer',version:'v1',archiveFileId:'offer_archive_123456',bytes:999,sha256:'a'.repeat(64),filename:'Offer.pdf'},catalog.terms]}),status:'sent'};
 const recipient='customer@example.com',rows=new Map();
 const policy=createLivePublicationPolicy({transaction:fn=>fn({get:async id=>rows.get(id)||null}),authorizeOperator:async()=>({verified:true,email:'operator@example.com'}),now:()=>Date.parse('2026-10-25T21:00:00Z')});
 assert.equal(await policy.authorizeIssue({package:pkg,recipient,operatorContext:{pilotApproved:true}}),false);
 rows.set(releaseKey(pkg.packageId),{packageSha256:pkg.packageSha256,offerId:pkg.offerId,recipient,representativeEmail:recipient,confirmationPolicy:'explicit_offer_reservation',pilotApproved:true,legalTextsApproved:true,retentionApproved:true,approvedBy:'operator@example.com',approvedAt:'2026-10-25T20:00:00Z',expiresAt:'2026-10-26T20:00:00Z'});
 await assert.rejects(policy.authorizeIssue({package:pkg,recipient,operatorContext:{}}),{code:'SENT_EVIDENCE_REQUIRED'});
 rows.set(pubKey(pkg.packageId),{package:pkg,recipient,state:'sent',sentEvidence:{verified:true,source:'independent_gmail_sent_readback',messageId:'synthetic_message'}});
 assert.equal(await policy.authorizeIssue({package:pkg,recipient,operatorContext:{}}),true);
 assert.equal((await policy.verifySentPackage({package:pkg,recipient})).provider,'gmail');
});

test('invitation lifetime is capped at the independently stored package release',async()=>{
 const now=Date.parse('2026-10-25T21:00:00Z');
 const pkg=prepareOfferPackage({offerId:'offer_1101',offerNumber:'1101',revision:1,offerSnapshotSha256:'d'.repeat(64),avvRequired:'no',avvAnnexesConfirmed:false,documents:[{kind:'offer',version:'v1',archiveFileId:'offer_archive_123456',bytes:999,sha256:'a'.repeat(64),filename:'Offer.pdf'},catalog.terms]});
 const row={packageSha256:pkg.packageSha256,offerId:pkg.offerId,recipient:'c@example.com',representativeEmail:'c@example.com',confirmationPolicy:'explicit_offer_reservation',pilotApproved:true,legalTextsApproved:true,retentionApproved:true,approvedBy:'operator@example.com',approvedAt:'2026-10-25T20:00:00Z',expiresAt:'2026-10-25T22:00:00Z'};
 const policy=createLivePublicationPolicy({transaction:fn=>fn({get:async()=>row}),authorizeOperator:async()=>null,now:()=>now});
 assert.equal((await policy.issueOptions(pkg,'c@example.com')).expiresInMs,3600000);
 row.expiresAt='2026-10-25T21:00:30Z';await assert.rejects(policy.issueOptions(pkg,'c@example.com'),{code:'LINK_EXPIRED'});
 row.expiresAt='2026-11-01T21:00:00Z';assert.equal((await policy.issueOptions(pkg,'c@example.com')).expiresInMs,48*3600000);
});


test('wordmark release keeps previously approved terms readable and still rejects every blank AVV template',async()=>{
 const calls=[],reader=createProductionDocumentReader({archiveForFolder:folder=>({readArchivedPdf:async(id)=>{calls.push(id);return Buffer.from('synthetic');}})});
 for(const terms of [catalog.terms,...catalog.previousTerms])await reader.readArchivedPdf(terms.archiveFileId,terms);
 assert.equal(calls.length,2);
 const old=catalog.previousTerms[0];await assert.rejects(reader.readArchivedPdf(old.archiveFileId,{...old,sha256:'f'.repeat(64)}),{code:'TERMS_VERSION_NOT_APPROVED'});
 for(const t of [catalog.avvTemplate,...catalog.previousAvvTemplates])await assert.rejects(reader.readArchivedPdf(t.archiveFileId,{kind:'avv',...t}),{code:'CUSTOMER_AVV_ANNEXES_REQUIRED'});
});
