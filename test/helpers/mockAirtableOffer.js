'use strict';
// All responses deliberately fake. Do not use in a live runtime.
function mockAirtableOffer(state,stage='issuance'){
 if(stage!=='issuance'&&stage!=='acceptance')throw Error('invalid_test_stage');
 const delivered=stage==='acceptance';
 const d=state.documents||{};
 const fields={
  Status:delivered?'Versendet':'Entwurf',
  'Offertennummer':state.offerNumber,'Projektbedingungen Version':state.termsVersion,
  'Gültig bis':state.validUntil,'Lead E-Mail':[state.recipientEmail],
  'AVV erforderlich':state.avvRequired===true?'Ja':'Nein',
  'Vertragsunterlagen versendet':delivered,
  'Vertragsunterlagen akzeptiert':false,
  'Online-Annahme rechtlich freigegeben':delivered,
  'Online-Annahme Offerten-SHA256':d.offer?.sha256,
  'Online-Annahme Offerten Drive ID':d.offer?.driveFileId,
  'Online-Annahme Bedingungen-SHA256':d.terms?.sha256,
  'Online-Annahme Bedingungen Drive ID':d.terms?.driveFileId,
  'Online-Annahme Token-Hash':delivered?state.tokenHash:undefined,
  'Online-Annahme Link gesendet am':delivered?'2026-10-15T10:30:00.000Z':undefined
 };
 if(state.avvRequired===true){
  fields['Online-Annahme AVV-SHA256']=d.avv?.sha256;
  fields['Online-Annahme AVV Drive ID']=d.avv?.driveFileId;
  fields['Online-Annahme AVV-Version']=state.avvVersion;
 }
 return {id:state.airtableRecordId,fields};
}
module.exports={mockAirtableOffer};
