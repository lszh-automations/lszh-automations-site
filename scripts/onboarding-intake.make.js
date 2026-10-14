// LSZH Make Webhook intake: validate even when requests bypass the website proxy.
// Do NOT send invitations, set Make-Zugriff bestaetigt, or approve contracts.
const limits={
 company:160,project_name:180,project_contact:160,contact_email:254,
 contact_phone:80,technical_contact:160,technical_email:254,
 billing_street:180,billing_postal_code:32,billing_city:130,
 billing_country:100,billing_email:254,systems:2500,rules:4000,
 exceptions:3500,connections:2500,make_account_status:100,
 make_organization:160,make_invitation_status:120,make_setup_notes:1200,
 sensitive_data:20,data_notes:2500,approver:160,notes:3500
};
const validToken=/^ob_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const required=new Set(['company','project_name','project_contact','contact_email',
  'make_account_status','make_invitation_status','sensitive_data','approver']);
const choices={
 make_account_status:['Make-Organisation vorhanden','Make-Konto vorhanden – Organisation unklar','Noch kein Make-Konto','Unterstützung gewünscht'],
 make_invitation_status:['Noch nicht eingeladen','Einladung versendet','Unterstützung bei Einladung gewünscht','Noch nicht möglich'],
 sensitive_data:['Ja','Nein','Unsicher']
};
if(!validToken.test(String(input.project_code||'')))throw Error('INVALID_ONBOARDING_TOKEN');
const data={};
for(const [key,limit] of Object.entries(limits)){
 const raw=input[key];
 if(raw!=null && typeof raw!=='string')throw Error('INVALID_ONBOARDING_FIELD_'+key);
 const v=String(raw||'').trim();
 if(v.length>limit || (required.has(key)&&!v))throw Error('INVALID_ONBOARDING_FIELD_'+key);
 data[key]=v;
}
for(const key of ['contact_email','billing_email','technical_email']){
 if(data[key]&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(data[key]))
  throw Error('INVALID_ONBOARDING_EMAIL_'+key);
}
for(const [key,values] of Object.entries(choices)){
 if(!values.includes(data[key]))throw Error('INVALID_ONBOARDING_CHOICE_'+key);
}
const html=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
 .replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/\r\n|\r|\n/g,'<br>');
return {
 contactHtml:html(data.project_contact),
 projectHtml:html(data.project_name),
 accountStatus:data.make_account_status,
 inviteStatus:data.make_invitation_status,
 orderPatchJson:JSON.stringify({fields:{
   'Verbindungen erforderlich':true,'AVV erforderlich':'Prüfen',
   'Make-Kontostatus':data.make_account_status,
   'Make-Organisation':data.make_organization,
   'Make-Einladungsstatus':data.make_invitation_status
 }}),
 customerPatchJson:JSON.stringify({fields:{
   'Rechnungsstrasse':data.billing_street,
   'Rechnungs-PLZ':data.billing_postal_code,
   'Rechnungsort':data.billing_city,
   'Rechnungsland':data.billing_country,
   'Rechnungs-E-Mail':data.billing_email
 }}),
 validated:true
};