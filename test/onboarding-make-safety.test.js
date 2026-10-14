'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const run=new Function('input',fs.readFileSync(path.resolve(__dirname,'../scripts/onboarding-intake.make.js'),'utf8'));
const input=()=>({
 project_code:'ob_aaaaaaaa-bbbb-cccc-dddd-000000000001',
 company:'Test "GmbH" <Sanitär>',project_name:'Onboarding <Automation> & CRM',
 project_contact:'Anna O\'Neil <Vertrieb>',contact_email:'test@example.invalid',
 make_account_status:'Make-Organisation vorhanden',make_organization:'"E2E" <NOT A REAL ORG>',
 make_invitation_status:'Einladung versendet',sensitive_data:'Unsicher',approver:'Testperson',
 billing_street:'Musterstrasse "42"\nWohlen',billing_postal_code:'5610',
 billing_city:'Wohlen',billing_country:'Schweiz',billing_email:'billing@example.invalid'
});
test('Make direct webhook re-encodes user strings as valid JSON and HTML',()=>{
 const data=run(input());
 assert.equal(data.validated,true);
 assert.equal(JSON.parse(data.orderPatchJson).fields['Make-Organisation'],'"E2E" <NOT A REAL ORG>');
 assert.equal(JSON.parse(data.customerPatchJson).fields.Rechnungsstrasse,'Musterstrasse "42"\nWohlen');
 assert.match(data.contactHtml,/&#39;/);
 assert.ok(!data.contactHtml.includes('<Vertrieb>'));
 assert.match(data.projectHtml,/&lt;Automation&gt;/);
 assert.ok(!data.orderPatchJson.includes('Make-Zugriff bestätigt'));
});
test('Make direct hook denies invalid token, bad dropdowns, oversized inputs',()=>{
 for(const data of [
 {...input(),project_code:"ob_------------------------------------"},
 {...input(),contact_email:"not-email"},
 {...input(),make_invitation_status:"Einladung bestätigt"},
 {...input(),make_account_status:"Org Owner"},
 {...input(),sensitive_data:"Maybe"},
 {...input(),make_organization:"x".repeat(161)},
 {...input(),company:""}
 ])assert.throws(()=>run(data));
});
