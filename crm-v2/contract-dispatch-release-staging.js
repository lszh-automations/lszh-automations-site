'use strict';
// PHASE C / STAGING-ONLY. Pure dispatch approval/byte-verification boundary.
// No Make, Gmail, Firestore, network, CRM route, or production send operation.
// Never use a browser-provided "operatorVerified" flag as an authorisation.
const {createHmac,timingSafeEqual}=require('node:crypto');
const {verifyOfferPackage,verifyDocumentBytes}=require('./offer-contract-package');

const PURPOSE='TEST_ONLY_CONTRACT_DISPATCH';
const COLLECTION='lszh_crm_v2_contract_dispatch_staging_v1';
const WINDOW_MS=15*60*1000;
function blocked(reason,status=403){
  return Object.assign(new Error('Contract staging dispatch blocked: '+reason),{
    code:'CONTRACT_STAGING_DISPATCH_BLOCKED',status
  });
}
function email(value){
  if(typeof value!=='string'||value!==value.trim()||value.includes('*')||
     !/^[A-Za-z0-9.!#$%&'*+/=?^_\u0060{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(value)||
     value.length>254||/[\r\n]/.test(value))
    throw blocked('invalid email address');
  return value.toLowerCase();
}
function hash(value){
  if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))
    throw blocked('invalid SHA-256');
  return value;
}
function id(value){
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(value))
    throw blocked('invalid approval ID');
  return value;
}
function isObject(v){
  return v!==null&&typeof v==='object'&&!Array.isArray(v)&&
    (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
}
function exact(obj,keys){
  if(!isObject(obj)||Object.keys(obj).some(k=>!keys.includes(k)))
    throw blocked('unknown or malformed fields');
}
function keyBytes(key){
  if(!Buffer.isBuffer(key)||key.length<32)throw blocked('missing server signing secret');
  return key;
}
function canonical(manifest){
  exact(manifest,[
    'schemaVersion','purpose','packageId','eventId','packageSha256',
    'offerId','offerNumber','revision','offerSnapshotSha256','recipient',
    'operatorEmail','approvalId','approvedAt','documents','avvRequired',
    'signature'
  ]);
  const {signature,...fields}=manifest;
  if(fields.schemaVersion!==1||fields.purpose!==PURPOSE||
     typeof fields.packageId!=='string'||typeof fields.eventId!=='string'||
     fields.eventId!=='contract_send_'+fields.packageId||
     !/^pkg_[A-Za-z0-9_-]{1,100}_r[1-9][0-9]{0,6}$/.test(fields.packageId))
    throw blocked('package or event identity');
  hash(fields.packageSha256);hash(fields.offerSnapshotSha256);
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(fields.offerId||'')||
     !/^[0-9]{1,10}$/.test(fields.offerNumber||'')||
     !Number.isSafeInteger(fields.revision)||fields.revision<1||
     fields.packageId!=='pkg_'+fields.offerId+'_r'+fields.revision)
    throw blocked('offer revision mismatch');
  fields.recipient=email(fields.recipient);
  fields.operatorEmail=email(fields.operatorEmail);
  id(fields.approvalId);
  if(typeof fields.approvedAt!=='string'||
     !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(fields.approvedAt)||
     !Number.isFinite(Date.parse(fields.approvedAt)))
    throw blocked('approval date invalid');
  if(!['yes','no'].includes(fields.avvRequired))throw blocked('AVV classification');
  const kinds=fields.avvRequired==='yes'?['offer','terms','avv']:['offer','terms'];
  if(!Array.isArray(fields.documents)||fields.documents.length!==kinds.length)
    throw blocked('document count');
  fields.documents.forEach((d,i)=>{
    exact(d,['kind','version','filename','archiveFileId','sha256','bytes']);
    if(d.kind!==kinds[i]||typeof d.version!=='string'||!d.version.includes('TEST_ONLY')||
       typeof d.filename!=='string'||!/^TEST_ONLY_[A-Za-z0-9_.-]+\.pdf$/.test(d.filename)||
       typeof d.archiveFileId!=='string'||!/^test_[A-Za-z0-9_-]{5,160}$/.test(d.archiveFileId)||
       !Number.isSafeInteger(d.bytes)||d.bytes<10||d.bytes>5_000_000)
      throw blocked('real or malformed document refused');
    hash(d.sha256);
  });
  if(new Set(fields.documents.map(d=>d.archiveFileId)).size!==kinds.length||
     new Set(fields.documents.map(d=>d.sha256)).size!==kinds.length)
    throw blocked('duplicate documents');
  return JSON.stringify({
    schemaVersion:fields.schemaVersion,purpose:fields.purpose,packageId:fields.packageId,
    eventId:fields.eventId,packageSha256:fields.packageSha256,
    offerId:fields.offerId,offerNumber:fields.offerNumber,revision:fields.revision,
    offerSnapshotSha256:fields.offerSnapshotSha256,recipient:fields.recipient,
    operatorEmail:fields.operatorEmail,approvalId:fields.approvalId,
    approvedAt:fields.approvedAt,avvRequired:fields.avvRequired,
    documents:fields.documents.map(d=>({
      kind:d.kind,version:d.version,filename:d.filename,archiveFileId:d.archiveFileId,
      sha256:d.sha256,bytes:d.bytes
    }))
  });
}
function signatureFor(manifest,secret){
  return createHmac('sha256',keyBytes(secret)).update(canonical(manifest)).digest('hex');
}
function verifyReleaseManifest(manifest,secret){
  const sig=hash(manifest?.signature);
  const expected=signatureFor(manifest,secret);
  if(!timingSafeEqual(Buffer.from(sig,'hex'),Buffer.from(expected,'hex')))
    throw blocked('dispatch signature invalid');
  return manifest;
}
function createContractReleaseGate(config={}){
  // All configuration comes from trusted backend, never from an HTTP request.
  const {
    signingSecret,allowedOperators,allowedRecipients,authorizeOperator,
    readArchivedPdf,now=()=>Date.now()
  }=config;
  keyBytes(signingSecret);
  if(!Array.isArray(allowedOperators)||!allowedOperators.length||
     !Array.isArray(allowedRecipients)||!allowedRecipients.length||
     typeof authorizeOperator!=='function'||typeof readArchivedPdf!=='function'||
     typeof now!=='function')
    throw blocked('staging configuration incomplete');
  const operators=new Set(allowedOperators.map(email));
  const recipients=new Set(allowedRecipients.map(email));
  if([...recipients].some(v=>v.endsWith('.invalid')))
    throw blocked('test recipient cannot be an invalid domain');
  async function approve(pkg,request){
    verifyOfferPackage(pkg);
    if(pkg.status!=='prepared')throw blocked('package is no longer prepared');
    exact(request,['purpose','recipient','operatorEmail','approvalId','approvedAt']);
    if(request.purpose!==PURPOSE)throw blocked('explicit test purpose required');
    const recipient=email(request.recipient);
    const operatorEmail=email(request.operatorEmail);
    if(!recipients.has(recipient)||!operators.has(operatorEmail))
      throw blocked('recipient or operator not on exact allowlist');
    const approvalId=id(request.approvalId);
    const approvedAt=String(request.approvedAt||'');
    const parsed=Date.parse(approvedAt),clock=now();
    if(!Number.isFinite(parsed)||!Number.isFinite(clock)||
       parsed>clock+30_000||clock-parsed>WINDOW_MS||
       new Date(parsed).toISOString()!==approvedAt)
      throw blocked('approval must be recent and server timestamp canonical');
    const authorized=await authorizeOperator({
      operatorEmail,approvalId,packageId:pkg.packageId,
      packageSha256:pkg.packageSha256,recipient
    });
    if(authorized!==true)throw blocked('backend authorisation refused');
    // Archival data is pulled from a trusted server-side test-only reader.
    // Do not persist PDF bytes, callbacks, request secrets or HTML to Firestore.
    for(const doc of pkg.documents){
      if(!doc.filename.startsWith('TEST_ONLY_')||
         !doc.version.includes('TEST_ONLY')||
         !doc.archiveFileId.startsWith('test_'))
        throw blocked('real customer or contract PDF refused');
      const bytes=await readArchivedPdf(doc.archiveFileId,doc);
      verifyDocumentBytes(doc,bytes);
    }
    const manifest={
      schemaVersion:1,purpose:PURPOSE,
      packageId:pkg.packageId,eventId:pkg.sendEventId,
      packageSha256:pkg.packageSha256,offerId:pkg.offerId,
      offerNumber:pkg.offerNumber,revision:pkg.revision,
      offerSnapshotSha256:pkg.offerSnapshotSha256,recipient,
      operatorEmail,approvalId,approvedAt,avvRequired:pkg.avvRequired,
      documents:pkg.documents.map(d=>({
        kind:d.kind,version:d.version,filename:d.filename,
        archiveFileId:d.archiveFileId,sha256:d.sha256,bytes:d.bytes
      }))
    };
    return Object.freeze({...manifest,signature:signatureFor(manifest,signingSecret)});
  }
  return Object.freeze({approve});
}
module.exports={PURPOSE,COLLECTION,WINDOW_MS,blocked,canonical,
  createContractReleaseGate,verifyReleaseManifest};
