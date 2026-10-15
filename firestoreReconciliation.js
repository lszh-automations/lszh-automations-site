'use strict';
// SYNTHETIC OFFLINE / FIRESTORE EMULATOR COMPONENT ONLY.
// NEVER connect to Airtable, Make, Gmail or any production Cloud Run endpoint.
// Only the state machine below is transactional; remote side effects MUST remain
// outside Firestore callbacks. Cross-system "exactly once" is NOT guaranteed.
const crypto=require('node:crypto');
const {SCHEMA_VERSION,isStagingPath}=require('./stagingOfferSchema');
const RE_SHA=/^[a-f0-9]{64}$/;
const RE_REC=/^rec[A-Za-z0-9]{14}$/;
const RE_FIX=/^LSZH-EMULATOR-[A-Za-z0-9_-]{12,60}$/;
const LEASE_MS=120000;
class ReconciliationRejected extends Error{
 constructor(reason){super(reason);this.name='ReconciliationRejected';this.reason=reason;}
}
function deny(reason='not_eligible'){throw new ReconciliationRejected(reason);}
function liveGuard(){
 if(process.env.K_SERVICE||process.env.GOOGLE_CLOUD_PROJECT==='lszh-automations'||
    process.env.GCLOUD_PROJECT==='lszh-automations')deny('not_test_environment');
}
function checkArgs(db,documentPath,testMode,now){
 liveGuard();
 if(testMode!=='offline-or-emulator-only'||
   !db||typeof db.doc!=='function'||typeof db.runTransaction!=='function'||
   !isStagingPath(documentPath)||!RE_FIX.test(documentPath.split('/')[1])||
   !(now instanceof Date)||!Number.isFinite(now.getTime()))
   deny('invalid_input');
}
function matchesAccepted(state,documentPath){
 const id=documentPath.split('/')[1];
 const e=state?.acceptanceEvidence;
 if(!state||state.schemaVersion!==SCHEMA_VERSION||state.testOnly!==true||
   state.fixtureId!==id||state.status!=='ACCEPTED'||
   state.legallyApproved!==true||state.acceptanceEnabled!==true||
   state.deliveryConfirmed!==true||state.archiveVerified!==true||
   !RE_REC.test(state.airtableRecordId||'')||
   typeof state.acceptedAt!=='string'||
   !Number.isFinite(Date.parse(state.acceptedAt))||!e||
   state.acceptedAt!==e.acceptedAt||
   !e.authorized||!e.acceptedTerms||typeof e.actorName!=='string'||
   e.actorName.trim().length<4||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.actorEmail||'')||
   e.offerNumber!==state.offerNumber||e.termsVersion!==state.termsVersion||
   e.acceptedAvv!==state.avvRequired)return false;
 const docs=['offer','terms',...(state.avvRequired===true?['avv']:[])];
 if(state.avvRequired!==true&&state.avvRequired!==false)return false;
 for(const k of docs){
   const doc=state.documents?.[k];
   const proof=k==='offer'?e.quoteSha256:k==='terms'?e.termsSha256:e.avvSha256;
   if(doc?.mimeType!=='application/pdf'||doc.archiveVerified!==true||
      !RE_SHA.test(doc.sha256||'')||doc.sha256!==proof)return false;
 }
 return state.avvRequired!==true||e.avvVersion===state.avvVersion;
}
// Stable, privacy-minimal dedupe ID; no token, raw IP, customer email or full name.
function eventId(state,documentPath){
 if(!matchesAccepted(state,documentPath))deny();
 const e=state.acceptanceEvidence;
 const digest=[documentPath,state.airtableRecordId,e.acceptedAt,
   e.quoteSha256,e.termsSha256,e.avvSha256||'',e.termsVersion].join('|');
 return 'lszh-staging-accept-'+crypto.createHash('sha256').update(digest).digest('hex');
}
function previewAirtableAcceptance(state,documentPath){
 const e=state?.acceptanceEvidence;
 const id=eventId(state,documentPath);
 const evidence={schema:'LSZH_STAGING_RECONCILIATION_V1',source:'FIRESTORE_EMULATOR_ONLY',
   eventId:id,acceptedAt:e.acceptedAt,offerNumber:e.offerNumber,
   quoteSha256:e.quoteSha256,termsSha256:e.termsSha256,
   termsVersion:e.termsVersion,acceptedTerms:true,authorized:true,
   acceptedAvv:state.avvRequired===true,
   ...(state.avvRequired===true?{avvVersion:e.avvVersion,avvSha256:e.avvSha256}:{})};
 // This object is a DRY-RUN preview only, never passed to a live Airtable API.
 return Object.freeze({mode:'OFFLINE_PREVIEW_ONLY',recordId:state.airtableRecordId,eventId:id,
   fields:{
     Status:'Angenommen','Vertragsunterlagen akzeptiert':true,
     'Online-Annahme Zeitstempel':e.acceptedAt,
     'Online-Annahme Person':e.actorName,
     'Online-Annahme E-Mail':e.actorEmail,
     'Online-Annahme Vertragsversion':e.termsVersion,
     'Online-Annahme AVV ausdrücklich akzeptiert':state.avvRequired===true,
     'Online-Annahme Nachweis':JSON.stringify(evidence)
   },mailEnabled:false,makeEnabled:false});
}
// Compare a previously fetched read-only remote record. If the response is
// uncertain or already accepted by a different process, block for human review.
function compareRemote(fields,preview){
 if(!fields||typeof fields!=='object'||!preview||preview.mode!=='OFFLINE_PREVIEW_ONLY')
   return 'MANUAL_REVIEW';
 const target=preview.fields;
 let existing;
 try{existing=JSON.parse(String(fields['Online-Annahme Nachweis']||''));}
 catch{existing=null;}
 if(existing?.eventId===preview.eventId){
   const same=['Status','Vertragsunterlagen akzeptiert','Online-Annahme Zeitstempel',
     'Online-Annahme Person','Online-Annahme E-Mail',
     'Online-Annahme Vertragsversion','Online-Annahme AVV ausdrücklich akzeptiert']
     .every(k=>fields[k]===target[k]);
   return same?'ALREADY_APPLIED':'MANUAL_REVIEW';
 }
 // Existing acceptance of any kind is not overwritten.
 if(fields.Status==='Angenommen'||fields['Vertragsunterlagen akzeptiert']===true||
   fields['Online-Annahme Zeitstempel']||existing?.eventId)
   return 'MANUAL_REVIEW';
 if(fields.Status==='Versendet'&&fields['Vertragsunterlagen akzeptiert']!==true&&
   !fields['Online-Annahme Zeitstempel']&&
   fields['Offertennummer']===existingOfferNumber(preview))
   return 'PREVIEW_ONLY';
 return 'MANUAL_REVIEW';
}
function existingOfferNumber(preview){
 return JSON.parse(preview.fields['Online-Annahme Nachweis']).offerNumber;
}
async function acquireLease({db,documentPath,testMode,now=new Date(),randomBytes=crypto.randomBytes}={}){
 checkArgs(db,documentPath,testMode,now);
 if(typeof randomBytes!=='function')deny('invalid_input');
 const token=randomBytes(16);
 if(!Buffer.isBuffer(token)||token.length!==16)deny('invalid_entropy');
 const leaseId=token.toString('hex');
 const ref=db.doc(documentPath);
 return db.runTransaction(async tx=>{
   const snap=await tx.get(ref);
   if(!snap.exists)deny();
   const state=snap.data();
   if(!matchesAccepted(state,documentPath))deny();
   if(state.reconciliationStatus==='SYNCED')deny('already_synced');
   if(state.reconciliationStatus==='NEEDS_REVIEW')deny('manual_review_required');
   if(state.reconciliationStatus==='LEASED'){
     if(Number.isFinite(Date.parse(state.reconciliationLease?.expiresAt||''))&&
        Date.parse(state.reconciliationLease.expiresAt)>now.getTime())
       deny('busy');
     // Remote PATCH may have succeeded before the worker died. Never auto-repeat!
     tx.update(ref,{reconciliationStatus:'NEEDS_REVIEW',
       reconciliationLease:null,
       reconciliationReviewReason:'LEASE_OUTCOME_UNKNOWN'});
     return {acquired:false,manualReviewRequired:true};
   }
   if(state.reconciliationStatus!=='PENDING'||state.reconciliationLease!=null)
     deny('not_eligible');
   const expiresAt=new Date(now.getTime()+LEASE_MS).toISOString();
   const evt=eventId(state,documentPath);
   tx.update(ref,{reconciliationStatus:'LEASED',
     reconciliationLease:{id:leaseId,eventId:evt,expiresAt},
     reconciliationAttempts:(Number.isSafeInteger(state.reconciliationAttempts)?
       state.reconciliationAttempts:0)+1});
   return {acquired:true,leaseId,eventId:evt,expiresAt};
 });
}
async function completeAfterVerifiedRemote({db,documentPath,testMode,leaseId,remoteFields,
  now=new Date()}={}){
 checkArgs(db,documentPath,testMode,now);
 if(!/^[a-f0-9]{32}$/.test(String(leaseId||'')))deny('invalid_input');
 const ref=db.doc(documentPath);
 return db.runTransaction(async tx=>{
   const snap=await tx.get(ref);
   if(!snap.exists)deny();
   const s=snap.data();
   if(!matchesAccepted(s,documentPath)||s.reconciliationStatus!=='LEASED'||
     s.reconciliationLease?.id!==leaseId||
     s.reconciliationLease?.eventId!==eventId(s,documentPath))
     deny('stale_lease');
   if(Date.parse(s.reconciliationLease.expiresAt)<=now.getTime())
     deny('lease_expired');
   const preview=previewAirtableAcceptance(s,documentPath);
   if(compareRemote(remoteFields,preview)!=='ALREADY_APPLIED')
     deny('remote_unverified');
   tx.update(ref,{reconciliationStatus:'SYNCED',reconciliationLease:null,
     reconciliationEventId:preview.eventId,reconciledAt:now.toISOString()});
   return {synced:true,eventId:preview.eventId,sendConfirmation:false};
 });
}
module.exports={ReconciliationRejected,eventId,previewAirtableAcceptance,compareRemote,
 acquireLease,completeAfterVerifiedRemote};
