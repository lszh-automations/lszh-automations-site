'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {inspectLiveAcceptance}=require('../contract-acceptance-live-readiness');
const {captureOfferSnapshot}=require('../offer-dispatch-snapshot');
const {prepareOfferPackage,digest}=require('../offer-contract-package');
function f(){
 const docs=['offer','terms'].map(kind=>({kind,version:'2026-v1',filename:kind+'.pdf',archiveFileId:'private_archive_'+kind,bytes:100,sha256:digest(Buffer.from(kind))}));
 const pkg={...prepareOfferPackage({offerId:'offer_real_1101',offerNumber:'1101',revision:1,offerSnapshotSha256:'b'.repeat(64),documents:docs,avvRequired:'no',avvAnnexesConfirmed:false}),status:'sent'};
 const offer={id:pkg.offerId,number:'1101',title:'Beispielofferte',status:'Versendet',sentTo:'customer@example.com',offerDispatchProviderId:'gmail_message_123'};
 const sentEvidence={source:'independent_gmail_sent_readback',verified:true,eventId:pkg.sendEventId,packageSha256:pkg.packageSha256,messageId:offer.offerDispatchProviderId,recipient:offer.sentTo,verifiedAt:'2026-10-25T20:00:00Z',documentHashes:Object.fromEntries(docs.map(d=>[d.kind,d.sha256]))};
 const release={offerId:offer.id,recipient:offer.sentTo,representativeEmail:offer.sentTo,packageSha256:pkg.packageSha256,pilotApproved:true,legalTextsApproved:true,retentionApproved:true,expiresAt:'2026-10-27T20:00:00Z'};
 return {offer,pkg,sentEvidence,release,now:Date.parse('2026-10-25T21:00:00Z')};
}
test('legacy successful single-PDF send never enables an acceptance link',()=>{
 const x=f();delete x.pkg;delete x.sentEvidence;delete x.release;
 const r=inspectLiveAcceptance(x);assert.equal(r.ready,false);assert.ok(r.blockers.includes('VERSIONED_PACKAGE_REQUIRED'));
});
test('pilot requires exact independent sent documents, recipient, package and explicit time-bounded release',()=>{
 const x=f();assert.equal(inspectLiveAcceptance(x).ready,true);
 for(const change of [v=>v.sentEvidence.documentHashes.terms='c'.repeat(64),v=>v.release.recipient='other@example.com',v=>v.release.expiresAt='2026-10-20',v=>v.release.retentionApproved=false,v=>v.sentEvidence.source='manual_verification',v=>v.offer.offerDispatchProviderId='different_message']){
  const c=structuredClone(x);change(c);assert.equal(inspectLiveAcceptance(c).ready,false);
 }
});
test('dispatch snapshot captures exact bytes and commercial recipient fields, excluding internal lead notes',()=>{
 const claim={id:'offer_1',attemptId:'attempt_1',to:'customer@example.com',offer:{id:'offer_1',number:'1101',title:'Automation',items:[{title:'Setup',mode:'einmalig',qty:1,unitPriceCHF:150}]},recipient:{email:'customer@example.com',company:'Example AG',qualificationNotes:'PRIVATE_INTERNAL',message:'INTERNAL_MESSAGE'}};
 const bytes=Buffer.from('%PDF-'+'.'.repeat(400)),a=captureOfferSnapshot(claim,bytes),b=captureOfferSnapshot(claim,bytes);
 assert.equal(a.pdfSha256,digest(bytes));assert.equal(a.offerSnapshotSha256,b.offerSnapshotSha256);
 assert.equal(a.completeContractPackage,false);assert.doesNotMatch(JSON.stringify(a),/PRIVATE_INTERNAL|INTERNAL_MESSAGE/);
 const changed=captureOfferSnapshot({...claim,recipient:{...claim.recipient,company:'Changed AG'}},bytes);
 assert.notEqual(a.offerSnapshotSha256,changed.offerSnapshotSha256);
});
