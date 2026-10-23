'use strict';

// Strictly validated, append-only CRM contact entries. These are manually
// recorded interactions, never outbound emails or automated follow-ups.
const CHANNELS=Object.freeze(['Telefon','E-Mail','Besprechung','Sonstiges']);
const OUTCOMES=Object.freeze(['Erreicht','Nicht erreicht','Nachricht gesendet']);
const MAX_CONTACTS=100;

function bad(message){throw Object.assign(new Error(message),{status:400});}
function validateContact(payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload))bad('Ungültiger Kontakt');
  if(Object.keys(payload).some(key=>!['channel','outcome','note'].includes(key)))
    bad('Unbekanntes Kontaktfeld');
  const {channel,outcome,note}=payload;
  if(!CHANNELS.includes(channel))bad('Kontaktart ungültig');
  if(!OUTCOMES.includes(outcome))bad('Kontaktergebnis ungültig');
  if(typeof note!=='string'||!note.trim()||note.length>1500)
    bad('Eine Gesprächsnotiz mit maximal 1500 Zeichen ist erforderlich');
  return {channel,outcome,note:note.trim()};
}
function shouldMarkContacted(outcome){return outcome==='Erreicht'||outcome==='Nachricht gesendet';}
function followUpFields(input){
  const date=input.followUpDate||'';
  const action=input.nextAction||'';
  if(date){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||
       Number.isNaN(Date.parse(date+'T12:00:00Z'))||
       new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)
      bad('Ungültiges Wiedervorlagedatum');
    if(!action)bad('Für eine Wiedervorlage ist eine nächste Aktion erforderlich');
  }
  if(action&&!date)bad('Bitte ein Wiedervorlagetermin zur nächsten Aktion wählen');
}
function offerDescription(lead){
  const fields=[
    ['Anfrage',lead.message],
    ['Heutiger Ablauf',lead.currentProcess],
    ['Beteiligte Systeme',lead.systems],
    ['Grösstes Problem',lead.mainProblem],
    ['Häufigkeit',lead.frequency],
    ['Gewünschtes Ergebnis',lead.desiredResult],
    ['Budgetrahmen',lead.budgetRange],
    ['Qualifizierungsnotizen',lead.qualificationNotes]
  ];
  // No artificial content, no automated re-writes of existing offers.
  return fields.filter(([,value])=>typeof value==='string'&&value.trim())
    .map(([label,value])=>label+': '+value.trim()).join('\n\n').slice(0,5000);
}
module.exports={CHANNELS,OUTCOMES,MAX_CONTACTS,validateContact,shouldMarkContacted,followUpFields,offerDescription};
