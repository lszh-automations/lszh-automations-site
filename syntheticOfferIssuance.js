'use strict';
// OFFLINE / EMULATOR PROTOTYPE ONLY. Never import into live customer routes.
// This intentionally cannot issue any legal or deliverable business offer.
// No network IO, email, Airtable, Make, Drive access or client API here.
const crypto=require('node:crypto');
const {documentPath,SCHEMA_VERSION}=require('./stagingOfferSchema');
const {LOCK_COLLECTION,bindingFingerprint}=require('./syntheticAirtableBinding');
const RECORD_ID=/^rec[A-Za-z0-9]{14}$/;
const HEX=/^[a-f0-9]{64}$/;
const DRIVE_ID=/^[A-Za-z0-9_-]{20,100}$/;
const MAX_PDF=12*1024*1024;
const MAX_TTL_MS=7*24*60*60*1000;
class SyntheticIssueRejected extends Error {
  constructor(reason){super(reason);this.name='SyntheticIssueRejected';this.reason=reason;}
}
function deny(reason='not_eligible'){throw new SyntheticIssueRejected(reason);}
function equalHex(a,b){
  if(!HEX.test(String(a||''))||!HEX.test(String(b||'')))return false;
  return crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
function swissDay(date){
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich',
    year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
function verifySyntheticArchive(archiveBytes,requiredAvv){
  if(!archiveBytes||typeof archiveBytes!=='object')deny('unverified_archive');
  if(requiredAvv!==true&&requiredAvv!==false)deny('unverified_archive');
  const kinds=requiredAvv?['offer','terms','avv']:['offer','terms'];
  // Refuse extra/unexpected material; a later trusted Drive adapter must
  // independently verify owner, revision, content restrictions and byte hashes.
  if(Object.keys(archiveBytes).sort().join(',')!==kinds.slice().sort().join(','))
    deny('unverified_archive');
  const hashes={};
  for(const k of kinds){
    const bytes=archiveBytes[k];
    if(!Buffer.isBuffer(bytes)||bytes.length<8||bytes.length>MAX_PDF||
      bytes.subarray(0,5).toString('ascii')!=='%PDF-')
      deny('unverified_archive');
    hashes[k]=crypto.createHash('sha256').update(bytes).digest('hex');
  }
  return Object.freeze(hashes);
}
function documentMatches(doc,hash){
  return doc&&doc.mimeType==='application/pdf'&&
    doc.archiveVerified===true&&DRIVE_ID.test(String(doc.driveFileId||''))&&
    equalHex(doc.sha256,hash);
}
function checkSyntheticDraft(state,fixtureId,hashes,now,expiresAt){
  if(!state||state.schemaVersion!==SCHEMA_VERSION||state.testOnly!==true||
     state.fixtureId!==fixtureId||state.status!=='TEST_DRAFT_NOT_SENT'||
     state.acceptedAt!=null||state.issuedAt!=null||state.tokenHash!=null||
     state.expiresAt!=null||state.acceptanceEvidence!=null||
     state.reconciliationStatus!=='NOT_STARTED'||
     state.legallyApproved!==false||state.acceptanceEnabled!==false||
     state.deliveryEnabled!==false||state.deliveryConfirmed!==false||
     state.archiveVerified!==true||state.requiresManualReview!==true||
     !RECORD_ID.test(state.airtableRecordId||'')||
     state.airtableBinding?.source!=='SYNTHETIC_READ_ONLY'||
     state.airtableBinding?.schemaVersion!==1||
     typeof state.airtableBinding?.boundAt!=='string'||
     !Number.isFinite(Date.parse(state.airtableBinding.boundAt))||
     !equalHex(state.airtableBinding.fingerprint,
       bindingFingerprint(state,state.airtableRecordId))||
     !/^DEMO-OFF-[A-Za-z0-9-]{8,50}$/.test(state.offerNumber||'')||
     !/^TEST_ONLY_/.test(state.termsVersion||'')||
     !/^fake-[a-z0-9-]+@example\.invalid$/.test(state.recipientEmail||''))
    deny();
  if(state.avvRequired!==true&&state.avvRequired!==false)deny();
  if(Object.keys(hashes).length!==(state.avvRequired?3:2))deny('document_changed');
  if(!documentMatches(state.documents?.offer,hashes.offer)||
     !documentMatches(state.documents?.terms,hashes.terms))
    deny('document_changed');
  if(state.avvRequired===true&&
    (!/^TEST_ONLY_/.test(state.avvVersion||'')||
     !documentMatches(state.documents?.avv,hashes.avv)))
    deny('document_changed');
  if(state.avvRequired===false&&state.documents?.avv!=null)deny('document_changed');
  if(!/^\d{4}-\d\d-\d\d$/.test(String(state.validUntil||''))||
     !Number.isFinite(Date.parse(state.validUntil+'T12:00:00Z'))||
     new Date(state.validUntil+'T12:00:00Z').toISOString().slice(0,10)!==state.validUntil||
     swissDay(now)>state.validUntil||swissDay(expiresAt)>state.validUntil)
    deny('expired');
}
/**
 * Requires a separately verified, uniquely locked synthetic Airtable identity.
 * Synthesizes a secure 256-bit bearer token, hashes it and CAS-issues exactly
 * one synthetic fixture via a Firestore transaction. The token is generated
 * outside the retryable callback and returned only AFTER commit.
 *
 * The resulting TEST_ISSUED_NOT_DELIVERED status remains unacceptably
 * blocked in the actual claim module (expects ISSUED + legal approvals).
 * No customer-facing link, email, or legal authorization is created.
 *
 * A caller must provide local synthetic PDF bytes. THIS IS NOT a replacement
 * for a signed verified Google Drive archive in any production issuer.
 */
async function issueSyntheticOfferOnce({db,fixtureId,archiveBytes,now=new Date(),
  expiresAt=new Date(now.getTime()+24*60*60*1000),randomBytes=crypto.randomBytes,
  testMode}={}){
  // Defense in depth: never execute this synthetic writer inside Cloud Run
  // or under the real LSZH Google Cloud project identity.
  if(process.env.K_SERVICE || process.env.GOOGLE_CLOUD_PROJECT==='lszh-automations'||
    process.env.GCLOUD_PROJECT==='lszh-automations')deny('invalid_input');
  if(testMode!=='offline-or-emulator-only'||
    !/^LSZH-EMULATOR-[A-Za-z0-9_-]{12,60}$/.test(String(fixtureId||''))||
    !db||typeof db.doc!=='function'||typeof db.runTransaction!=='function'||
    !(now instanceof Date)||!Number.isFinite(now.getTime())||
    !(expiresAt instanceof Date)||!Number.isFinite(expiresAt.getTime())||
    expiresAt.getTime()-now.getTime()<5*60*1000||
    expiresAt.getTime()-now.getTime()>MAX_TTL_MS||
    typeof randomBytes!=='function')deny('invalid_input');
  // The archive is locally simulated. Compute all proof hashes before starting
  // a retryable transaction. Absolutely no network I/O inside callback.
  const hashes=verifySyntheticArchive(archiveBytes,
    Object.prototype.hasOwnProperty.call(archiveBytes||{},'avv'));
  const secret=randomBytes(32);
  if(!Buffer.isBuffer(secret)||secret.length!==32)deny('invalid_entropy');
  const token=secret.toString('base64url');
  const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
  const ref=db.doc(documentPath(fixtureId));
  const result=await db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists)deny();
    const state=snap.data();
    // Binding is a separate Firestore document. Read it INSIDE the SAME
    // transaction, before any writes, to protect against lost/raced links.
    if(!RECORD_ID.test(state?.airtableRecordId||''))deny('binding_missing');
    const lock=await tx.get(db.doc(LOCK_COLLECTION+'/'+state.airtableRecordId));
    if(!lock.exists)deny('binding_missing');
    const bound=lock.data();
    if(bound?.fixtureId!==fixtureId||bound.recordId!==state.airtableRecordId||
       bound.syntheticOnly!==true||
       bound.boundAt!==state.airtableBinding?.boundAt||
       !equalHex(bound.fingerprint,state.airtableBinding?.fingerprint))
      deny('binding_mismatch');
    if(state?.status==='TEST_ISSUED_NOT_DELIVERED'||state?.tokenHash!=null)
      deny('already_issued');
    checkSyntheticDraft(state,fixtureId,hashes,now,expiresAt);
    tx.update(ref,{status:'TEST_ISSUED_NOT_DELIVERED',
      tokenHash,issuedAt:now.toISOString(),expiresAt:expiresAt.toISOString(),
      deliveryConfirmed:false,deliveryEnabled:false,acceptanceEnabled:false,
      reconciliationStatus:'NOT_STARTED'});
    return {issued:true,offerNumber:state.offerNumber};
  });
  // The plaintext token is not stored in Firestore, logs, URLs or elsewhere.
  // If the response is lost, this prototype offers no automatic retry;
  // a future issuer needs audited revocation/reissue + delivery outbox.
  return Object.freeze({...result,token,expiresAt:expiresAt.toISOString()});
}
module.exports={issueSyntheticOfferOnce,SyntheticIssueRejected};
