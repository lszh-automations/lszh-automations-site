'use strict';
// Backend orchestration, disabled by default. Every external operation is injected.
const {verifyOfferPackage,verifyDocumentBytes,nextOfferPackageState,digest}=require('./offer-contract-package');
const {makePdf}=require('./offer-pdf');const {renderOfferEmail}=require('./offer-mail');
const {captureOfferSnapshot}=require('./offer-dispatch-snapshot');
const {fault}=require('./contract-acceptance-staging');
const pubKey=id=>'publication_'+digest(Buffer.from(id)),lockKey=id=>'publicationLock_'+digest(Buffer.from(id));
function createContractPackagePublisher({transaction,readArchivedPdf,authorizeOperator,verifyRelease,
  sendOnce,verifySentPackage,issueAcceptance,enabled=false,mode='customer',now=Date.now}={}){
  if(!['customer','test'].includes(mode)||[transaction,readArchivedPdf,authorizeOperator,verifyRelease,sendOnce,verifySentPackage,issueAcceptance].some(f=>typeof f!=='function'))throw fault('PUBLISHER_NOT_CONFIGURED',503);
  async function operator(context){
    if(!enabled)throw fault('PUBLISHER_NOT_RELEASED',503);
    const p=await authorizeOperator(context);
    if(p?.verified!==true||! /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email||''))throw fault('OPERATOR_REQUIRED',403);
    return p.email;
  }
  async function documents(pkg){
    const out=[];
    for(const d of pkg.documents){const bytes=Buffer.from(await readArchivedPdf(d.archiveFileId,structuredClone(d)));verifyDocumentBytes(d,bytes);out.push({filename:d.filename,data:bytes.toString('base64')});}
    return out;
  }
  async function current(tx,pkg,recipient){
    const offer=await tx.get('crmOffer:'+pkg.offerId);
    if(!offer||offer.onlineAcceptance||String(offer.number)!==pkg.offerNumber)throw fault('CRM_BINDING_INVALID',409);
    const lead=offer.leadId?await tx.get('crmLead:'+offer.leadId):null;
    const customer=offer.customerId?await tx.get('crmCustomer:'+offer.customerId):null;
    const person=lead?.email?lead:customer;
    const email=String(person?.email||'').trim().toLowerCase();
    if(!person||email!==recipient)throw fault('CRM_BINDING_INVALID',409);
    const to={...person,email};
    const pdf=makePdf({...offer,id:pkg.offerId},to,{makeRequirementsVersion:pkg.makeRequirementsVersion});
    verifyDocumentBytes(pkg.documents.find(d=>d.kind==='offer'),pdf);
    const snapshot=captureOfferSnapshot({id:pkg.offerId,offer:{...offer,id:pkg.offerId},recipient:to,to:email,attemptId:pkg.sendEventId,makeRequirementsVersion:pkg.makeRequirementsVersion},pdf);
    if(snapshot.offerSnapshotSha256!==pkg.offerSnapshotSha256)throw fault('CRM_BINDING_INVALID',409);
    return {offer,recipient:to};
  }
  async function release(pkg,recipient,context){
    if(await verifyRelease({package:structuredClone(pkg),recipient,context})!==true)throw fault('PACKAGE_RELEASE_REQUIRED',403);
  }
  async function prepare(pkgInput,recipient,context){
    const op=await operator(context),pkg=structuredClone(pkgInput);verifyOfferPackage(pkg);
    if(pkg.status!=='prepared'||!/^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(recipient||'')||
       (mode==='test')!==pkg.offerId.startsWith('test_')||
       (mode==='customer'&&pkg.documents.some(d=>d.filename.startsWith('TEST_ONLY_')||d.version.includes('TEST_ONLY'))))throw fault('PACKAGE_NOT_ELIGIBLE',409);
    await release(pkg,recipient,context);await documents(pkg);
    return transaction(async tx=>{
      const row=await tx.get(pubKey(pkg.packageId)),lock=await tx.get(lockKey(pkg.offerId));
      const c=await current(tx,pkg,recipient);
      if(c.offer.status!=='Bereit'||['sending','manual_review'].includes(c.offer.offerDispatchState)||row||lock)throw fault('PUBLICATION_CONFLICT',409);
      tx.create(pubKey(pkg.packageId),{package:pkg,recipient,state:'prepared',preparedBy:op,preparedAt:new Date(now()).toISOString()});
      return {packageId:pkg.packageId,packageSha256:pkg.packageSha256,state:'prepared',documentCount:pkg.documents.length};
    });
  }
  async function recordProof(packageId,receipt,context){
    await operator(context);
    const row=await transaction(tx=>tx.get(pubKey(packageId)));
    if(!row||row.state!=='delivery_review')throw fault('PUBLICATION_CONFLICT',409);
    const pkg=row.package;
    if(receipt?.ok!==true||receipt.eventId!==pkg.sendEventId||receipt.packageSha256!==pkg.packageSha256||! /^[A-Za-z0-9_-]{4,200}$/.test(receipt.messageId||''))throw fault('SENT_EVIDENCE_REQUIRED',409);
    const proof=structuredClone(await verifySentPackage({package:structuredClone(pkg),recipient:row.recipient,messageId:receipt.messageId}));
    if(proof?.verified!==true||proof.source!=='independent_gmail_sent_readback'||proof.sender!=='info@lszh-automations.ch'||
       !Array.isArray(proof.cc)||proof.cc.length!==0||!Array.isArray(proof.bcc)||proof.bcc.length!==0||proof.messageId!==receipt.messageId||
       proof.packageSha256!==pkg.packageSha256||proof.eventId!==pkg.sendEventId||proof.recipient!==row.recipient||
       !Number.isFinite(Date.parse(proof.verifiedAt))||Date.parse(proof.verifiedAt)>now()+30000||
       Object.keys(proof.documentHashes||{}).length!==pkg.documents.length||pkg.documents.some(d=>proof.documentHashes[d.kind]!==d.sha256))throw fault('SENT_EVIDENCE_REQUIRED',409);
    await transaction(async tx=>{
      const fresh=await tx.get(pubKey(packageId)),lock=await tx.get(lockKey(pkg.offerId));
      const c=await current(tx,pkg,row.recipient);
      if(!fresh||fresh.state!=='delivery_review'||fresh.package.packageSha256!==pkg.packageSha256||lock?.packageId!==packageId||
         c.offer.status!=='Bereit'||c.offer.offerDispatchAttemptId!==pkg.sendEventId||c.offer.offerDispatchState!=='manual_review')throw fault('PUBLICATION_CONFLICT',409);
      const sent=nextOfferPackageState({...pkg,status:'sending'},'gmail_receipt_confirmed',{providerReceiptVerified:true,eventId:pkg.sendEventId,messageId:proof.messageId});
      const date=new Date(now()).toISOString();
      tx.set(pubKey(packageId),{...fresh,package:sent,state:'sent',sentEvidence:proof});
      tx.set('crmOffer:'+pkg.offerId,{...c.offer,status:'Versendet',sentAt:date,sentTo:row.recipient,
        offerDispatchState:'confirmed',offerDispatchProviderId:proof.messageId,contractPackageId:packageId,contractPackageSha256:pkg.packageSha256});
    });
    return {packageId,state:'sent',mayAutoRetry:false,linkStillToIssue:true};
  }
  async function dispatch(packageId,context){
    const op=await operator(context),row=await transaction(tx=>tx.get(pubKey(packageId)));
    if(!row||row.state!=='prepared')throw fault('PUBLICATION_CONFLICT',409);
    await release(row.package,row.recipient,context);
    const attachments=await documents(row.package);
    const claimed=await transaction(async tx=>{
      const fresh=await tx.get(pubKey(packageId)),lock=await tx.get(lockKey(row.package.offerId));
      const c=await current(tx,row.package,row.recipient);
      if(!fresh||fresh.state!=='prepared'||lock||c.offer.status!=='Bereit'||['sending','manual_review'].includes(c.offer.offerDispatchState))throw fault('PUBLICATION_CONFLICT',409);
      tx.create(lockKey(row.package.offerId),{packageId,eventId:row.package.sendEventId,lockedAt:new Date(now()).toISOString()});
      tx.set(pubKey(packageId),{...fresh,state:'delivery_review',attemptedBy:op,attemptedAt:new Date(now()).toISOString()});
      tx.set('crmOffer:'+row.package.offerId,{...c.offer,offerDispatchState:'manual_review',offerDispatchAttemptId:row.package.sendEventId,offerDispatchTo:row.recipient});
      return c;
    });
    const mail=renderOfferEmail({...claimed.offer,id:row.package.offerId},claimed.recipient);
    try{
      await release(row.package,row.recipient,context);
      const receipt=await sendOnce({kind:'contract_package_send',sendMode:mode,from:'info@lszh-automations.ch',to:[row.recipient],cc:[],bcc:[],
        eventId:row.package.sendEventId,packageSha256:row.package.packageSha256,
        subject:(mode==='test'?'[TEST_ONLY] ':'')+mail.subject,html:mail.html,attachments});
      await transaction(async tx=>{const current=await tx.get(pubKey(packageId));if(current?.state!=='delivery_review')throw fault('PUBLICATION_CONFLICT',409);tx.set(pubKey(packageId),{...current,providerReceipt:receipt});});
      return await recordProof(packageId,receipt,context);
    }catch{return {packageId,state:'delivery_review',mayAutoRetry:false,linkStillToIssue:false};}
  }
  async function issueLink(packageId,context){
    await operator(context);const row=await transaction(tx=>tx.get(pubKey(packageId)));
    if(!row||row.state!=='sent')throw fault('SENT_EVIDENCE_REQUIRED',409);
    await release(row.package,row.recipient,context);
    return issueAcceptance(structuredClone(row.package),row.recipient,{operatorContext:context});
  }
  return Object.freeze({prepare,dispatch,reconcile:recordProof,issueLink});
}
module.exports={createContractPackagePublisher,pubKey,lockKey};
