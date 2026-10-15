'use strict';
// Offline-tested transaction component. NOT wired to HTTP, Make, Airtable or live Cloud Run.
// Dependency injection: caller provides a Firestore client later, after explicit staging approval.
const crypto=require('node:crypto');
const {SCHEMA_VERSION,isStagingPath}=require('./stagingOfferSchema');
const {LOCK_COLLECTION,bindingFingerprint}=require('./syntheticAirtableBinding');
const {fetchSyntheticReadback,verifySyntheticReadback}=require('./syntheticAirtableReadback');
const RECORD_ID=/^rec[A-Za-z0-9]{14}$/;
const DRIVE_ID=/^[A-Za-z0-9_-]{20,100}$/;
const HEX64=/^[a-f0-9]{64}$/;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
class ClaimRejected extends Error {
  constructor(reason){super(reason);this.name='ClaimRejected';this.reason=reason;}
}
function check(ok){if(!ok)throw new ClaimRejected('invalid_input');}
function equalHash(a,b){
  if(!HEX64.test(String(a||''))||!HEX64.test(String(b||'')))return false;
  return crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
const email=s=>String(s||'').trim().toLowerCase();
function eligible(state,documentPath,expected,actor,now){
  if(!state||state.schemaVersion!==SCHEMA_VERSION||state.testOnly!==true||
    !isStagingPath(documentPath)||documentPath!=='stagingOfferFixtures/'+state.fixtureId||
    state.status!=='ISSUED'||state.acceptanceEnabled!==true||
    state.legallyApproved!==true||state.deliveryConfirmed!==true||
    state.archiveVerified!==true||state.acceptedAt!=null||
    typeof state.expiresAt!=='string'||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(state.expiresAt)||
    !Number.isFinite(Date.parse(state.expiresAt))||Date.parse(state.expiresAt)<=now.getTime())
    throw new ClaimRejected('not_eligible');
  if(state.avvRequired!==true&&state.avvRequired!==false)
    throw new ClaimRejected('not_eligible');
  // All expected hashes MUST be verified against independently retrieved archive bytes by caller.
  const verifiedPdf=(kind,hash)=>{
    const doc=state.documents?.[kind];
    return doc?.mimeType==='application/pdf'&&doc?.archiveVerified===true&&
      DRIVE_ID.test(doc.driveFileId||'')&&equalHash(doc.sha256,hash);
  };
  if(!equalHash(state.tokenHash,expected.tokenHash)||
    !verifiedPdf('offer',expected.quoteSha256)||
    !verifiedPdf('terms',expected.termsSha256)||
    state.termsVersion!==expected.termsVersion||
    state.offerNumber!==expected.offerNumber||
    email(state.recipientEmail)!==email(actor.email))
    throw new ClaimRejected('document_changed');
  if(state.avvRequired===true&&
    (!verifiedPdf('avv',expected.avvSha256)||
     state.avvVersion!==expected.avvVersion||actor.acceptAvv!==true))
    throw new ClaimRejected('document_changed');
}
/*
 * Proposed future adapter: Firestore db.doc(path) and
 * db.runTransaction(async tx => { await tx.get(ref); tx.update(ref, data) }).
 * IMPORTANT: caller MUST independently authenticate, rate-limit, verify
 * archived PDF bytes from an INDEPENDENT trusted source and legally authorized
 * offering before calling. Never trust a client-supplied PDF hash alone.
 * NO network calls or other side effects inside the transaction callback;
 * Firestore might retry that callback on conflicts.
 * Firestore is the acceptance source of truth; an asynchronous reconciliation
 * worker must copy the result to Airtable safely, not the other way around.
 */
async function claimOfferOnce({db,documentPath,expected,actor,now=new Date(),
  airtableRecordId,readRecord}){
  check(db&&typeof db.doc==='function'&&typeof db.runTransaction==='function');
  // Staging-only path. NOT a live customer-acceptance endpoint.
  check(isStagingPath(documentPath));
  check(expected&&[expected.tokenHash,expected.quoteSha256,expected.termsSha256]
    .every(x=>HEX64.test(String(x||''))));
  check(typeof expected.offerNumber==='string'&&expected.offerNumber.length>5&&
    typeof expected.termsVersion==='string'&&expected.termsVersion.length>0);
  check(actor&&typeof actor.name==='string'&&actor.name.trim().length>=4&&
    actor.name.trim().length<=120&&EMAIL.test(email(actor.email))&&
    actor.authorized===true&&actor.acceptTerms===true);
  check(now instanceof Date&&Number.isFinite(now.getTime()));
  check(RECORD_ID.test(String(airtableRecordId||''))&&typeof readRecord==='function');
  // Trusted server-only fresh GET happens before the retryable Firestore tx.
  const readback=await fetchSyntheticReadback(readRecord,airtableRecordId)
    .catch(()=>{throw new ClaimRejected('readback_unavailable');});
  const ref=db.doc(documentPath);
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists)throw new ClaimRejected('not_eligible');
    const state=snap.data();
    if(state?.status==='ACCEPTED'||state?.acceptedAt!=null)
      throw new ClaimRejected('already_processed');
    eligible(state,documentPath,expected,actor,now);
    // A CRM record supplied by a browser or offer number is insufficient.
    // Demand the pre-existing, unique Airtable binding inside the SAME transaction.
    if(state.airtableRecordId!==airtableRecordId||
       !RECORD_ID.test(state.airtableRecordId||'')||
       state.airtableBinding?.source!=='SYNTHETIC_READ_ONLY'||
       state.airtableBinding?.schemaVersion!==1)
      throw new ClaimRejected('binding_missing');
    const lock=await tx.get(db.doc(LOCK_COLLECTION+'/'+state.airtableRecordId));
    if(!lock.exists)throw new ClaimRejected('binding_missing');
    const bound=lock.data();
    const currentFingerprint=bindingFingerprint(state,state.airtableRecordId);
    if(bound?.fixtureId!==state.fixtureId||bound?.recordId!==state.airtableRecordId||
       bound?.syntheticOnly!==true||
       bound?.boundAt!==state.airtableBinding.boundAt||
       !equalHash(bound.fingerprint,state.airtableBinding.fingerprint)||
       !equalHash(currentFingerprint,state.airtableBinding.fingerprint))
      throw new ClaimRejected('binding_mismatch');
    try{verifySyntheticReadback(state,readback,'acceptance');}
    catch{throw new ClaimRejected('readback_mismatch');}
    const evidence={
      acceptedAt:now.toISOString(),
      actorName:actor.name.trim().replace(/\s+/g,' '),
      actorEmail:email(actor.email),
      authorized:true,acceptedTerms:true,
      acceptedAvv:state.avvRequired===true,
      offerNumber:state.offerNumber,
      termsVersion:state.termsVersion,
      quoteSha256:state.documents.offer.sha256,
      termsSha256:state.documents.terms.sha256,
      ...(state.avvRequired===true?
        {avvSha256:state.documents.avv.sha256,avvVersion:state.avvVersion}:{}),
      reconciliationStatus:'PENDING'
    };
    tx.update(ref,{status:'ACCEPTED',acceptedAt:now.toISOString(),
      acceptanceEvidence:evidence,reconciliationStatus:'PENDING'});
    return {accepted:true,offerNumber:state.offerNumber,reconciliationStatus:'PENDING'};
  });
}
module.exports={claimOfferOnce,ClaimRejected};
