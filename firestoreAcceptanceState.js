'use strict';
// Offline-tested transaction component. NOT wired to HTTP, Make, Airtable or live Cloud Run.
// Dependency injection: caller provides a Firestore client later, after explicit staging approval.
const crypto=require('node:crypto');
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
function eligible(state,expected,actor,now){
  if(!state||state.status!=='ISSUED'||state.acceptanceEnabled!==true||
    state.legallyApproved!==true||state.deliveryConfirmed!==true||
    state.archiveVerified!==true||state.acceptedAt!=null||
    typeof state.expiresAt!=='string'||!Number.isFinite(Date.parse(state.expiresAt))||
    Date.parse(state.expiresAt)<now.getTime())
      throw new ClaimRejected('not_eligible');
  if(!equalHash(state.tokenHash,expected.tokenHash)||
    !equalHash(state.documents?.offer?.sha256,expected.quoteSha256)||
    !equalHash(state.documents?.terms?.sha256,expected.termsSha256)||
    state.termsVersion!==expected.termsVersion||
    state.offerNumber!==expected.offerNumber||
    email(state.recipientEmail)!==email(actor.email))
      throw new ClaimRejected('document_changed');
  if(state.avvRequired===true&&
    (!equalHash(state.documents?.avv?.sha256,expected.avvSha256)||
     state.avvVersion!==expected.avvVersion||actor.acceptAvv!==true))
      throw new ClaimRejected('document_changed');
  if(state.avvRequired!==true&&state.avvRequired!==false)
    throw new ClaimRejected('not_eligible');
}
/*
 * Proposed future adapter: Firestore db.doc(path) and
 * db.runTransaction(async tx => { await tx.get(ref); tx.update(ref, data) }).
 * IMPORTANT: caller MUST independently authenticate, rate-limit, verify
 * archived PDF bytes, and check legally authorized offering before calling.
 * NO network calls or other side effects inside the transaction callback;
 * Firestore might retry that callback on conflicts.
 * Firestore is the acceptance source of truth; an asynchronous reconciliation
 * worker must copy the result to Airtable safely, not the other way around.
 */
async function claimOfferOnce({db,documentPath,expected,actor,now=new Date()}){
  check(db&&typeof db.doc==='function'&&typeof db.runTransaction==='function');
  // Staging-only path. NOT a live customer-acceptance endpoint.
  check(/^stagingOfferFixtures\/[A-Za-z0-9_-]{10,100}$/.test(documentPath||''));
  check(expected&&[expected.tokenHash,expected.quoteSha256,expected.termsSha256]
    .every(x=>HEX64.test(String(x||''))));
  check(typeof expected.offerNumber==='string'&&expected.offerNumber.length>5&&
    typeof expected.termsVersion==='string'&&expected.termsVersion.length>0);
  check(actor&&typeof actor.name==='string'&&actor.name.trim().length>=4&&
    actor.name.trim().length<=120&&EMAIL.test(email(actor.email))&&
    actor.authorized===true&&actor.acceptTerms===true);
  check(now instanceof Date&&Number.isFinite(now.getTime()));
  const ref=db.doc(documentPath);
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists)throw new ClaimRejected('not_eligible');
    const state=snap.data();
    if(state?.status==='ACCEPTED'||state?.acceptedAt!=null)
      throw new ClaimRejected('already_processed');
    eligible(state,expected,actor,now);
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
