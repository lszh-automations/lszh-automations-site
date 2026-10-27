'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const script=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
test('monthly HTTP actions require operator, POST, same origin, explicit confirmation and separate scheduler identity',async()=>{
  const calls=[];
  const allowed='crm-operator@lszh-automations.ch',mailbox='private-invoice-test@example.ch';
  const mocks={
    'node:http':http,'node:fs':fs,'node:path':path,'node:crypto':crypto,
    'google-auth-library':{OAuth2Client:class{
      async verifyIdToken({idToken}){
        if(!['valid-operator','valid-scheduler','wrong-scheduler'].includes(idToken))throw Error('not_authorised');
        return {getPayload:()=>({email:idToken==='valid-scheduler'?'billing@example.invalid':idToken==='wrong-scheduler'?'other@example.invalid':allowed,hd:'lszh-automations.ch',email_verified:true})};
      }
    }},
    '@google-cloud/firestore':{Firestore:class{}},
    './lead-ingest':{saveWebsiteLead:async()=>{throw Error('unexpected_ingest')}},
    './cloud-records':{buildStore:()=>({monthlyBillingStatus:async id=>({eligible:true}),activateMonthlyBilling:async(id,input,user)=>{calls.push({id,email:user.email,input});return {plan:{state:'active'}};},pauseMonthlyBilling:async()=>({plan:{state:'paused'}}),monthlyBillingTick:async user=>{calls.push({tick:true,email:user.email});return {processed:0,errors:0};}})},
    './mail-dispatcher':{makeDispatcher:()=>({stats:()=>({enabled:false})})},
    './offer-send':{createOfferSender:()=>({stats:()=>({enabled:true,mode:'production',testTo:''})})},
    './offer-preview':{renderOfferPreview:()=>''},
    './invoice-preview':{renderInvoicePreview:()=>''}
  };
  const fakeProcess={env:{
    CRM_BILLING_SCHEDULER_EMAIL:'billing@example.invalid',CRM_BILLING_SCHEDULER_AUDIENCE:'https://crm.example.invalid/api/internal/billing/tick',
    GOOGLE_OAUTH_CLIENT_ID:'fake-test-client.apps.googleusercontent.com',
    CRM_ALLOWED_EMAILS:allowed,
    CRM_RECORD_PREFIX:'lszh_crm_v2_',
    CRM_INVOICE_MAIL_ENABLED:'true',
    CRM_INVOICE_MAIL_PRODUCTION_APPROVED:'true',
    CRM_INVOICE_MAIL_MODE:'test_only',
    CRM_INVOICE_MAIL_TEST_TO:mailbox,
    CRM_INVOICE_MAIL_WEBHOOK_URL:'https://hook.eu1.make.com/Example123TEST',
    CRM_INVOICE_IBAN:'CH9300762011623852957'
  }};
  const m={exports:{}};
  new Function('require','module','exports','process','__dirname',script)(
    name=>{if(!Object.hasOwn(mocks,name))throw Error('unexpected module '+name);return mocks[name];},
    m,m.exports,fakeProcess,path.join(__dirname,'..')
  );
  const server=m.exports.createApp();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const url=base+'/api/records/projekte/TEST_ONLY_project/monthly-billing/activate';
    assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,401);
    const headers={Authorization:'Bearer valid-operator','Content-Type':'application/json'};
    assert.equal((await fetch(url,{headers})).status,405);
    assert.equal((await fetch(url,{method:'POST',headers:{...headers,Origin:'https://other.example.invalid'},body:'{}'})).status,403);
    const response=await fetch(url,{method:'POST',headers:{...headers,Origin:base},body:JSON.stringify({startDate:'2026-10-27',reviewed:true,externalBillingChecked:true})});assert.equal(response.status,200);assert.equal(calls.length,1);
    const tick=base+'/api/internal/billing/tick';assert.equal((await fetch(tick,{method:'POST'})).status,401);assert.equal((await fetch(tick,{method:'POST',headers:{Authorization:'Bearer valid-operator'}})).status,403);assert.equal((await fetch(tick,{method:'POST',headers:{Authorization:'Bearer wrong-scheduler'}})).status,403);assert.equal((await fetch(tick,{method:'POST',headers:{Authorization:'Bearer valid-scheduler'}})).status,200);assert.equal(calls.at(-1).tick,true);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
