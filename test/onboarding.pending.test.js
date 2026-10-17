'use strict';
// UI-only synthetic test. Never contacts Make, Airtable, Render or real customers.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('onboarding/index.html','utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length,1,'one onboarding script expected');
async function simulate(statusCode){
 const nodes=new Map(), requests=[];
 const element=id=>{
  if(!nodes.has(id)){
   const listeners=new Map(), button={disabled:false,textContent:'Onboarding übermitteln'};
   nodes.set(id,{value:'',textContent:'',style:{},listeners,disabled:false,
     dataset:{makeWebhook:'/api/onboarding'},resetCount:0,
     classList:{remove(){}},addEventListener(type,cb){listeners.set(type,cb);},
     querySelector(selector){assert.equal(selector,'button[type="submit"]');return button;},
     reset(){this.resetCount++;},button});
  }
  return nodes.get(id);
 };
 const code='ob_12345678-1234-4234-8234-123456789abc';
 class FormDataMock {
  constructor(form){assert.equal(form,element('onboardingForm'));}
  *entries(){yield ['company','Test GmbH'];yield ['contact_email','test@example.invalid'];
   yield ['make_account_status','Noch nicht eingerichtet'];
   yield ['make_invitation_status','Noch nicht gesendet'];
   yield ['project_code',code];}
 }
 const ctx={location:{search:'?code='+code},URLSearchParams,FormData:FormDataMock,
  document:{getElementById:element},
  fetch:async(url,opts)=>{
   requests.push({url,method:opts.method,headers:opts.headers,body:JSON.parse(opts.body)});
   return {ok:statusCode>=200&&statusCode<300,status:statusCode};
  },Date,JSON,Object,Error};
 vm.runInNewContext(scripts[0][1],ctx,{filename:'onboarding/index.html'});
 const form=element('onboardingForm');
 const cb=form.listeners.get('submit');
 assert.equal(typeof cb,'function');
 await cb({preventDefault(){},currentTarget:form});
 return {form,status:element('status'),requests};
}
test('HTTP 202 is provisional receipt, never completed storage or promised email',async()=>{
 const r=await simulate(202);
 assert.equal(r.requests.length,1);
 assert.equal(r.requests[0].url,'/api/onboarding');
 assert.equal(r.requests[0].method,'POST');
 assert.equal(r.requests[0].body.project_code,'ob_12345678-1234-4234-8234-123456789abc');
 assert.match(r.status.textContent,/zur Verarbeitung entgegengenommen/);
 assert.match(r.status.textContent,/Speicherung ist noch nicht bestätigt/);
 assert.match(r.status.textContent,/Bitte senden Sie das Formular nicht erneut ab/);
 assert.doesNotMatch(r.status.textContent,/Sie erhalten eine Bestätigung per E-Mail/);
 assert.equal(r.form.resetCount,1);
 assert.equal(r.form.button.disabled,false);
});
test('HTTP 200 confirmed result remains distinct from pending result',async()=>{
 const r=await simulate(200);
 assert.match(r.status.textContent,/erfolgreich übermittelt/);
 assert.doesNotMatch(r.status.textContent,/noch nicht bestätigt/);
 assert.equal(r.form.resetCount,1);
});
test('HTTP 409 duplicate does not reset form or imply processing success',async()=>{
 const r=await simulate(409);
 assert.match(r.status.textContent,/bereits eingereicht oder wird gerade verarbeitet/);
 assert.equal(r.form.resetCount,0);
 assert.equal(r.form.button.disabled,false);
 assert.equal(r.status.style.color,'#b42318');
});
