'use strict';
const {createContractPackagePublisher,pubKey}=require('./contract-package-publisher');
const {verifyCustomerDocumentSelection}=require('./contract-document-selection');
const {digest}=require('./offer-contract-package');const {fault}=require('./contract-acceptance-staging');
const releaseKey=packageId=>'pilotRelease_'+digest(Buffer.from(packageId));
function createLivePublicationPolicy({transaction,authorizeOperator,now=Date.now}={}){
 if(typeof transaction!=='function'||typeof authorizeOperator!=='function')throw fault('PUBLISHER_NOT_CONFIGURED',503);
 async function verifyRelease({package:pkg,recipient}){
  const r=await transaction(tx=>tx.get(releaseKey(pkg.packageId)));
  if(!r||r.pilotApproved!==true||r.legalTextsApproved!==true||r.retentionApproved!==true||
     r.representativeEmail!==recipient||!r.approvedBy||!Number.isFinite(Date.parse(r.approvedAt))||Date.parse(r.approvedAt)>now()+30000||
     !Number.isFinite(Date.parse(r.expiresAt))||Date.parse(r.expiresAt)<=now())return false;
  try{return verifyCustomerDocumentSelection(pkg,recipient,r);}catch{return false;}
 }
 async function record(pkg,recipient){
  const r=await transaction(tx=>tx.get(pubKey(pkg.packageId)));
  if(!r||r.state!=='sent'||r.recipient!==recipient||r.package.packageSha256!==pkg.packageSha256||
     r.sentEvidence?.source!=='independent_gmail_sent_readback'||r.sentEvidence.verified!==true)throw fault('SENT_EVIDENCE_REQUIRED',409);
  return r;
 }
 async function authorizeIssue({package:pkg,recipient,operatorContext}){
  const user=await authorizeOperator(operatorContext);
  if(user?.verified!==true||!user.email||!await verifyRelease({package:pkg,recipient}))return false;
  await record(pkg,recipient);return true;
 }
 async function verifySentPackage({package:pkg,recipient}){
  const r=await record(pkg,recipient);return {...r.sentEvidence,provider:'gmail'};
 }
 async function issueOptions(pkg,recipient){
  if(!await verifyRelease({package:pkg,recipient}))throw fault('PACKAGE_RELEASE_REQUIRED',403);
  const r=await transaction(tx=>tx.get(releaseKey(pkg.packageId)));
  const expiresInMs=Math.min(48*3600000,Date.parse(r.expiresAt)-now());
  if(!Number.isSafeInteger(expiresInMs)||expiresInMs<60000)throw fault('LINK_EXPIRED',410);
  return {expiresInMs};
 }
 return Object.freeze({verifyRelease,authorizeIssue,verifySentPackage,issueOptions});
}
function createLivePackageBridge({transaction,authorizeOperator,readArchivedPdf,sendOnce,verifySentPackage,acceptanceService,enabled=false,now=Date.now}={}){
 if(typeof acceptanceService?.issue!=='function')throw fault('PUBLISHER_NOT_CONFIGURED',503);
 const policy=createLivePublicationPolicy({transaction,authorizeOperator,now});
 return createContractPackagePublisher({transaction,authorizeOperator,readArchivedPdf,sendOnce,verifySentPackage,
  issueAcceptance:async(pkg,recipient,options)=>acceptanceService.issue(pkg,recipient,{...options,...await policy.issueOptions(pkg,recipient)}),verifyRelease:policy.verifyRelease,enabled,mode:'customer',now});
}
module.exports={createLivePublicationPolicy,createLivePackageBridge,releaseKey};
