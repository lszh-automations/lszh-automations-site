'use strict';
// Backend-only acceptance boundary. No mail, live CRM import or implicit win().
const {randomBytes,createHmac,timingSafeEqual}=require('node:crypto');
const {digest,verifyOfferPackage,verifyDocumentBytes}=require('./offer-contract-package');
const TEXT_VERSION='TEST_ONLY_ACCEPTANCE_v1_20261025';
const DECLARATIONS=Object.freeze({
  terms:'Ich habe die Offerte und die Projektbedingungen gelesen und stimme diesen Dokumentversionen zu.',
  avv:'Ich stimme der aufgeführten AVV einschliesslich ihrer zugehörigen Anlagen ausdrücklich zu.',
  representative:'Ich bestätige, zur Abgabe dieser Erklärung berechtigt zu sein.'
});
const EMAIL=/^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
function fault(code,status=400){return Object.assign(new Error(code),{code,status});}
function exact(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value)||
     Object.keys(value).some(k=>!keys.includes(k)))throw fault('INVALID_REQUEST');
}
function tokenHash(token){
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token)||
     Buffer.from(token,'base64url').toString('base64url')!==token)throw fault('LINK_INVALID',404);
  return digest(Buffer.from(token));
}
function createContractAcceptance({store,readArchivedPdf,verifySentPackage,
  authorizeIssue,resolveIdentity,verifyRepresentative,csrfSecret,now=()=>Date.now(),mode='test'}={}){
  if(!store||['issue','resolve','consume'].some(k=>typeof store[k]!=='function')||
     [readArchivedPdf,verifySentPackage,authorizeIssue,resolveIdentity,verifyRepresentative,now].some(f=>typeof f!=='function')||
     !Buffer.isBuffer(csrfSecret)||csrfSecret.length<32)throw fault('BACKEND_NOT_CONFIGURED',503);
  if(!['test','customer'].includes(mode))throw fault('BACKEND_NOT_CONFIGURED',503);
  const testOnly=mode==='test',textVersion=testOnly?TEXT_VERSION:'CUSTOMER_ACCEPTANCE_v1_20261025';
  const secret=Buffer.from(csrfSecret);
  const clock=()=>{const time=now();if(!Number.isSafeInteger(time)||time<0)throw fault('INVALID_CLOCK',503);return time;};
  async function validateArchive(pkg){
    for(const doc of pkg.documents){
      try{verifyDocumentBytes(doc,await readArchivedPdf(doc.archiveFileId,structuredClone(doc)));}
      catch{throw fault('DOCUMENT_INTEGRITY_FAILED',409);}
    }
  }
  async function issue(pkgInput,recipient,{expiresInMs=48*3600000,operatorContext}={}){
    const pkg=structuredClone(pkgInput);
    verifyOfferPackage(pkg);
    // This first implementation deliberately accepts synthetic documents only.
    if(pkg.status!=='sent'||testOnly&&(!pkg.offerId.startsWith('test_')||
       pkg.documents.some(d=>!d.filename.startsWith('TEST_ONLY_')||!d.version.includes('TEST_ONLY')))||
       !testOnly&&(pkg.offerId.startsWith('test_')||pkg.documents.some(d=>d.filename.startsWith('TEST_ONLY_')))||
       typeof recipient!=='string'||!EMAIL.test(recipient)||
       !Number.isSafeInteger(expiresInMs)||expiresInMs<60000||expiresInMs>72*3600000)
      throw fault('PACKAGE_NOT_ELIGIBLE',409);
    if(await authorizeIssue({package:structuredClone(pkg),recipient,operatorContext})!==true)
      throw fault('ISSUE_NOT_AUTHORISED',403);
    const proof=await verifySentPackage({package:structuredClone(pkg),recipient});
    if(proof?.verified!==true||proof.eventId!==pkg.sendEventId||
       proof.packageSha256!==pkg.packageSha256||proof.recipient!==recipient||
       proof.provider!=='gmail'||!Number.isFinite(Date.parse(proof.verifiedAt))||
       Date.parse(proof.verifiedAt)>clock()+30000||
       !/^[A-Za-z0-9_-]{4,200}$/.test(proof.messageId||''))throw fault('SENT_EVIDENCE_REQUIRED',409);
    await validateArchive(pkg);
    const time=clock(),token=randomBytes(32).toString('base64url'),hash=tokenHash(token);
    const invitation={tokenHash:hash,packageId:pkg.packageId,packageSha256:pkg.packageSha256,
      recipient,createdAt:time,expiresAt:time+expiresInMs,used:false};
    const record={package:pkg,recipient,sentProof:{messageId:proof.messageId,
      eventId:proof.eventId,packageSha256:proof.packageSha256,verifiedAt:proof.verifiedAt,
      referencedAt:new Date(time).toISOString()}};
    await store.issue(record,invitation);
    return Object.freeze({token,expiresAt:new Date(invitation.expiresAt).toISOString(),packageId:pkg.packageId});
  }
  async function authorised(token,context){
    const hash=tokenHash(token),record=await store.resolve(hash,clock());
    const identity=await resolveIdentity(context);
    if(!identity||identity.email!==record.invitation.recipient||identity.emailVerified!==true||
       typeof identity.subject!=='string'||identity.subject.length<4||identity.subject.length>200||
       !Number.isSafeInteger(identity.verifiedAt)||identity.verifiedAt>clock()+30000||
       identity.verifiedAt<clock()-15*60000||
       !(testOnly?['verified_session','test_only_session']:['verified_session']).includes(identity.method))throw fault('IDENTITY_REQUIRED',401);
    const principal={email:identity.email,emailVerified:true,subject:identity.subject,method:identity.method,verifiedAt:identity.verifiedAt};
    const csrf=createHmac('sha256',secret).update(hash+'|'+principal.subject).digest('base64url');
    return {...record,hash,principal,csrf};
  }
  async function preview(token,context){
    const r=await authorised(token,context),pkg=r.record.package;
    await validateArchive(pkg);
    return {testOnly,packageId:pkg.packageId,offerNumber:pkg.offerNumber,revision:pkg.revision,
      packageSha256:pkg.packageSha256,recipient:r.principal.email,avvRequired:pkg.avvRequired==='yes',
      expiresAt:new Date(r.invitation.expiresAt).toISOString(),csrf:r.csrf,
      declarations:DECLARATIONS,textVersion,
      documents:pkg.documents.map(({kind,version,filename,bytes})=>({kind,version,filename,bytes}))};
  }
  async function download(token,kind,context){
    if(!['offer','terms','avv'].includes(kind))throw fault('DOCUMENT_NOT_FOUND',404);
    const r=await authorised(token,context),doc=r.record.package.documents.find(d=>d.kind===kind);
    if(!doc)throw fault('DOCUMENT_NOT_FOUND',404);
    const bytes=await readArchivedPdf(doc.archiveFileId,structuredClone(doc));
    try{verifyDocumentBytes(doc,bytes);}catch{throw fault('DOCUMENT_INTEGRITY_FAILED',409);}
    return {filename:doc.filename,bytes:Buffer.from(bytes)};
  }
  async function accept(token,bodyInput,context,csrfHeader){
    const body=structuredClone(bodyInput);
    exact(body,['packageSha256','revision','termsConsent','avvConsent','representativeDeclaration']);
    const r=await authorised(token,context),pkg=r.record.package;
    if(typeof csrfHeader!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(csrfHeader)||
       !timingSafeEqual(Buffer.from(csrfHeader),Buffer.from(r.csrf)))throw fault('CSRF_REJECTED',403);
    if(body.packageSha256!==pkg.packageSha256||body.revision!==pkg.revision)
      throw fault('DOCUMENT_VERSION_CHANGED',409);
    if(body.termsConsent!==true||body.representativeDeclaration!==true||
       typeof body.avvConsent!=='boolean'||body.avvConsent!==(pkg.avvRequired==='yes'))
      throw fault('EXPLICIT_CONSENT_REQUIRED');
    if(await verifyRepresentative({identity:structuredClone(r.principal),package:structuredClone(pkg),context})!==true)
      throw fault('REPRESENTATIVE_NOT_VERIFIED',403);
    await validateArchive(pkg);
    const time=clock(),responseId='response_'+randomBytes(16).toString('hex');
    const evidence={kind:testOnly?'TEST_ONLY_CUSTOMER_ACCEPTANCE':'CUSTOMER_ACCEPTANCE',schemaVersion:1,responseId,
      packageId:pkg.packageId,packageSha256:pkg.packageSha256,revision:pkg.revision,
      invitationHash:r.hash,recipient:r.invitation.recipient,
      identity:r.principal,representativeVerified:true,portalTokenVerified:true,
      explicitTermsConsent:true,explicitAvvConsent:body.avvConsent,
      representativeDeclaration:true,textVersion,declarations:{
        terms:DECLARATIONS.terms,representative:DECLARATIONS.representative,
        ...(pkg.avvRequired==='yes'?{avv:DECLARATIONS.avv}:{})},
      documentHashes:Object.fromEntries(pkg.documents.map(d=>[d.kind,d.sha256])),
      documents:structuredClone(pkg.documents),sentProof:structuredClone(r.record.sentProof),
      acceptedAt:new Date(time).toISOString(),state:'customer_response_recorded',
      nextAction:'internal_review',writtenLszhConfirmationRequired:true};
    await store.consume(r.hash,evidence,time);
    return {responseId,acceptedAt:evidence.acceptedAt,state:evidence.state,
      nextAction:'internal_review',testOnly,writtenLszhConfirmationRequired:true};
  }
  return Object.freeze({issue,preview,download,accept});
}
module.exports={createContractAcceptance,tokenHash,fault,DECLARATIONS,TEXT_VERSION};
