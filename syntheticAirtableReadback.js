'use strict';
// SYNTHETIC TEST ONLY. This does NOT grant authority to issue or accept offers.
// Compare a newly acquired, trusted, server-side read-only Airtable snapshot
// against the pinned Firestore offer within the Firestore transaction.
// The snapshot can become stale AFTER the read (no cross-system atomicity).
const {bindingFingerprint}=require('./syntheticAirtableBinding');
const RECORD=/^rec[A-Za-z0-9]{14}$/;
const SHA=/^[a-f0-9]{64}$/;
class SyntheticReadbackRejected extends Error {
  constructor(reason='readback_mismatch'){super(reason);this.name='SyntheticReadbackRejected';this.reason=reason;}
}
const reject=(reason='readback_mismatch')=>{throw new SyntheticReadbackRejected(reason);};
function syntheticGate(){
  if(process.env.K_SERVICE||process.env.GOOGLE_CLOUD_PROJECT==='lszh-automations'||
     process.env.GCLOUD_PROJECT==='lszh-automations')reject('not_test_environment');
}
async function fetchSyntheticReadback(readRecord,recordId){
  syntheticGate();
  if(typeof readRecord!=='function'||!RECORD.test(String(recordId||'')))
    reject('readback_unavailable');
  let record;
  try{record=await readRecord(recordId);}
  catch{reject('readback_unavailable');}
  if(!record||record.id!==recordId||!record.fields||
     typeof record.fields!=='object'||Array.isArray(record.fields))
    reject('readback_unavailable');
  return {id:recordId,fields:structuredClone(record.fields)};
}
function verifySyntheticReadback(state,record,stage){
  syntheticGate();
  if(stage!=='issuance'&&stage!=='acceptance')reject();
  const fields=record?.fields;
  if(!state||state.testOnly!==true||state.fixtureId?.startsWith('LSZH-EMULATOR-')!==true||
     !RECORD.test(state.airtableRecordId||'')||record?.id!==state.airtableRecordId||
     !fields||typeof fields!=='object'||Array.isArray(fields)||
     state.airtableBinding?.source!=='SYNTHETIC_READ_ONLY'||
     state.airtableBinding.schemaVersion!==1||
     !SHA.test(state.airtableBinding.fingerprint||'')||
     state.airtableBinding.fingerprint!==bindingFingerprint(state,state.airtableRecordId))
    reject();
  const recipient=fields['Lead E-Mail'];
  if(!Array.isArray(recipient)||recipient.length!==1||
     typeof recipient[0]!=='string'||
     recipient[0].trim().toLowerCase()!==state.recipientEmail||
     !/^fake-[a-z0-9-]+@example\.invalid$/.test(state.recipientEmail||'')||
     fields.Offertennummer!==state.offerNumber||
     fields['Projektbedingungen Version']!==state.termsVersion||
     fields['Gültig bis']!==state.validUntil||
     (fields['AVV erforderlich']!=='Ja'&&fields['AVV erforderlich']!=='Nein')||
     (fields['AVV erforderlich']==='Ja')!==state.avvRequired)
    reject();
  const required=['offer','terms',...(state.avvRequired===true?['avv']:[])];
  const names={
    offer:['Online-Annahme Offerten-SHA256','Online-Annahme Offerten Drive ID'],
    terms:['Online-Annahme Bedingungen-SHA256','Online-Annahme Bedingungen Drive ID'],
    avv:['Online-Annahme AVV-SHA256','Online-Annahme AVV Drive ID']
  };
  for(const k of required){
    const doc=state.documents?.[k];
    const [sha,id]=names[k];
    if(doc?.mimeType!=='application/pdf'||doc?.archiveVerified!==true||
      !SHA.test(doc.sha256||'')||fields[sha]!==doc.sha256||
      !doc.driveFileId||fields[id]!==doc.driveFileId)reject();
  }
  if(state.avvRequired===true){
    if(fields['Online-Annahme AVV-Version']!==state.avvVersion)reject();
  }else if(state.documents?.avv!=null||fields[names.avv[0]]||
    fields[names.avv[1]]||fields['Online-Annahme AVV-Version'])reject();
  if(fields['Vertragsunterlagen akzeptiert']===true||
     fields['Online-Annahme Zeitstempel']||
     fields['Online-Annahme Nachweis']||
     fields['Online-Annahme AVV ausdrücklich akzeptiert']===true||
     fields['Online-Annahme Bestätigung gesendet am'])reject();
  if(stage==='issuance'){
    if(fields.Status!=='Entwurf'||
       fields['Vertragsunterlagen versendet']===true||
       fields['Online-Annahme rechtlich freigegeben']===true||
       fields['Online-Annahme Token-Hash']||
       fields['Online-Annahme Link gesendet am'])reject();
  }else{
    // This is ONLY a hypothetical fully-approved synthetic fixture in tests.
    // No real approval is inferred from a checkbox by the application.
    if(fields.Status!=='Versendet'||
       fields['Vertragsunterlagen versendet']!==true||
       fields['Online-Annahme rechtlich freigegeben']!==true||
       fields['Online-Annahme Token-Hash']!==state.tokenHash||
       !SHA.test(state.tokenHash||'')||
       !fields['Online-Annahme Link gesendet am']||
       !Number.isFinite(Date.parse(fields['Online-Annahme Link gesendet am']))||
       state.legallyApproved!==true||state.deliveryConfirmed!==true||
       state.acceptanceEnabled!==true)reject();
  }
  return true;
}
module.exports={SyntheticReadbackRejected,fetchSyntheticReadback,verifySyntheticReadback};
