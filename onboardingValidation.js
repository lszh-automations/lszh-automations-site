'use strict';
// Pure validation. This MUST NOT issue Make invitations, send emails or change Airtable.
const tokenRE=/^ob_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const emailRE=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const makeAccounts=new Set(['Make-Organisation vorhanden','Make-Konto vorhanden – Organisation unklar','Noch kein Make-Konto','Unterstützung gewünscht']);
const makeInvites=new Set(['Noch nicht eingeladen','Einladung versendet','Unterstützung bei Einladung gewünscht','Noch nicht möglich']);
const sensitive=new Set(['Ja','Nein','Unsicher']);
const fields={
 company:160, project_name:180, project_contact:160, contact_email:254,
 contact_phone:80,technical_contact:160,technical_email:254,
 billing_street:180,billing_postal_code:32,billing_city:130,
 billing_country:100,billing_email:254,
 systems:2500,rules:4000,exceptions:3500,connections:2500,
 make_account_status:100,make_organization:160,make_invitation_status:120,
 make_setup_notes:1200,sensitive_data:20,data_notes:2500,
 approver:160,notes:3500
};
const required=new Set(['company','project_name','project_contact','contact_email',
  'make_account_status','make_invitation_status','sensitive_data','approver']);
function validateOnboarding(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('invalid_fields');
  if(typeof input.project_code!=='string'||!tokenRE.test(input.project_code))throw Error('invalid_project_link');
  const clean={project_code:input.project_code};
  for(const [name,limit] of Object.entries(fields)){
    const value=input[name];
    if(value!==undefined&&typeof value!=='string')throw Error('invalid_fields');
    const v=(value||'').trim();
    if(v.length>limit||(required.has(name)&&!v))throw Error('invalid_fields');
    clean[name]=v;
  }
  for(const name of ['contact_email','technical_email','billing_email']){
    if(clean[name]&&!emailRE.test(clean[name]))throw Error('invalid_fields');
  }
  if(!makeAccounts.has(clean.make_account_status)||
     !makeInvites.has(clean.make_invitation_status)||
     !sensitive.has(clean.sensitive_data))throw Error('invalid_fields');
  // A client-selected invitation status is a self-report, never verification of access.
  clean.source='LSZH Kunden-Onboarding';
  clean.submitted_at=new Date().toISOString();
  return clean;
}
module.exports={validateOnboarding,tokenRE};
