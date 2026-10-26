'use strict';
const {prepareOfferPackage,digest,verifyDocumentBytes}=require('./offer-contract-package');
const {MAKE_REQUIREMENTS_VERSION,makeRequirements,makeRequirementsMetadata}=require('./make-requirements');
const {makePdf}=require('./offer-pdf');
const {captureOfferSnapshot}=require('./offer-dispatch-snapshot');
const {verifyCustomerDocumentSelection}=require('./contract-document-selection');
const {releaseKey}=require('./contract-live-package-bridge');
const {fault}=require('./contract-acceptance-staging');
const catalog=require('./contract-document-catalog.json');
const draftKey=id=>'draftPackage_'+digest(Buffer.from(id));
function zurichDeadline(date){
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return NaN;
 const noon=Date.parse(date+'T12:00:00Z');
 if(!Number.isFinite(noon)||new Date(noon).toISOString().slice(0,10)!==date)return NaN;
 const zone=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Zurich',timeZoneName:'shortOffset'}).formatToParts(noon).find(p=>p.type==='timeZoneName').value;
 const offset=/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(zone);
 if(!offset)return NaN;
 const minutes=(Number(offset[2])*60+Number(offset[3]||0))*(offset[1]==='+'?1:-1);
 return Date.parse(date+'T23:59:59Z')-minutes*60000;
}
function createCustomerPackagePreparation({transaction,authorizeOperator,archivePdf,readArchivedPdf,now=Date.now}={}){
 if([transaction,authorizeOperator,archivePdf,readArchivedPdf].some(f=>typeof f!=='function'))throw fault('PACKAGE_PREPARATION_DISABLED',503);
 async function binding(tx,id){
  const offer=await tx.get('crmOffer:'+id);
  if(!offer||offer.status!=='Bereit'||offer.onlineAcceptance||offer.contractPackageId||['sending','manual_review','confirmed'].includes(offer.offerDispatchState))throw fault('OFFER_NOT_ELIGIBLE',409);
  const lead=offer.leadId?await tx.get('crmLead:'+offer.leadId):null;
  const customer=offer.customerId?await tx.get('crmCustomer:'+offer.customerId):null;
  const person=lead?.email?lead:customer,recipient=String(person?.email||'').trim().toLowerCase();
  if(!/^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(recipient))throw fault('CRM_BINDING_INVALID',409);
  // A prepared legacy package retains its original PDF and snapshot semantics.
  const existing=await tx.get(draftKey(id));
  const makeRequirementsVersion=existing?existing.package.makeRequirementsVersion:MAKE_REQUIREMENTS_VERSION;
  const to={...person,email:recipient},saved={...offer,id},pdf=makePdf(saved,to,{makeRequirementsVersion,legacyWordmark:existing?.package?.documents?.find(d=>d.kind==='offer')?.version==='r1'});
  const snapshot=captureOfferSnapshot({id,offer:saved,recipient:to,to:recipient,attemptId:'package_preparation',makeRequirementsVersion},pdf);
  const validUntil=zurichDeadline(offer.validUntil);
  if(!Number.isFinite(validUntil)||validUntil<=now())throw fault('OFFER_EXPIRED',409);
  return {offer:saved,recipient,pdf,snapshot,validUntil,makeRequirementsVersion};
 }
 async function prepare(id,input,user){
  const operator=await authorizeOperator(user);
  if(operator?.verified!==true||!operator.email)throw fault('OPERATOR_REQUIRED',403);
  if(input?.documentsReviewed!==true||input.retentionApproved!==true||!['yes','no'].includes(input.avvRequired))throw fault('PACKAGE_REVIEW_REQUIRED',400);
  // A customer AVV must already have been independently reviewed in the backend.
  // The public/internal request can never supply annex approval claims.
  const initial=await transaction(async tx=>{
   const b=await binding(tx,id),draft=await tx.get(draftKey(id));
   const avv=input.avvRequired==='yes'?await tx.get('customerAvv_'+digest(Buffer.from(id))):null;
   if(draft)throw fault('PACKAGE_ALREADY_PREPARED',409);
   if(input.avvRequired==='yes'&&(!avv||avv.offerId!==id||avv.recipient!==b.recipient||!avv.document))throw fault('CUSTOMER_AVV_ANNEXES_REQUIRED',409);
   return {...b,avv};
  });
  if(input.offerSnapshotSha256&&input.offerSnapshotSha256!==initial.snapshot.offerSnapshotSha256)throw fault('PREVIEW_CHANGED',409);
  const terms={kind:'terms',...catalog.terms};
  verifyDocumentBytes(terms,Buffer.from(await readArchivedPdf(terms.archiveFileId,terms)));
  if(initial.avv)verifyDocumentBytes(initial.avv.document,Buffer.from(await readArchivedPdf(initial.avv.document.archiveFileId,initial.avv.document)));
  // Claim before uploading. A lost provider response is never blindly retried.
  const claimKey='packagePreparation_'+digest(Buffer.from(id));
  await transaction(async tx=>{const c=await binding(tx,id),old=await tx.get(claimKey),draft=await tx.get(draftKey(id));
   if(old||draft||c.snapshot.offerSnapshotSha256!==initial.snapshot.offerSnapshotSha256)throw fault('PUBLICATION_CONFLICT',409);
   tx.create(claimKey,{state:'archive_pending',recipient:c.recipient,snapshotSha256:c.snapshot.offerSnapshotSha256,by:operator.email,at:new Date(now()).toISOString()});
  });
  const filename='Offerte_'+initial.offer.number+'.pdf';
  const fileId=await archivePdf({offerId:id,filename,bytes:initial.pdf,sha256:digest(initial.pdf)});
  const offerDoc={kind:'offer',version:'r1_wordmark_20261026',archiveFileId:fileId,filename,bytes:initial.pdf.length,sha256:digest(initial.pdf)};
  verifyDocumentBytes(offerDoc,Buffer.from(await readArchivedPdf(fileId,offerDoc)));
  const pkg=prepareOfferPackage({offerId:id,offerNumber:String(initial.offer.number),revision:1,offerSnapshotSha256:initial.snapshot.offerSnapshotSha256,avvRequired:input.avvRequired,avvAnnexesConfirmed:input.avvRequired==='yes',...makeRequirementsMetadata(initial.makeRequirementsVersion),documents:[offerDoc,terms,...(initial.avv?[initial.avv.document]:[])]});
  const at=new Date(now()).toISOString(),approval={pilotApproved:true,legalTextsApproved:true,retentionApproved:true,offerId:id,recipient:initial.recipient,representativeEmail:initial.recipient,packageSha256:pkg.packageSha256,confirmationPolicy:'explicit_offer_reservation',approvedBy:operator.email,approvedAt:at,expiresAt:new Date(Math.min(initial.validUntil,now()+48*3600000)).toISOString(),...(initial.avv?{customerAvv:initial.avv}: {})};
  verifyCustomerDocumentSelection(pkg,initial.recipient,approval);
  await transaction(async tx=>{const c=await binding(tx,id),draft=await tx.get(draftKey(id)),claim=await tx.get(claimKey);
   if(draft||claim?.state!=='archive_pending'||c.snapshot.offerSnapshotSha256!==initial.snapshot.offerSnapshotSha256)throw fault('PUBLICATION_CONFLICT',409);
   tx.create(draftKey(id),{package:pkg,recipient:initial.recipient,preparedBy:operator.email,preparedAt:at});
   tx.create(releaseKey(pkg.packageId),approval);tx.set(claimKey,{...claim,state:'complete',archiveFileId:fileId,packageId:pkg.packageId});
  });
  return {state:'draft',packageId:pkg.packageId,documentCount:pkg.documents.length,recipient:initial.recipient};
 }
 async function preview(id){return transaction(async tx=>{const b=await binding(tx,id),avv=await tx.get('customerAvv_'+digest(Buffer.from(id)));return {recipient:b.recipient,offerNumber:String(b.offer.number),title:b.offer.title,offerSnapshotSha256:b.snapshot.offerSnapshotSha256,makeRequirements:makeRequirements(b.makeRequirementsVersion),documents:['Offerte_'+b.offer.number+'.pdf',catalog.terms.filename],avvReady:Boolean(avv&&avv.offerId===id&&avv.recipient===b.recipient&&avv.document),avvFilename:avv?.document?.filename||null};});}
 async function previewDocument(id,kind){
  const selected=await transaction(async tx=>{const b=await binding(tx,id);if(kind==='terms')return catalog.terms;const avv=await tx.get('customerAvv_'+digest(Buffer.from(id)));if(kind!=='avv'||avv?.offerId!==id||avv.recipient!==b.recipient||!avv.document)throw fault('CUSTOMER_AVV_ANNEXES_REQUIRED',409);return avv.document;});
  const bytes=Buffer.from(await readArchivedPdf(selected.archiveFileId,selected));verifyDocumentBytes(selected,bytes);return {filename:selected.filename,data:bytes.toString('base64')};
 }
 return Object.freeze({prepare,preview,previewDocument});
}
function createPackageArchiveGateway({webhookUrl,fetchImpl=fetch}={}){
 if(!/^https:\/\/hook\.eu1\.make\.com\/[A-Za-z0-9]+$/.test(webhookUrl||''))throw fault('PACKAGE_PREPARATION_DISABLED',503);
 return async({offerId,filename,bytes,sha256})=>{
  if(!Buffer.isBuffer(bytes)||bytes.length>700000||digest(bytes)!==sha256)throw fault('DOCUMENT_INTEGRITY_FAILED',409);
  const response=await fetchImpl(webhookUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'contract_pdf_archive',offerId,filename,sha256,data:bytes.toString('base64')}),redirect:'error',signal:AbortSignal.timeout(35000)});
  const value=await response.json().catch(()=>null);
  if(!response.ok||value?.ok!==true||!/^[A-Za-z0-9_-]{10,180}$/.test(value.fileId||''))throw fault('ARCHIVE_UNCONFIRMED',503);
  return value.fileId;
 };
}
module.exports={createCustomerPackagePreparation,createPackageArchiveGateway,zurichDeadline};
