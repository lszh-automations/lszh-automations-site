'use strict';
// SYNTHETIC OFFLINE/EMULATOR ONLY. No Airtable SDK/API and NO customer writes.
// Trusted server-side record reader is injected by tests. No remote side effects
// in Firestore transaction callbacks. This is NOT production issuance/acceptance.
const crypto=require('node:crypto');
const {documentPath,SCHEMA_VERSION}=require('./stagingOfferSchema');
const RE_RECORD=/^rec[A-Za-z0-9]{14}$/;
const RE_FIX=/^LSZH-EMULATOR-[A-Za-z0-9_-]{12,60}$/;
const HEX=/^[a-f0-9]{64}$/;
const DRIVE=/^[A-Za-z0-9_-]{20,100}$/;
const LOCK_COLLECTION='stagingAirtableBindings';
class SyntheticBindingRejected extends Error {
 constructor(reason){super(reason);this.name='SyntheticBindingRejected';this.reason=reason;}
}
function deny(reason='not_eligible'){throw new SyntheticBindingRejected(reason);}
function closedGate({testMode,fixtureId,airtableRecordId,db,readRecord,now}){
 if(process.env.K_SERVICE||process.env.GOOGLE_CLOUD_PROJECT==='lszh-automations'||
    process.env.GCLOUD_PROJECT==='lszh-automations')deny('not_test_environment');
 if(testMode!=='offline-or-emulator-only'||!RE_FIX.test(String(fixtureId||''))||
   !RE_RECORD.test(String(airtableRecordId||''))||typeof readRecord!=='function'||
   !db||typeof db.doc!=='function'||typeof db.runTransaction!=='function'||
   !(now instanceof Date)||!Number.isFinite(now.getTime()))deny('invalid_input');
}
function recipient(fields){
 const value=fields?.['Lead E-Mail'];
 if(!Array.isArray(value)||value.length!==1||typeof value[0]!=='string')deny('record_mismatch');
 return value[0].trim().toLowerCase();
}
function stable(fields,state){
 if(fields?.Status!=='Entwurf'||
    fields['Offertennummer']!==state.offerNumber||
    fields['Projektbedingungen Version']!==state.termsVersion||
    fields['Gültig bis']!==state.validUntil||
    !/^fake-[a-z0-9-]+@example\.invalid$/.test(state.recipientEmail||'')||
    recipient(fields)!==state.recipientEmail||
    !['Ja','Nein'].includes(fields['AVV erforderlich'])||
    (fields['AVV erforderlich']==='Ja')!==state.avvRequired||
    fields['Vertragsunterlagen akzeptiert']===true||
    fields['Online-Annahme Zeitstempel']||
    fields['Online-Annahme Token-Hash']||
    fields['Online-Annahme rechtlich freigegeben']===true||
    fields['Vertragsunterlagen versendet']===true)
    deny('record_mismatch');
 const specs=[
  ['offer','Online-Annahme Offerten-SHA256','Online-Annahme Offerten Drive ID'],
  ['terms','Online-Annahme Bedingungen-SHA256','Online-Annahme Bedingungen Drive ID'],
  ...(state.avvRequired===true?[['avv','Online-Annahme AVV-SHA256','Online-Annahme AVV Drive ID']]:[])
 ];
 for(const [kind,hashKey,idKey]of specs){
   const d=state.documents?.[kind];
   if(!d||d.mimeType!=='application/pdf'||!HEX.test(d.sha256||'')||
      !DRIVE.test(d.driveFileId||'')||
      fields[hashKey]!==d.sha256||fields[idKey]!==d.driveFileId)
      deny('record_mismatch');
 }
 if(state.avvRequired===true){
   if(!/^TEST_ONLY_/.test(state.avvVersion||'')||
      fields['Online-Annahme AVV-Version']!==state.avvVersion)
      deny('record_mismatch');
 }else if(state.documents?.avv!=null||
    fields['Online-Annahme AVV Drive ID']||
    fields['Online-Annahme AVV-SHA256']||
    fields['Online-Annahme AVV-Version'])
    deny('record_mismatch');
}
function validState(state,fixtureId){
 if(!state||state.schemaVersion!==SCHEMA_VERSION||
    state.testOnly!==true||state.fixtureId!==fixtureId||
    state.status!=='TEST_DRAFT_NOT_SENT'||
    state.legallyApproved!==false||state.acceptanceEnabled!==false||
    state.deliveryEnabled!==false||state.deliveryConfirmed!==false||
    state.requiresManualReview!==true||
    state.tokenHash!=null||state.issuedAt!=null||state.expiresAt!=null||
    state.acceptedAt!=null||state.acceptanceEvidence!=null||
    state.reconciliationStatus!=='NOT_STARTED'||
    state.airtableRecordId!=null||state.airtableBinding!=null||
    !/^DEMO-OFF-[A-Za-z0-9-]{8,50}$/.test(state.offerNumber||'')||
    !/^fake-[a-z0-9-]+@example\.invalid$/.test(state.recipientEmail||'')||
    !/^TEST_ONLY_/.test(state.termsVersion||''))deny('not_eligible');
}
function fingerprint(state,fields,recordId){
 const d=state.documents;
 const data={fixtureId:state.fixtureId,recordId,offerNumber:state.offerNumber,
   recipient:state.recipientEmail,validUntil:state.validUntil,
   termsVersion:state.termsVersion,avvRequired:state.avvRequired,
   avvVersion:state.avvRequired?state.avvVersion:null,
   documents:{offer:[d.offer.sha256,d.offer.driveFileId],
     terms:[d.terms.sha256,d.terms.driveFileId],
     ...(state.avvRequired?{avv:[d.avv.sha256,d.avv.driveFileId]}:{})}};
 return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}
async function bindSyntheticAirtableRecordOnce({db,fixtureId,airtableRecordId,
  readRecord,testMode,now=new Date()}={}){
 closedGate({testMode,fixtureId,airtableRecordId,db,readRecord,now});
 // READ ONLY, once and BEFORE the retryable Firestore transaction.
 // A production implementation must use an authenticated trusted server reader,
 // verify freshness, and recheck drift before issuance or acceptance.
 const remote=await readRecord(airtableRecordId);
 if(!remote||remote.id!==airtableRecordId||!remote.fields||
    typeof remote.fields!=='object'||Array.isArray(remote.fields))
    deny('record_mismatch');
 const offerRef=db.doc(documentPath(fixtureId));
 const bindingRef=db.doc(LOCK_COLLECTION+'/'+airtableRecordId);
 return db.runTransaction(async tx=>{
   // Both reads MUST happen before any writes (Firestore transaction semantics).
   const snap=await tx.get(offerRef);
   const guard=await tx.get(bindingRef);
   if(!snap.exists)deny('not_eligible');
   const state=snap.data();
   if(state?.airtableRecordId!=null||state?.airtableBinding!=null)
     deny('already_bound');
   validState(state,fixtureId);
   if(guard.exists)deny('record_already_bound');
   stable(remote.fields,state);
   const digest=fingerprint(state,remote.fields,airtableRecordId);
   const timestamp=now.toISOString();
   tx.create(bindingRef,{fixtureId,recordId:airtableRecordId,
     fingerprint:digest,boundAt:timestamp,syntheticOnly:true});
   tx.update(offerRef,{airtableRecordId,
     airtableBinding:{fingerprint:digest,boundAt:timestamp,
       source:'SYNTHETIC_READ_ONLY',schemaVersion:1}});
   return {bound:true,fixtureId,recordId:airtableRecordId,
     fingerprint:digest,remoteWritePerformed:false};
 });
}
module.exports={bindSyntheticAirtableRecordOnce,SyntheticBindingRejected,LOCK_COLLECTION};
