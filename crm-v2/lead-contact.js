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
    ['Gewünschtes Ergebnis',lead.desiredResult]
  ];
  // Internal budget and qualification notes NEVER enter customer-facing quotes.
  // No artificial content, no automated re-writes of existing offers.
  return fields.filter(([,value])=>typeof value==='string'&&value.trim())
    .map(([label,value])=>label+': '+value.trim()).join('\n\n').slice(0,5000);
}
function leadColourTime(lead,nowMs=Date.now()){
  if(lead?.status==='Neu'||!lead?.status)return nowMs;
  const saved=Date.parse(lead.urgencyFrozenAt||'');
  if(Number.isFinite(saved))return saved;
  const contacts=(lead.contactHistory||[]).filter(c=>shouldMarkContacted(c.outcome)&&Number.isFinite(Date.parse(c.createdAt))).map(c=>Date.parse(c.createdAt));
  const known=contacts.length?Math.min(...contacts):Date.parse(lead.updatedAt||'');
  const start=Date.parse(lead.createdAt||'');
  return Number.isFinite(known)?known:Number.isFinite(start)?start:nowMs;
}
function freezeLeadUrgency(before,nextStatus,date){
  if(nextStatus==='Neu'||Number.isFinite(Date.parse(before?.urgencyFrozenAt||'')))return {};
  return {urgencyFrozenAt:before?.status==='Neu'?date:new Date(leadColourTime(before,Date.parse(date))).toISOString()};
}
module.exports={leadColourTime,freezeLeadUrgency,CHANNELS,OUTCOMES,MAX_CONTACTS,validateContact,shouldMarkContacted,followUpFields,offerDescription};
